// Organizar: o Synquei vigia a pasta de um projeto do SOBEDESCE (Backup Automático) e, a cada cartão que termina de
// passar, entrega os arquivos novos à página, que reconhece, sincroniza e manda para o DaVinci (desktop/davinci.cjs).
//
// De onde vem cada cartão:
//  1. <projeto>/.sobedesce/descargas.jsonl (o SOBEDESCE grava uma linha por cartão): diária, dono, câmera, a pasta do
//     cartão e os arquivos. Lido do ponto onde parou (offset guardado), só as linhas inteiras.
//  2. Sem esse arquivo (SOBEDESCE antigo ou pasta copiada à mão): a estrutura Diária NN/Cenas/<Dono>/Cartão NN com o
//     relatório SOBEDESCE_copia_*.xxh64, que só aparece quando o cartão termina e foi conferido.
//
// Os arquivos nunca são movidos nem renomeados: o SOBEDESCE compara pelo caminho na segunda leva do mesmo cartão. O
// Synquei só cria em volta as pastas de trabalho (Assets, Exports e Synquei/Sequências).
//
//  3. Download do Drive (linha v2, desktop/manifesto-drive.cjs): uma pasta baixada inteira pelo SOBEDESCE vira UMA
//     operação ("modo pasta única"), identificada pelo `op` do link synquei://organizar?…&op=. Cada arquivo é conferido
//     no disco (existe, tamanho, não está baixando); ausentes, movidos e alterados vão para o recibo
//     (<pasta>/Synquei/preparos.jsonl), que o SOBEDESCE lê. Repetir o mesmo op não duplica nada.
//
// Nada aqui importa o Electron: desktop/main.cjs liga os eventos e a página. Os testes usam pastas temporárias.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { EventEmitter } = require('node:events')
const { TIPOS } = require('./link-organizar.cjs')
const { validarLinhaDrive, conferirArquivos, linhaRecibo, OP, RECIBO } = require('./manifesto-drive.cjs')

const RESUMO = path.join('.sobedesce', 'descargas.jsonl')
const PASTAS_DE_TRABALHO = ['Assets', 'Exports', path.join('Synquei', 'Sequências')]
const IGNORAR = /(^|\/)(\.sobedesce-anteriores|\.sobedesce|\.Spotlight-V100|\.Trashes|\.fseventsd)(\/|$)|\.sobedesce-parcial$|\.sobedesce-part$|(^|\/)\._|(^|\/)\.DS_Store$|(^|\/)SOBEDESCE_copia_[^/]*\.xxh64$/
const CONFIG = 'organizador.json'

const idDrive = (op) => `drive:${op}`
const resumoLinha = (l) => crypto.createHash('sha1').update(JSON.stringify({ ...l, quando: null })).digest('hex').slice(0, 16)

const idDe = (raiz) => crypto.createHash('sha1').update(path.resolve(raiz)).digest('hex').slice(0, 12)
const dentro = (pai, filho) => {
  const r = path.relative(pai, filho)
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r))
}
const barra = (p) => p.split(path.sep).join('/')

async function eDiretorio(p) {
  try {
    return (await fsp.stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function listar(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** Todos os arquivos de uma pasta (caminho relativo com "/"), sem o que o SOBEDESCE guarda para si. */
async function arquivosDe(raiz, rel = '') {
  const out = []
  for (const e of await listar(path.join(raiz, rel))) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (IGNORAR.test(r)) continue
    if (e.isDirectory()) out.push(...(await arquivosDe(raiz, r)))
    else if (e.isFile()) out.push(r)
  }
  return out
}

/** "Diária 03" → 3 (null se não for uma diária). */
const numeroDiaria = (nome) => {
  const m = /^Di[aá]ria\s*(\d+)/i.exec(nome || '')
  return m ? Number(m[1]) : null
}
const numeroCartao = (nome) => {
  const m = /^Cart[aã]o\s*(\d+)/i.exec(nome || '')
  return m ? Number(m[1]) : null
}

/** "Aladim - FX30" → { nome: 'Aladim', camera: 'FX30' } (a pasta é o que o SOBEDESCE gravou). */
function donoDaPasta(pasta) {
  const i = pasta.lastIndexOf(' - ')
  return i > 0 ? { nome: pasta.slice(0, i), camera: pasta.slice(i + 3), pasta } : { nome: pasta, camera: '', pasta }
}

class Organizador extends EventEmitter {
  constructor({ stateDir, intervaloMs = 4000, log = () => {}, versao = '0' } = {}) {
    super()
    this.versao = versao
    this.stateDir = stateDir
    this.intervaloMs = intervaloMs
    this.log = log
    this.timer = null
    this.rodando = null
    this.cfg = this.#ler()
  }

  #ler() {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(this.stateDir, CONFIG), 'utf8'))
      if (c && typeof c === 'object' && c.pastas) return c
    } catch {}
    return { pastas: {} }
  }

  async #gravar() {
    if (!this.stateDir) return
    await fsp.mkdir(this.stateDir, { recursive: true })
    const f = path.join(this.stateDir, CONFIG)
    await fsp.writeFile(f + '.tmp', JSON.stringify(this.cfg, null, 2))
    await fsp.rename(f + '.tmp', f)
  }

  /** O que a página mostra. */
  estado() {
    return Object.values(this.cfg.pastas).map((p) => ({
      id: p.id,
      raiz: p.raiz,
      nome: p.nome,
      ligado: p.ligado,
      projetos: p.projetos || {},
      tipo: p.tipo || null,
      cores: p.cores || {},
      origem: p.origem,
      cartoes: Object.values(p.cartoes)
        .sort((a, b) => String(b.quando).localeCompare(String(a.quando)))
        .slice(0, 200)
        .map((c) => ({ id: c.id, modo: c.modo || 'cartao', op: c.op || null, nome: c.nome || null, pasta: c.pasta, diaria: c.diaria, dono: c.dono, cartao: c.cartao, quando: c.quando, resultado: c.resultado, arquivos: c.arquivos, estado: c.estado, erro: c.erro || null, conferencia: c.conferencia || null, recibo: c.recibo || null })),
    }))
  }

  /** Pasta do projeto (a que o SOBEDESCE cria dentro do destino: <destino>/<Projeto>). */
  async adicionar(raiz, { tipo = null, op = null } = {}) {
    raiz = path.resolve(String(raiz || ''))
    if (!(await eDiretorio(raiz))) throw new Error('Essa pasta não existe ou não abre.')
    try {
      await fsp.readdir(raiz)
    } catch {
      throw new Error('Sem permissão para ler essa pasta. Libere o acesso nos ajustes do sistema e tente de novo.')
    }
    // link com op (download do Drive): a operação precisa existir no manifesto desta pasta (senão é um link qualquer)
    if (op != null) {
      if (!OP.test(String(op))) throw new Error('Esse pedido do SOBEDESCE não é válido.')
      const l = await this.#linhaDoOp(raiz, op)
      if (!l) throw new Error('Não achei esse download do SOBEDESCE nesta pasta. Ela pode ter sido movida ou o resumo do SOBEDESCE apagado.')
      if (!l.ok) throw new Error(`O resumo do SOBEDESCE desta pasta está estragado (${l.erro}).`)
    }
    const id = idDe(raiz)
    if (!this.cfg.pastas[id]) {
      const temResumo = fs.existsSync(path.join(raiz, RESUMO))
      const temDiaria = (await listar(raiz)).some((e) => e.isDirectory() && numeroDiaria(e.name) != null)
      if (!temResumo && !temDiaria) throw new Error('Não achei um projeto do SOBEDESCE aqui. Escolha a pasta do projeto, a que tem as pastas "Diária 01", "Diária 02"…')
      this.cfg.pastas[id] = { id, raiz, nome: path.basename(raiz), ligado: true, tipo, projetos: {}, cores: {}, origem: temResumo ? 'resumo' : 'pastas', offset: 0, resto: '', cartoes: {}, criadoEm: new Date().toISOString() }
    } else this.cfg.pastas[id].ligado = true
    await this.#pastasDeTrabalho(raiz)
    await this.#gravar()
    this.emit('mudou', this.estado())
    this.verificar().catch(() => {})
    return this.cfg.pastas[id]
  }

  async remover(id) {
    delete this.cfg.pastas[id]
    await this.#gravar()
    this.emit('mudou', this.estado())
  }

  async ligar(id, ligado) {
    const p = this.cfg.pastas[id]
    if (!p) return
    p.ligado = !!ligado
    await this.#gravar()
    this.emit('mudou', this.estado())
    if (p.ligado) this.verificar().catch(() => {})
  }

  /** Cada diária vira um projeto do Synquei (a sincronia fica do tamanho de um dia): guarda qual é qual. */
  async vincular(id, { diaria, projetoId, tipo } = {}) {
    const p = this.cfg.pastas[id]
    if (!p) return
    if (diaria != null) {
      p.projetos = p.projetos || {}
      if (projetoId) p.projetos[diaria] = projetoId
      else delete p.projetos[diaria]
    }
    if (tipo !== undefined) p.tipo = tipo
    await this.#gravar()
    this.emit('mudou', this.estado())
  }

  async #pastasDeTrabalho(raiz) {
    for (const rel of PASTAS_DE_TRABALHO) await fsp.mkdir(path.join(raiz, rel), { recursive: true }).catch(() => {})
  }

  start() {
    if (this.timer) return
    const tick = async () => {
      await this.verificar().catch((err) => this.log('vigia:', err && err.message))
      if (this.timer !== null) this.timer = setTimeout(tick, this.intervaloMs)
    }
    this.timer = setTimeout(tick, 500)
  }

  stop() {
    clearTimeout(this.timer)
    this.timer = null
  }

  /** Uma passada em todas as pastas ligadas: cartões novos viram evento 'cartao'. */
  async verificar() {
    // uma passada por vez; quem chega no meio espera a atual e roda outra (pode ter chegado coisa nova)
    while (this.rodando) await this.rodando
    let fim
    this.rodando = new Promise((r) => (fim = r))
    try {
      for (const p of Object.values(this.cfg.pastas)) {
        if (!p.ligado || !(await eDiretorio(p.raiz))) continue
        const novos = fs.existsSync(path.join(p.raiz, RESUMO)) ? await this.#doResumo(p) : await this.#dasPastas(p)
        for (const c of novos) {
          p.cartoes[c.id] = { ...c, arquivos: c.lista.length, estado: 'novo', lista: undefined }
          const ev = this.#evento(p, c)
          await this.#gravar()
          this.emit('cartao', ev)
          this.emit('mudou', this.estado())
        }
      }
    } finally {
      this.rodando = null
      fim()
    }
  }

  /** Cor fixa de cada dono no projeto todo (a mesma câmera tem a mesma cor em todas as diárias). */
  #cor(p, dono) {
    p.cores = p.cores || {}
    const k = (dono && (dono.pasta || dono.nome)) || '?'
    if (p.cores[k] == null) p.cores[k] = Object.keys(p.cores).length
    return p.cores[k]
  }

  #evento(p, c) {
    if (c.modo === 'drive') {
      return {
        modo: 'drive',
        op: c.op,
        pastaId: p.id,
        raiz: p.raiz,
        projetoNome: c.nome || p.nome,
        projetoId: (p.projetos || {})[`op:${c.op}`] || null,
        tipo: p.tipo,
        cor: 0,
        id: c.id,
        quando: c.quando,
        diaria: { n: `op:${c.op}`, nome: c.nome || p.nome, data: null },
        dono: { nome: '', camera: '', pasta: '' },
        cartao: { n: 1, nome: '' },
        pasta: '',
        resultado: 'ok',
        conferencia: c.conferencia || null,
        arquivos: c.lista.map((r) => ({ rel: r.rel, abs: r.abs, size: r.size, mtimeMs: r.mtimeMs })),
      }
    }
    return {
      pastaId: p.id,
      raiz: p.raiz,
      projetoNome: p.nome,
      projetoId: (p.projetos || {})[c.diaria.n] || null,
      tipo: p.tipo,
      cor: this.#cor(p, c.dono),
      id: c.id,
      quando: c.quando,
      diaria: c.diaria,
      dono: c.dono,
      cartao: c.cartao,
      pasta: c.pasta,
      resultado: c.resultado,
      arquivos: c.lista.map((r) => ({ rel: `${c.pasta}/${r.rel}`, abs: path.join(p.raiz, ...c.pasta.split('/'), ...r.rel.split('/')), size: r.size, mtimeMs: r.mtimeMs })),
    }
  }

  /** Linhas novas do descargas.jsonl (só as inteiras; a última pela metade espera a próxima passada). */
  async #doResumo(p) {
    const f = path.join(p.raiz, RESUMO)
    let st
    try {
      st = await fsp.stat(f)
    } catch {
      return []
    }
    if (st.size < p.offset) {
      // o arquivo foi recriado: lê do começo (os cartões já vistos não voltam, pelo id)
      p.offset = 0
      p.resto = ''
    }
    if (st.size === p.offset) return []
    const fh = await fsp.open(f, 'r')
    let texto
    try {
      const len = st.size - p.offset
      const buf = Buffer.alloc(len)
      await fh.read(buf, 0, len, p.offset)
      texto = (p.resto || '') + buf.toString('utf8')
    } finally {
      await fh.close()
    }
    const linhas = texto.split('\n')
    p.resto = linhas.pop()
    p.offset = st.size
    const novos = []
    for (const l of linhas) {
      if (!l.trim()) continue
      let d
      try {
        d = JSON.parse(l)
      } catch {
        this.log('linha estragada no resumo do SOBEDESCE')
        continue
      }
      if (d && d.v === 2) {
        const op = await this.#operacao(p, d)
        if (op) novos.push(op)
        continue
      }
      if (!d || d.v !== 1 || !d.cartao || !d.cartao.pasta || d.resultado === 'cancelado') continue
      // o tipo de projeto escolhido no SOBEDESCE vale enquanto a pasta não tiver um (o daqui sempre ganha)
      if (!p.tipo && typeof d.tipo === 'string' && Object.hasOwn(TIPOS, d.tipo)) p.tipo = d.tipo
      const id = String(d.id || `${d.cartao.pasta}|${d.quando}`)
      if (p.cartoes[id]) continue
      const base = path.join(p.raiz, ...d.cartao.pasta.split('/'))
      const lista = []
      for (const a of Array.isArray(d.arquivos) ? d.arquivos : []) {
        if (!a || typeof a.rel !== 'string' || IGNORAR.test(a.rel)) continue
        const abs = path.join(base, ...a.rel.split('/'))
        if (!dentro(p.raiz, abs)) continue
        try {
          const s = await fsp.stat(abs)
          if (s.isFile()) lista.push({ rel: a.rel, size: s.size, mtimeMs: s.mtimeMs })
        } catch {}
      }
      novos.push({
        id,
        quando: d.quando || null,
        diaria: { n: Number(d.diaria && d.diaria.n) || numeroDiaria(d.cartao.pasta.split('/')[0]) || 1, nome: (d.diaria && d.diaria.nome) || d.cartao.pasta.split('/')[0], data: d.data || null },
        dono: { nome: (d.dono && d.dono.nome) || '', camera: (d.dono && d.dono.camera) || '', pasta: (d.dono && d.dono.pasta) || d.cartao.pasta.split('/')[2] || '' },
        cartao: { n: Number(d.cartao.n) || numeroCartao(d.cartao.pasta.split('/').pop()) || 1, nome: d.cartao.nome || '' },
        pasta: d.cartao.pasta,
        resultado: d.resultado || 'ok',
        lista,
      })
    }
    return novos
  }

  /**
   * Uma linha v2 (download do Drive) vira uma operação. Inválida: nada é processado e, se o op dá para ler, o recibo
   * diz o porquê (o SOBEDESCE mostra). A mesma linha de novo não repete; linha nova do mesmo op (baixou de novo) sim.
   */
  async #operacao(p, d) {
    const v = validarLinhaDrive(d)
    const opLido = d && typeof d.op === 'string' && OP.test(d.op) ? d.op : null
    if (!v.ok) {
      this.log('linha v2 recusada:', v.erro)
      if (opLido) await this.#gravarRecibo(p, opLido, { estado: 'erro', erro: `Resumo do SOBEDESCE recusado: ${v.erro}.` }).catch(() => {})
      return null
    }
    const l = v.linha
    const id = idDrive(l.op)
    const hash = resumoLinha(l)
    const antes = p.cartoes[id]
    if (antes && antes.hash === hash) return null
    const conf = await conferirArquivos(p.raiz, l)
    const conferencia = { ausentes: conf.ausentes, alterados: conf.alterados, movidos: conf.movidos }
    const c = { id, modo: 'drive', op: l.op, hash, nome: l.destino.pasta, quando: l.quando, diaria: { n: `op:${l.op}`, nome: l.destino.pasta }, dono: { nome: '', camera: '', pasta: '' }, cartao: { n: 1, nome: '' }, pasta: '', resultado: 'ok', conferencia, lista: conf.presentes }
    const pend = conf.ausentes.length + conf.alterados.length
    if (!conf.presentes.length) {
      p.cartoes[id] = { ...c, arquivos: 0, estado: 'erro', erro: 'Nenhum arquivo do download está na pasta.', lista: undefined }
    }
    await this.#gravarRecibo(p, l.op, {
      estado: conf.presentes.length ? 'recebido' : 'erro',
      resultado: { pendentes: pend, ausentes: conf.ausentes.length, alterados: conf.alterados.length, movidos: conf.movidos.length },
      exemplos: { ausentes: conf.ausentes, alterados: conf.alterados, movidos: conf.movidos },
      erro: conf.presentes.length ? null : 'Nenhum arquivo do download está na pasta (apagados, movidos ou ainda baixando).',
    }).catch((err) => this.log('recibo:', err && err.message))
    return conf.presentes.length ? c : null
  }

  /** A última linha v2 deste op no resumo da pasta: { ok, linha } | { ok: false, erro } | null (não tem). */
  async #linhaDoOp(raiz, op) {
    let texto
    try {
      texto = await fsp.readFile(path.join(raiz, RESUMO), 'utf8')
    } catch {
      return null
    }
    let achada = null
    for (const l of texto.split('\n')) {
      if (!l.includes(op)) continue
      let d
      try {
        d = JSON.parse(l)
      } catch {
        continue
      }
      if (d && d.v === 2 && d.op === op) achada = validarLinhaDrive(d)
    }
    return achada
  }

  async #gravarRecibo(p, op, dados) {
    const linha = linhaRecibo({ op, versao: this.versao, ...dados })
    const abs = path.join(p.raiz, RECIBO)
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    await fsp.appendFile(abs, JSON.stringify(linha) + '\n')
    const c = p.cartoes[idDrive(op)]
    if (c) c.recibo = { estado: linha.estado, quando: linha.quando, resultado: linha.resultado }
    return linha
  }

  /** A página conta como foi (preparando, preparado, com pendências, erro): vai para o recibo. */
  async recibo(pastaId, op, dados = {}) {
    const p = this.cfg.pastas[pastaId]
    if (!p) throw new Error('pasta não vigiada')
    if (!OP.test(String(op))) throw new Error('op inválido')
    const c = p.cartoes[idDrive(op)]
    const conf = (c && c.conferencia) || { ausentes: [], alterados: [], movidos: [] }
    const r = dados.resultado || {}
    const revisar = (dados.exemplos && Array.isArray(dados.exemplos.revisar) && dados.exemplos.revisar) || []
    if (c) c.revisar = revisar.filter((x) => typeof x === 'string').slice(0, 30)
    const linha = await this.#gravarRecibo(p, op, {
      // preparou, mas sobrou arquivo ausente ou alterado na pasta: é "com pendências", nunca "preparado"
      estado: dados.estado === 'preparado' && conf.ausentes.length + conf.alterados.length > 0 ? 'com_pendencias' : String(dados.estado),
      resultado: { ...r, ausentes: conf.ausentes.length, alterados: conf.alterados.length, movidos: conf.movidos.length, pendentes: (Number(r.revisar) || 0) + conf.ausentes.length + conf.alterados.length },
      exemplos: { ausentes: conf.ausentes, alterados: conf.alterados, movidos: conf.movidos, revisar },
      repetido: !!dados.repetido,
      erro: dados.erro || null,
    })
    await this.#gravar()
    this.emit('mudou', this.estado())
    return linha
  }

  /**
   * O mesmo link (op) pedido de novo. Já preparado e nada mudou na pasta: só um recibo "repetido" (nada duplica).
   * Mudou alguma coisa, ou não terminou: volta como evento (a página não repete clipe, projeto nem sincronia).
   * Ainda não visto: a próxima passada acha. Devolve 'repetido' | 'de-novo' | 'novo'.
   */
  async pedirDeNovo(pastaId, op) {
    const p = this.cfg.pastas[pastaId]
    const c = p && p.cartoes[idDrive(op)]
    if (!c) {
      await this.verificar()
      return 'novo'
    }
    const l = await this.#linhaDoOp(p.raiz, op)
    if (!l || !l.ok) return 'novo'
    const conf = await conferirArquivos(p.raiz, l.linha)
    const conferencia = { ausentes: conf.ausentes, alterados: conf.alterados, movidos: conf.movidos }
    const igual = JSON.stringify(conferencia) === JSON.stringify(c.conferencia || {})
    if (c.estado === 'pronto' && igual && c.recibo && ['preparado', 'com_pendencias'].includes(c.recibo.estado)) {
      await this.#gravarRecibo(p, op, { estado: c.recibo.estado, resultado: c.recibo.resultado, exemplos: { ...conferencia, revisar: c.revisar || [] }, repetido: true })
      await this.#gravar()
      return 'repetido'
    }
    if (!conf.presentes.length) {
      await this.#gravarRecibo(p, op, { estado: 'erro', resultado: { ausentes: conf.ausentes.length, alterados: conf.alterados.length, pendentes: conf.ausentes.length + conf.alterados.length }, exemplos: conferencia, erro: 'Nenhum arquivo do download está na pasta.' })
      await this.#gravar()
      return 'de-novo'
    }
    c.conferencia = conferencia
    c.estado = 'novo'
    c.arquivos = conf.presentes.length
    await this.#gravar()
    this.emit('cartao', this.#evento(p, { ...c, lista: conf.presentes }))
    this.emit('mudou', this.estado())
    return 'de-novo'
  }

  /** Sem resumo: cada Cartão NN com o relatório .xxh64 do SOBEDESCE (o cartão terminou e foi conferido). */
  async #dasPastas(p) {
    const novos = []
    for (const d of await listar(p.raiz)) {
      const nd = d.isDirectory() ? numeroDiaria(d.name) : null
      if (nd == null) continue
      const cenas = path.join(p.raiz, d.name, 'Cenas')
      for (const o of await listar(cenas)) {
        if (!o.isDirectory()) continue
        for (const c of await listar(path.join(cenas, o.name))) {
          if (!c.isDirectory() || numeroCartao(c.name) == null) continue
          const dir = path.join(cenas, o.name, c.name)
          const relatorios = (await listar(dir)).filter((e) => e.isFile() && /^SOBEDESCE_copia_.*\.xxh64$/.test(e.name)).map((e) => e.name).sort()
          if (!relatorios.length) continue
          const pasta = [d.name, 'Cenas', o.name, c.name].join('/')
          // uma "leva" por relatório: a segunda leva do mesmo cartão grava outro relatório
          const id = `${pasta}|${relatorios.at(-1)}`
          if (p.cartoes[id]) continue
          const lista = []
          for (const rel of await arquivosDe(dir)) {
            try {
              const s = await fsp.stat(path.join(dir, ...rel.split('/')))
              lista.push({ rel, size: s.size, mtimeMs: s.mtimeMs })
            } catch {}
          }
          let quando = null
          try {
            quando = (await fsp.stat(path.join(dir, relatorios.at(-1)))).mtime.toISOString()
          } catch {}
          novos.push({ id, quando, diaria: { n: nd, nome: d.name, data: null }, dono: donoDaPasta(o.name), cartao: { n: numeroCartao(c.name), nome: c.name }, pasta, resultado: 'ok', lista })
        }
      }
    }
    return novos.sort((a, b) => String(a.quando).localeCompare(String(b.quando)))
  }

  /** A página terminou (ou falhou) com um cartão. */
  async marcar(pastaId, cartaoId, estado, erro = null, revisar = null) {
    const p = this.cfg.pastas[pastaId]
    const c = p && p.cartoes[cartaoId]
    if (!c) return
    if (Array.isArray(revisar)) c.revisar = revisar.filter((r) => typeof r === 'string').slice(0, 30)
    c.estado = estado
    c.erro = erro
    if (estado === 'pronto') c.prontoEm = new Date().toISOString()
    await this.#gravar()
    this.emit('mudou', this.estado())
  }

  /** Cartões que chegaram e a página ainda não terminou (o app fechou no meio): voltam como evento. */
  async pendentes(pastaId) {
    const p = this.cfg.pastas[pastaId]
    if (!p) return []
    const out = []
    for (const c of Object.values(p.cartoes)) {
      if (c.estado === 'pronto') continue
      if (c.modo === 'drive') {
        const l = await this.#linhaDoOp(p.raiz, c.op)
        if (!l || !l.ok) continue
        const conf = await conferirArquivos(p.raiz, l.linha)
        if (conf.presentes.length) out.push(this.#evento(p, { ...c, conferencia: { ausentes: conf.ausentes, alterados: conf.alterados, movidos: conf.movidos }, lista: conf.presentes }))
        continue
      }
      const dir = path.join(p.raiz, ...c.pasta.split('/'))
      const lista = []
      for (const rel of await arquivosDe(dir)) {
        try {
          const s = await fsp.stat(path.join(dir, ...rel.split('/')))
          lista.push({ rel, size: s.size, mtimeMs: s.mtimeMs })
        } catch {}
      }
      out.push(this.#evento(p, { ...c, lista }))
    }
    return out.sort((a, b) => String(a.quando).localeCompare(String(b.quando)))
  }

  /** Todos os cartões de uma pasta como eventos (reorganizar tudo de novo). */
  async todos(pastaId) {
    const p = this.cfg.pastas[pastaId]
    if (!p) return []
    for (const c of Object.values(p.cartoes)) c.estado = 'novo'
    await this.#gravar()
    return this.pendentes(pastaId)
  }

  /** A página só lê arquivos de dentro das pastas vigiadas. */
  permitido(abs) {
    const a = path.resolve(String(abs || ''))
    return Object.values(this.cfg.pastas).some((p) => dentro(p.raiz, a))
  }

  /** Bytes [inicio, fim) de um arquivo de uma pasta vigiada (a página lê os clipes por aqui). */
  async ler(abs, inicio, fim) {
    if (!this.permitido(abs)) throw new Error('fora das pastas vigiadas')
    const fh = await fsp.open(abs, 'r')
    try {
      const st = await fh.stat()
      const a = Math.max(0, Math.min(Number(inicio) || 0, st.size))
      const b = Math.max(a, Math.min(fim == null ? st.size : Number(fim), st.size))
      const buf = Buffer.alloc(b - a)
      if (b > a) await fh.read(buf, 0, b - a, a)
      return buf
    } finally {
      await fh.close()
    }
  }

  /** Grava um arquivo do Synquei dentro da pasta do projeto (sequências por diária, relatórios). */
  async escrever(pastaId, rel, conteudo) {
    const p = this.cfg.pastas[pastaId]
    if (!p) throw new Error('pasta não vigiada')
    const abs = path.join(p.raiz, ...String(rel).split('/'))
    if (!dentro(path.join(p.raiz, 'Synquei'), abs)) throw new Error('só dentro da pasta Synquei do projeto')
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    await fsp.writeFile(abs + '.tmp', conteudo)
    await fsp.rename(abs + '.tmp', abs)
    return abs
  }

  /** O que a pessoa pôs em <projeto>/Assets (trilha, logos, artes): vai para a pasta Assets do DaVinci. */
  async assets(pastaId) {
    const p = this.cfg.pastas[pastaId]
    if (!p) return []
    return (await arquivosDe(path.join(p.raiz, 'Assets'))).map((rel) => ({ rel, abs: path.join(p.raiz, 'Assets', ...rel.split('/')) }))
  }

  raizDe(pastaId) {
    const p = this.cfg.pastas[pastaId]
    return p ? p.raiz : null
  }
}

module.exports = { Organizador, idDrive, idDe, donoDaPasta, numeroDiaria, numeroCartao, IGNORAR, RESUMO, PASTAS_DE_TRABALHO }

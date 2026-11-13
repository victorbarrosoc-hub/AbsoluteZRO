// O catálogo: as fotos de um trabalho e tudo o que a pessoa decide sobre elas. Modelo puro (sem DOM e sem
// armazenamento): roda igual no Node e no navegador; quem guarda é a tela (app/estado.js).
//
//   Foto { id, nome, caminho, tamanho, tipo: 'raw' | 'imagem', formato, exif, marca: 'escolhida' | 'rejeitada' | null,
//          estrelas: 0..5, cor: null | 'vermelho' | 'amarelo' | 'verde' | 'azul' | 'roxo', par?: { nome, tamanho, formato },
//          largura?, altura?, semPrevia?, magnitude?, medidas?, rostos?, cena?, grupo?, ajustes?, predefinicao?, cliente? }
//
// Cada foto é um objeto que não muda: uma alteração troca o objeto (a grade compara por identidade e só redesenha o
// cartão que mudou). `id` = hash estável de nome + tamanho + data de captura.
//
// Três listas, da mais crua para a que a pessoa vê:
//   fotos()     tudo, na ordem em que entrou
//   visiveis()  depois do filtro e da ordenação
//   itens()     visiveis() com as pilhas: um grupo fechado mostra só a capa; aberto, mostra todas no lugar
// Seleção, foco e âncora andam sobre itens().
//
// Avisos (assinar): { tipo, ids?, campos?, lista? }
//   'fotos'      entrou, saiu ou foi restaurado
//   'dados'      campos de algumas fotos mudaram (ids, campos); `lista: true` se a lista visível mudou junto
//   'selecao'    seleção, foco ou âncora (ids = as que mudaram de estado)
//   'filtro' | 'ordem' | 'pilhas'   a lista visível mudou
//   'historico'  o que dá para desfazer ou refazer mudou

export const CORES = ['vermelho', 'amarelo', 'verde', 'azul', 'roxo']
export const MARCAS = ['escolhida', 'rejeitada']
export const BALDES = ['fica', 'talvez', 'fora']
export const ORDENS = ['captura', 'nome', 'nota']
const LIMITE_DE_DESFAZER = 300
/** Campos que mexem no que aparece (filtro, ordem, capa da pilha). */
const DA_LISTA = new Set(['marca', 'estrelas', 'cor', 'magnitude', 'cena', 'tipo', 'grupo', 'exif', 'nome'])

// ───────────────────────────── id estável ─────────────────────────────

/** cyrb53 (domínio público): 53 bits a partir de um texto. Rápido e igual em qualquer lugar. */
function cyrb53(texto, semente = 0) {
  let h1 = 0xdeadbeef ^ semente
  let h2 = 0x41c6ce57 ^ semente
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Hash curto de um texto (22 caracteres de a–z e 0–9). */
export function hashDe(texto) {
  const parte = (s) => cyrb53(texto, s).toString(36).padStart(11, '0')
  return parte(0) + parte(0x9e3779b9)
}

/**
 * O id de uma foto: nome (sem pasta, sem diferença de maiúsculas) + tamanho em bytes + data de captura do EXIF
 * ('AAAA-MM-DDTHH:MM:SS'; vazia quando o arquivo não diz). Mover a pasta não muda o id.
 */
export function idDaFoto({ nome, tamanho, data }) {
  const base = String(nome).split(/[\\/]/).pop().normalize('NFC').toLowerCase()
  return hashDe(`${base}|${Number(tamanho) || 0}|${data || ''}`)
}

// ───────────────────────────── foto ─────────────────────────────

const estrelasValidas = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)))

/** Uma foto do contrato a partir do que a tela sabe do arquivo. Campos que faltam nascem neutros. */
export function criarFoto(dados) {
  const exif = dados.exif && typeof dados.exif === 'object' ? dados.exif : {}
  const foto = {
    ...dados,
    id: dados.id || idDaFoto({ nome: dados.nome, tamanho: dados.tamanho, data: exif.data }),
    nome: String(dados.nome ?? ''),
    caminho: String(dados.caminho ?? dados.nome ?? ''),
    tamanho: Number(dados.tamanho) || 0,
    tipo: dados.tipo === 'raw' ? 'raw' : 'imagem',
    formato: String(dados.formato ?? '').toLowerCase(),
    exif,
    marca: MARCAS.includes(dados.marca) ? dados.marca : null,
    estrelas: estrelasValidas(dados.estrelas),
    cor: CORES.includes(dados.cor) ? dados.cor : null,
  }
  return Object.freeze(foto)
}

// ───────────────────────────── ordem e filtro ─────────────────────────────

const comparador = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
const porNome = (a, b) => comparador.compare(a.nome, b.nome) || comparador.compare(a.caminho, b.caminho)
const quando = (f) => (f.exif?.data ? `${f.exif.data}.${String(Math.round((f.exif.subsegundo || 0) * 1000)).padStart(3, '0')}` : '')
function porCaptura(a, b) {
  const qa = quando(a)
  const qb = quando(b)
  if (qa && qb) return (qa < qb ? -1 : qa > qb ? 1 : 0) || porNome(a, b)
  if (qa || qb) return qa ? -1 : 1 // sem data vai para o fim
  return porNome(a, b)
}
function porNota(a, b) {
  const na = a.magnitude?.total
  const nb = b.magnitude?.total
  const ta = typeof na === 'number'
  const tb = typeof nb === 'number'
  if (ta && tb) return nb - na || porCaptura(a, b)
  if (ta || tb) return ta ? -1 : 1 // sem nota vai para o fim
  return porCaptura(a, b)
}
const COMPARAR = { captura: porCaptura, nome: porNome, nota: porNota }

const FILTRO_VAZIO = Object.freeze({ marca: null, estrelas: 0, cor: null, balde: null, motivo: null, cena: null, tipo: null, texto: null })
const lista = (v) => (v == null || v === '' ? null : Array.isArray(v) ? (v.length ? v : null) : [v])

/** Deixa o filtro na forma canônica (listas, ou null quando não filtra). */
function normalizarFiltro(f) {
  return {
    marca: lista(f.marca),
    estrelas: estrelasValidas(f.estrelas),
    cor: lista(f.cor),
    balde: lista(f.balde),
    motivo: f.motivo ? String(f.motivo).toLowerCase() : null,
    cena: lista(f.cena),
    tipo: lista(f.tipo),
    texto: f.texto ? String(f.texto).toLowerCase() : null,
  }
}

function passa(foto, f) {
  if (f.marca && !f.marca.includes(foto.marca ?? 'sem')) return false
  if (f.estrelas && foto.estrelas < f.estrelas) return false
  if (f.cor && !f.cor.includes(foto.cor ?? 'sem')) return false
  if (f.balde && !f.balde.includes(foto.magnitude?.balde ?? 'sem')) return false
  if (f.motivo && !(foto.magnitude?.motivos || []).some((m) => String(m).toLowerCase().includes(f.motivo))) return false
  if (f.cena && !f.cena.includes(foto.cena ?? 'sem')) return false
  if (f.tipo && !f.tipo.includes(foto.tipo)) return false
  if (f.texto && !foto.nome.toLowerCase().includes(f.texto)) return false
  return true
}

const filtroAtivo = (f) => !!(f.marca || f.estrelas || f.cor || f.balde || f.motivo || f.cena || f.tipo || f.texto)

// ───────────────────────────── catálogo ─────────────────────────────

/**
 * Cria um catálogo vazio, ou restaura o que `serializar()` devolveu.
 */
export function criarCatalogo(inicial) {
  /** @type {Map<string, any>} */
  let fotos = new Map()
  let filtro = normalizarFiltro(FILTRO_VAZIO)
  let ordem = { por: 'captura', sentido: 'asc' }
  let empilhado = true
  /** grupo → tipo ('repetidas' | 'sequencia') */
  let tiposDeGrupo = new Map()
  let abertas = new Set()
  let selecao = new Set()
  let foco = null
  let ancora = null
  let desfazer = []
  let refazer = []
  const ouvintes = new Set()

  // listas derivadas, refeitas só quando algo que as afeta muda
  let sujo = true
  let cacheVisiveis = []
  let cacheItens = []
  let indices = new Map()
  let cacheContagens = null
  let versao = 0

  const emitir = (aviso) => {
    versao++
    for (const f of [...ouvintes]) f(aviso)
  }

  function capaDe(membros) {
    let melhor = membros[0]
    for (const m of membros) {
      if (m === melhor) continue
      const escolhida = (m.marca === 'escolhida') - (melhor.marca === 'escolhida')
      const rejeitada = (melhor.marca === 'rejeitada') - (m.marca === 'rejeitada')
      const nota = (m.magnitude?.total ?? -1) - (melhor.magnitude?.total ?? -1)
      if (escolhida > 0 || (escolhida === 0 && (rejeitada > 0 || (rejeitada === 0 && nota > 0)))) melhor = m
    }
    return melhor
  }

  function recalcular() {
    if (!sujo) return
    sujo = false
    const todas = [...fotos.values()]
    const vis = filtroAtivo(filtro) ? todas.filter((f) => passa(f, filtro)) : todas
    vis.sort(COMPARAR[ordem.por] || porCaptura)
    if (ordem.sentido === 'desc') vis.reverse()
    cacheVisiveis = vis

    // pilhas: os membros visíveis de um grupo ficam juntos, no lugar do primeiro
    const itens = []
    if (empilhado && tiposDeGrupo.size) {
      const membros = new Map()
      for (const f of vis) {
        if (!f.grupo || !tiposDeGrupo.has(f.grupo)) continue
        if (!membros.has(f.grupo)) membros.set(f.grupo, [])
        membros.get(f.grupo).push(f)
      }
      const feitos = new Set()
      for (const f of vis) {
        const m = f.grupo ? membros.get(f.grupo) : null
        if (!m || m.length < 2) {
          itens.push({ foto: f, pilha: null })
          continue
        }
        if (feitos.has(f.grupo)) continue
        feitos.add(f.grupo)
        const tipo = tiposDeGrupo.get(f.grupo)
        if (abertas.has(f.grupo)) m.forEach((x, i) => itens.push({ foto: x, pilha: { id: f.grupo, tipo, total: m.length, aberta: true, posicao: i } }))
        else itens.push({ foto: capaDe(m), pilha: { id: f.grupo, tipo, total: m.length, aberta: false, posicao: 0 } })
      }
    } else for (const f of vis) itens.push({ foto: f, pilha: null })

    const antes = foco ? indices.get(foco) : undefined
    cacheItens = itens
    indices = new Map()
    itens.forEach((it, i) => indices.set(it.foto.id, i))
    return antes
  }

  /**
   * Depois de a lista mudar: o foco que saiu da lista passa para quem tomou o lugar dele (o fluxo de decupar com
   * filtro ligado), e a seleção perde o que não aparece mais. Devolve os ids cujo estado de seleção mudou.
   */
  function reconciliar(indiceAntigo) {
    const mudou = new Set()
    for (const id of [...selecao]) {
      if (!indices.has(id)) {
        selecao.delete(id)
        mudou.add(id)
      }
    }
    if (foco && !indices.has(foco)) {
      mudou.add(foco)
      const era = selecao.size === 0
      // a pilha fechou com o foco dentro: vai para a capa; senão, para quem tomou o lugar
      const grupo = fotos.get(foco)?.grupo
      const capa = grupo ? cacheItens.find((it) => it.pilha?.id === grupo) : null
      const i = Math.min(indiceAntigo ?? 0, cacheItens.length - 1)
      foco = capa ? capa.foto.id : i >= 0 ? cacheItens[i].foto.id : null
      if (foco) {
        mudou.add(foco)
        if (era) selecao.add(foco)
      }
    }
    if (ancora && !indices.has(ancora)) ancora = foco
    return mudou
  }

  /** A lista visível mudou: refaz e avisa (o aviso leva o que mudou na seleção por tabela). */
  function listaMudou(aviso) {
    sujo = true
    cacheContagens = null
    const mudou = reconciliar(recalcular())
    emitir({ ...aviso, lista: true })
    if (mudou.size) emitir({ tipo: 'selecao', ids: [...mudou] })
  }

  const garantir = () => {
    if (sujo) reconciliar(recalcular())
  }

  // ───────── leitura ─────────

  const api = {
    get tamanho() {
      return fotos.size
    },
    /** Sobe a cada aviso: serve para saber se algo mudou desde a última leitura. */
    get versao() {
      return versao
    },
    foto: (id) => fotos.get(id) ?? null,
    tem: (id) => fotos.has(id),
    fotos: () => [...fotos.values()],
    ids: () => [...fotos.keys()],
    visiveis() {
      garantir()
      return cacheVisiveis
    },
    itens() {
      garantir()
      return cacheItens
    },
    /** Posição da foto em itens(), ou -1. */
    indice(id) {
      garantir()
      return indices.get(id) ?? -1
    },

    // ───────── fotos ─────────

    /**
     * Junta fotos ao catálogo. Foto que já existe (mesmo id) fica com as marcas e os dados que tinha; só o que veio
     * do arquivo (nome, caminho, exif, par) é atualizado. Devolve os ids que entraram agora.
     */
    adicionar(novas) {
      const entraram = []
      for (const dados of novas) {
        const f = criarFoto(dados)
        const ja = fotos.get(f.id)
        if (ja) fotos.set(f.id, Object.freeze({ ...ja, nome: f.nome, caminho: f.caminho, exif: { ...ja.exif, ...f.exif }, ...(f.par ? { par: f.par } : {}) }))
        else {
          fotos.set(f.id, f)
          entraram.push(f.id)
        }
      }
      if (novas.length) listaMudou({ tipo: 'fotos', ids: entraram })
      return entraram
    },
    remover(ids) {
      const sairam = ids.filter((id) => fotos.delete(id))
      if (!sairam.length) return sairam
      const fora = new Set(sairam)
      desfazer = desfazer.map((p) => ({ ...p, itens: p.itens.filter((i) => !fora.has(i.id)) })).filter((p) => p.itens.length)
      refazer = refazer.map((p) => ({ ...p, itens: p.itens.filter((i) => !fora.has(i.id)) })).filter((p) => p.itens.length)
      listaMudou({ tipo: 'fotos', ids: sairam })
      emitir({ tipo: 'historico' })
      return sairam
    },

    /**
     * Dados que não são decisão da pessoa (exif lido depois, medidas, nota, cena, tamanho da imagem): troca os
     * campos sem entrar no desfazer. `atualizarVarias([{ id, ...campos }])` faz o mesmo em lote, com um aviso só.
     */
    atualizar(id, campos) {
      return api.atualizarVarias([{ id, ...campos }]).length === 1
    },
    atualizarVarias(alteracoes) {
      const ids = []
      const campos = new Set()
      for (const { id, ...resto } of alteracoes) {
        const f = fotos.get(id)
        if (!f) continue
        const novo = { ...f }
        let mudou = false
        for (const [k, v] of Object.entries(resto)) {
          if (k === 'id' || Object.is(f[k], v)) continue
          novo[k] = k === 'estrelas' ? estrelasValidas(v) : v
          campos.add(k)
          mudou = true
        }
        if (!mudou) continue
        fotos.set(id, Object.freeze(novo))
        ids.push(id)
      }
      if (!ids.length) return ids
      avisarDados(ids, [...campos])
      return ids
    },

    // ───────── decisões (entram no desfazer) ─────────

    /**
     * Muda campos de várias fotos de uma vez, com desfazer. `campos` é um objeto ou uma função (foto) → objeto.
     * Só entra na pilha o que mudou de verdade. Devolve os ids alterados.
     */
    definir(ids, campos, { rotulo = '' } = {}) {
      const itens = []
      for (const id of ids) {
        const f = fotos.get(id)
        if (!f) continue
        const quer = typeof campos === 'function' ? campos(f) : campos
        if (!quer) continue
        const antes = {}
        const depois = {}
        for (const [k, bruto] of Object.entries(quer)) {
          const v = k === 'estrelas' ? estrelasValidas(bruto) : bruto
          if (Object.is(f[k], v)) continue
          antes[k] = f[k]
          depois[k] = v
        }
        if (Object.keys(depois).length) itens.push({ id, antes, depois })
      }
      if (!itens.length) return []
      desfazer.push({ rotulo, itens })
      if (desfazer.length > LIMITE_DE_DESFAZER) desfazer.shift()
      refazer = []
      aplicarPasso(itens, 'depois')
      emitir({ tipo: 'historico' })
      return itens.map((i) => i.id)
    },
    /** 'escolhida' | 'rejeitada' | null */
    marcar: (ids, marca) =>
      api.definir(
        ids,
        { marca: MARCAS.includes(marca) ? marca : null },
        { rotulo: marca === 'escolhida' ? 'Escolhida' : marca === 'rejeitada' ? 'Rejeitada' : 'Sem marca' },
      ),
    estrelar: (ids, n) =>
      api.definir(
        ids,
        { estrelas: n },
        { rotulo: estrelasValidas(n) ? `${estrelasValidas(n)} ${estrelasValidas(n) === 1 ? 'estrela' : 'estrelas'}` : 'Sem estrelas' },
      ),
    colorir: (ids, cor) => api.definir(ids, { cor: CORES.includes(cor) ? cor : null }, { rotulo: CORES.includes(cor) ? `Cor: ${cor}` : 'Sem cor' }),

    get podeDesfazer() {
      return desfazer.length > 0
    },
    get podeRefazer() {
      return refazer.length > 0
    },
    /** Desfaz a última decisão. Devolve { rotulo, ids } ou null. */
    desfazer() {
      const passo = desfazer.pop()
      if (!passo) return null
      refazer.push(passo)
      aplicarPasso(passo.itens, 'antes')
      emitir({ tipo: 'historico' })
      return { rotulo: passo.rotulo, ids: passo.itens.map((i) => i.id) }
    },
    refazer() {
      const passo = refazer.pop()
      if (!passo) return null
      desfazer.push(passo)
      aplicarPasso(passo.itens, 'depois')
      emitir({ tipo: 'historico' })
      return { rotulo: passo.rotulo, ids: passo.itens.map((i) => i.id) }
    },

    // ───────── filtro e ordem ─────────

    filtro: () => ({ ...filtro }),
    filtroAtivo: () => filtroAtivo(filtro),
    /** Junta ao filtro atual (combinam com E). Valor ou lista; null tira aquele critério. */
    filtrar(parcial) {
      filtro = normalizarFiltro({ ...filtro, ...parcial })
      listaMudou({ tipo: 'filtro' })
    },
    limparFiltro() {
      if (!filtroAtivo(filtro)) return
      filtro = normalizarFiltro(FILTRO_VAZIO)
      listaMudou({ tipo: 'filtro' })
    },
    ordem: () => ({ ...ordem }),
    /** 'captura' (antiga → nova), 'nome' (A → Z) ou 'nota' (melhor → pior); 'desc' inverte. */
    ordenar(por, sentido = 'asc') {
      if (!ORDENS.includes(por)) return
      ordem = { por, sentido: sentido === 'desc' ? 'desc' : 'asc' }
      listaMudou({ tipo: 'ordem' })
    },
    /**
     * Quantas fotos há em cada valor (sobre o catálogo inteiro, sem o filtro): para as pílulas com contagem.
     * { total, visiveis, marca: { escolhida, rejeitada, sem }, estrelas: [0..5] (exatas), cor, balde, cena, tipo, motivo }
     */
    contagens() {
      garantir()
      if (cacheContagens) return cacheContagens
      const c = {
        total: fotos.size,
        visiveis: cacheVisiveis.length,
        marca: { escolhida: 0, rejeitada: 0, sem: 0 },
        estrelas: [0, 0, 0, 0, 0, 0],
        cor: { sem: 0 },
        balde: { fica: 0, talvez: 0, fora: 0, sem: 0 },
        cena: {},
        tipo: { raw: 0, imagem: 0 },
        motivo: {},
      }
      for (const k of CORES) c.cor[k] = 0
      for (const f of fotos.values()) {
        c.marca[f.marca ?? 'sem']++
        c.estrelas[f.estrelas]++
        c.cor[f.cor ?? 'sem']++
        c.balde[f.magnitude?.balde ?? 'sem'] = (c.balde[f.magnitude?.balde ?? 'sem'] || 0) + 1
        if (f.cena) c.cena[f.cena] = (c.cena[f.cena] || 0) + 1
        c.tipo[f.tipo]++
        for (const m of f.magnitude?.motivos || []) c.motivo[m] = (c.motivo[m] || 0) + 1
      }
      return (cacheContagens = c)
    },

    // ───────── grupos e pilhas ─────────

    /**
     * Os grupos da decupagem: [{ id, fotos: [id], tipo: 'repetidas' | 'sequencia' }]. Troca os que havia. Grupo com
     * menos de duas fotos visíveis não vira pilha.
     */
    definirGrupos(grupos) {
      const de = new Map()
      tiposDeGrupo = new Map()
      for (const g of grupos || []) {
        if (!g?.id || !Array.isArray(g.fotos)) continue
        tiposDeGrupo.set(g.id, g.tipo === 'sequencia' ? 'sequencia' : 'repetidas')
        for (const id of g.fotos) de.set(id, g.id)
      }
      for (const [id, f] of fotos) {
        const g = de.get(id) ?? null
        if ((f.grupo ?? null) !== g) fotos.set(id, Object.freeze({ ...f, grupo: g }))
      }
      abertas = new Set([...abertas].filter((g) => tiposDeGrupo.has(g)))
      listaMudou({ tipo: 'pilhas' })
    },
    grupos() {
      const saida = new Map()
      for (const [id, tipo] of tiposDeGrupo) saida.set(id, { id, tipo, fotos: [] })
      for (const f of fotos.values()) if (f.grupo && saida.has(f.grupo)) saida.get(f.grupo).fotos.push(f.id)
      return [...saida.values()]
    },
    empilhado: () => empilhado,
    /** Liga ou desliga as pilhas (desligado, toda foto aparece solta). */
    empilhar(sim) {
      if (empilhado === !!sim) return
      empilhado = !!sim
      listaMudou({ tipo: 'pilhas' })
    },
    pilhaAberta: (grupo) => abertas.has(grupo),
    alternarPilha(grupo, abrir = !abertas.has(grupo)) {
      if (!tiposDeGrupo.has(grupo) || abertas.has(grupo) === abrir) return
      if (abrir) abertas.add(grupo)
      else abertas.delete(grupo)
      listaMudou({ tipo: 'pilhas', grupo })
    },

    // ───────── seleção ─────────

    selecao: () => selecao,
    selecionada: (id) => selecao.has(id),
    foco: () => foco,
    ancora: () => ancora,
    /** As selecionadas, na ordem em que aparecem. */
    selecionadas() {
      garantir()
      return [...selecao].sort((a, b) => indices.get(a) - indices.get(b))
    },
    /** Em quem uma ação vale: a seleção; sem seleção, a foto em foco. */
    alvo() {
      if (selecao.size) return api.selecionadas()
      return foco ? [foco] : []
    },
    /**
     * Clique numa foto. Sem modificador: só ela. `alternar` (Cmd/Ctrl): entra ou sai da seleção. `intervalo`
     * (Shift): da âncora até ela; com `alternar` junto, soma o intervalo ao que já estava.
     */
    selecionar(id, { alternar = false, intervalo = false } = {}) {
      garantir()
      if (!indices.has(id)) return
      const antes = new Set(selecao)
      const focoAntes = foco
      if (intervalo && ancora && indices.has(ancora)) {
        const a = indices.get(ancora)
        const b = indices.get(id)
        if (!alternar) selecao = new Set()
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selecao.add(cacheItens[i].foto.id)
      } else if (alternar) {
        if (selecao.has(id)) selecao.delete(id)
        else selecao.add(id)
        ancora = id
      } else {
        selecao = new Set([id])
        ancora = id
      }
      foco = id
      avisarSelecao(antes, focoAntes)
    },
    /** Anda o foco `passo` posições (negativo volta). Com `intervalo` (Shift), estende a seleção desde a âncora. */
    mover(passo, { intervalo = false } = {}) {
      garantir()
      if (!cacheItens.length) return null
      const atual = foco && indices.has(foco) ? indices.get(foco) : -1
      const novo = atual < 0 ? 0 : Math.max(0, Math.min(cacheItens.length - 1, atual + passo))
      const id = cacheItens[novo].foto.id
      if (atual < 0 || !ancora) ancora = id
      api.selecionar(id, { intervalo: intervalo && atual >= 0 })
      return id
    },
    selecionarTudo() {
      garantir()
      const antes = new Set(selecao)
      const focoAntes = foco
      selecao = new Set(cacheItens.map((i) => i.foto.id))
      if (!foco && cacheItens.length) foco = cacheItens[0].foto.id
      ancora ??= foco
      avisarSelecao(antes, focoAntes)
    },
    /** Tira a seleção; o foco fica onde está (o teclado continua dali). */
    limparSelecao() {
      if (!selecao.size) return
      const antes = new Set(selecao)
      selecao = new Set()
      ancora = foco
      avisarSelecao(antes, foco)
    },

    // ───────── assinatura e guarda ─────────

    /** Chama `f(aviso)` a cada mudança. Devolve a função que cancela. */
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    /**
     * Tudo o que precisa ser guardado (objeto simples; a tela escolhe onde). O desfazer e a seleção não vão; o foco
     * vai, para a pessoa voltar onde parou. `omitir`: campos da foto que ficam de fora (ex.: ['medidas']).
     */
    serializar({ omitir = [] } = {}) {
      const fora = new Set(omitir)
      return {
        zro: 'foto.catalogo',
        versao: 1,
        fotos: [...fotos.values()].map((f) => (fora.size ? Object.fromEntries(Object.entries(f).filter(([k]) => !fora.has(k))) : { ...f })),
        grupos: [...tiposDeGrupo].map(([id, tipo]) => ({ id, tipo })),
        abertas: [...abertas],
        empilhado,
        filtro: { ...filtro },
        ordem: { ...ordem },
        foco,
      }
    },
    /** Troca tudo pelo que `serializar()` devolveu. Lança se não for um catálogo. */
    restaurar(dados) {
      if (!dados || dados.zro !== 'foto.catalogo' || !Array.isArray(dados.fotos)) throw new Error('Não é um catálogo de fotos.')
      if (dados.versao > 1) throw new Error('Catálogo de uma versão mais nova.')
      fotos = new Map()
      for (const d of dados.fotos) {
        const f = criarFoto(d)
        fotos.set(f.id, f)
      }
      tiposDeGrupo = new Map((dados.grupos || []).map((g) => [g.id, g.tipo === 'sequencia' ? 'sequencia' : 'repetidas']))
      abertas = new Set((dados.abertas || []).filter((g) => tiposDeGrupo.has(g)))
      empilhado = dados.empilhado !== false
      filtro = normalizarFiltro({ ...FILTRO_VAZIO, ...(dados.filtro || {}) })
      ordem = { por: ORDENS.includes(dados.ordem?.por) ? dados.ordem.por : 'captura', sentido: dados.ordem?.sentido === 'desc' ? 'desc' : 'asc' }
      selecao = new Set()
      foco = fotos.has(dados.foco) ? dados.foco : null
      ancora = foco
      desfazer = []
      refazer = []
      sujo = true
      cacheContagens = null
      indices = new Map()
      reconciliar(recalcular())
      emitir({ tipo: 'fotos', ids: [...fotos.keys()], lista: true })
      emitir({ tipo: 'historico' })
    },
  }

  function avisarDados(ids, campos) {
    if (campos.some((c) => DA_LISTA.has(c))) listaMudou({ tipo: 'dados', ids, campos })
    else emitir({ tipo: 'dados', ids, campos, lista: false })
  }

  function aplicarPasso(itens, lado) {
    const campos = new Set()
    for (const { id, [lado]: valores } of itens) {
      const f = fotos.get(id)
      if (!f) continue
      fotos.set(id, Object.freeze({ ...f, ...valores }))
      for (const k of Object.keys(valores)) campos.add(k)
    }
    avisarDados(
      itens.map((i) => i.id),
      [...campos],
    )
  }

  function avisarSelecao(antes, focoAntes) {
    const mudou = new Set()
    for (const id of antes) if (!selecao.has(id)) mudou.add(id)
    for (const id of selecao) if (!antes.has(id)) mudou.add(id)
    if (focoAntes !== foco) {
      if (focoAntes) mudou.add(focoAntes)
      if (foco) mudou.add(foco)
    }
    if (mudou.size) emitir({ tipo: 'selecao', ids: [...mudou] })
  }

  if (inicial) api.restaurar(inicial)
  return api
}

// ───────────────────────────── atalhos (padrão Lightroom) ─────────────────────────────

/**
 * O mapa de teclas, para a folha de atalhos e para os testes. `teclas` é o que se mostra; quem decide é `lerTecla`.
 * Depois de marcar, a foto seguinte entra sozinha com Caps Lock ligado ou segurando Shift (como no Lightroom).
 */
export const ATALHOS = [
  { grupo: 'Marcar', acao: 'marca', valor: 'escolhida', teclas: ['P'], rotulo: 'Escolher' },
  { grupo: 'Marcar', acao: 'marca', valor: 'rejeitada', teclas: ['X'], rotulo: 'Rejeitar' },
  { grupo: 'Marcar', acao: 'marca', valor: null, teclas: ['U'], rotulo: 'Tirar a marca' },
  { grupo: 'Marcar', acao: 'estrelas', teclas: ['1', '–', '5'], rotulo: 'Estrelas' },
  { grupo: 'Marcar', acao: 'estrelas', valor: 0, teclas: ['0'], rotulo: 'Sem estrelas' },
  { grupo: 'Marcar', acao: 'estrelas-passo', teclas: ['[', ']'], rotulo: 'Uma estrela a menos, a mais' },
  { grupo: 'Marcar', acao: 'cor', teclas: ['6', '7', '8', '9'], rotulo: 'Cor' },
  { grupo: 'Marcar', acao: 'avancar', teclas: ['Caps Lock'], ou: ['Shift'], rotulo: 'Marcar e avançar' },
  { grupo: 'Marcar', acao: 'desfazer', teclas: ['⌘', 'Z'], rotulo: 'Desfazer' },
  { grupo: 'Marcar', acao: 'refazer', teclas: ['⇧', '⌘', 'Z'], rotulo: 'Refazer' },
  { grupo: 'Andar', acao: 'mover', teclas: ['←', '→', '↑', '↓'], rotulo: 'Andar pelas fotos' },
  { grupo: 'Andar', acao: 'mover', teclas: ['⇧', '←', '→'], rotulo: 'Estender a seleção' },
  { grupo: 'Andar', acao: 'selecionar-tudo', teclas: ['⌘', 'A'], rotulo: 'Selecionar tudo' },
  { grupo: 'Andar', acao: 'sair', teclas: ['Esc'], rotulo: 'Fechar, tirar a seleção' },
  { grupo: 'Ver', acao: 'grade', teclas: ['G'], rotulo: 'Grade' },
  { grupo: 'Ver', acao: 'lupa', teclas: ['E'], ou: ['Enter'], rotulo: 'Foto grande' },
  { grupo: 'Ver', acao: 'zoom', teclas: ['Z'], ou: ['Espaço'], rotulo: 'Zoom de 100%' },
  { grupo: 'Ver', acao: 'comparar', teclas: ['N'], rotulo: 'Comparar duas' },
  { grupo: 'Ver', acao: 'aba', valor: 'revelar', teclas: ['D'], rotulo: 'Revelar' },
  { grupo: 'Ver', acao: 'ajuda', teclas: ['?'], rotulo: 'Estes atalhos' },
]

const DIRECOES = { ArrowLeft: 'esquerda', ArrowRight: 'direita', ArrowUp: 'acima', ArrowDown: 'abaixo' }

/**
 * Tecla → comando: { acao, valor?, avancar?, intervalo? } ou null. Aceita o evento do teclado ou um objeto com
 * { key, code, ctrlKey, metaKey, shiftKey, altKey, capsLock }. Não olha onde o foco está: quem chama ignora a tecla
 * quando a pessoa digita num campo.
 */
export function lerTecla(e) {
  const tecla = String(e.key ?? '')
  const letra = tecla.length === 1 ? tecla.toLowerCase() : tecla
  const caps = e.capsLock ?? e.getModifierState?.('CapsLock') ?? false
  const avancar = !!(e.shiftKey || caps)
  const comando = e.ctrlKey || e.metaKey
  if (e.altKey) return null
  if (comando) {
    if (letra === 'z') return { acao: e.shiftKey ? 'refazer' : 'desfazer' }
    if (letra === 'y') return { acao: 'refazer' }
    if (letra === 'a') return { acao: 'selecionar-tudo' }
    if (letra === 'd') return { acao: 'limpar-selecao' }
    return null
  }
  // número: com Shift a tecla vira símbolo, então vale a posição no teclado
  const digito = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '')?.[1] ?? (/^\d$/.test(tecla) ? tecla : null)
  if (digito != null) {
    const n = Number(digito)
    return n <= 5 ? { acao: 'estrelas', valor: n, avancar } : { acao: 'cor', valor: CORES[n - 6], avancar }
  }
  if (DIRECOES[tecla]) return { acao: 'mover', valor: DIRECOES[tecla], intervalo: !!e.shiftKey }
  switch (letra) {
    case 'p':
      return { acao: 'marca', valor: 'escolhida', avancar }
    case 'x':
      return { acao: 'marca', valor: 'rejeitada', avancar }
    case 'u':
      return { acao: 'marca', valor: null, avancar }
    case ']':
      return { acao: 'estrelas-passo', valor: 1 }
    case '[':
      return { acao: 'estrelas-passo', valor: -1 }
    case ' ':
    case 'z':
      return { acao: 'zoom' }
    case 'g':
      return { acao: 'grade' }
    case 'e':
    case 'Enter':
      return { acao: 'lupa' }
    case 'n':
      return { acao: 'comparar' }
    case 'd':
      return { acao: 'aba', valor: 'revelar' }
    case 'Escape':
      return { acao: 'sair' }
    case '?':
      return { acao: 'ajuda' }
    default:
      return null
  }
}

/**
 * Executa no catálogo os comandos que são dele (marcar, estrelas, cor, andar, desfazer, seleção). `colunas`: quantas
 * fotos cabem numa linha da grade (para ↑ e ↓; na lupa é 1). Devolve true se o comando era do catálogo; os de tela
 * (zoom, grade, lupa, comparar, aba, sair, ajuda) voltam false para a tela tratar.
 */
export function executar(catalogo, comando, { colunas = 1 } = {}) {
  if (!comando) return false
  const alvo = catalogo.alvo()
  const focoAntes = catalogo.foco()
  const avancar = () => {
    // com filtro ligado a foto marcada pode ter saído da lista: a seguinte já está no lugar dela
    if (comando.avancar && catalogo.foco() === focoAntes) catalogo.mover(1)
  }
  switch (comando.acao) {
    case 'marca':
      catalogo.marcar(alvo, comando.valor)
      avancar()
      return true
    case 'estrelas':
      catalogo.estrelar(alvo, comando.valor)
      avancar()
      return true
    case 'estrelas-passo':
      catalogo.definir(alvo, (f) => ({ estrelas: f.estrelas + comando.valor }), { rotulo: 'Estrelas' })
      return true
    case 'cor': {
      // como no Lightroom: a mesma cor de novo tira a cor
      const todas = alvo.length > 0 && alvo.every((id) => catalogo.foto(id)?.cor === comando.valor)
      catalogo.colorir(alvo, todas ? null : comando.valor)
      avancar()
      return true
    }
    case 'mover': {
      const passo = { esquerda: -1, direita: 1, acima: -colunas, abaixo: colunas }[comando.valor]
      if (!passo) return false
      catalogo.mover(passo, { intervalo: comando.intervalo })
      return true
    }
    case 'desfazer':
      catalogo.desfazer()
      return true
    case 'refazer':
      catalogo.refazer()
      return true
    case 'selecionar-tudo':
      catalogo.selecionarTudo()
      return true
    case 'limpar-selecao':
      catalogo.limparSelecao()
      return true
    default:
      return false
  }
}

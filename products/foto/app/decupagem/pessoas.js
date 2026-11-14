// Agrupar por pessoa, do lado do app: desligado por padrão, liga só com o aviso e o consentimento do fotógrafo (regra
// 5 de docs/ARQUITETURA.md). Ligado, assina os rostos que a análise já achou (app/decupagem/pessoas-worker.js, o motor
// SFace da busca em evento), agrupa no aparelho (src/decupagem/pessoas.js) e entrega à nota só ids (quais fotos são da
// mesma pessoa). Vetores e grupos moram só aqui, no IndexedDB `foto-pessoas`:
//
//   trabalhos  id do trabalho → { trabalho, consentimento: { em, versao }, pessoas: [{ id, nome, rostos: ['foto|i'] }] }
//   rostos     `${trabalho}|${foto}` → { trabalho, foto, chave, rostos: [{ i, v: Int8Array(128) | null, nota?, motivo? }] }
//
// Nunca no catálogo (que é serializado), nunca em XMP, exportação, galeria ou log. "Esquecer rostos" apaga as duas
// lojas do trabalho; trabalho tirado da lista (app/abrir/guardar.js) leva junto o que é dele (a faxina compara com a
// lista de trabalhos ao abrir e a cada troca de trabalho).
//
//   const p = criarPessoas({ loja, aoMudar })
//   p.estado() → { trabalho, ligado, situacao: 'desligado' | 'preparando' | 'rodando' | 'pronto' | 'indisponivel',
//                  feitas, total, motivo, pessoas: [{ id, nome, fotos, capa: { foto, caixa }, chave }] }
//   p.assinar(f) · p.ligar() · p.esquecer() · p.renomear(id, nome) · p.atualizar() (a análise leu rostos novos)
//   p.usarAssinador(pool)  troca quem assina (os testes passam vetores fabricados); p.encerrar()

import { criarPool } from '../trabalho/pool.js'
import { guardar } from '../abrir/guardar.js'
import { agruparPessoas, chaveDosRostos, manterIds, rostoParaAssinar, rostosDoEnsaio } from '../../src/decupagem/pessoas.js'
import { PESSOAS as TEXTOS } from '../../src/decupagem/textos.js'

export const BANCO = 'foto-pessoas'
const VERSAO = 1

export const AJUSTES_DE_PESSOAS = Object.freeze({
  lote: 12, // reagrupa a cada tantas fotos assinadas (e no fim)
  espera: 800, // ms depois que a análise leu rostos novos, antes de assinar
})

// ───────── IndexedDB ─────────

let abrindo = null
function banco() {
  abrindo ??= new Promise((ok) => {
    try {
      const pedido = indexedDB.open(BANCO, VERSAO)
      pedido.onupgradeneeded = () => {
        const b = pedido.result
        if (!b.objectStoreNames.contains('trabalhos')) b.createObjectStore('trabalhos')
        if (!b.objectStoreNames.contains('rostos')) b.createObjectStore('rostos')
      }
      pedido.onsuccess = () => {
        pedido.result.onversionchange = () => pedido.result.close()
        ok(pedido.result)
      }
      pedido.onerror = () => ok(null)
      pedido.onblocked = () => ok(null)
    } catch {
      ok(null)
    }
  })
  return abrindo
}

async function em(nomes, modo, f, padrao = null) {
  const b = await banco()
  if (!b) return padrao
  try {
    const t = b.transaction(nomes, modo)
    const fim = new Promise((ok, falhou) => {
      t.oncomplete = ok
      t.onerror = () => falhou(t.error)
      t.onabort = () => falhou(t.error)
    })
    const lojas = Object.fromEntries([nomes].flat().map((n) => [n, t.objectStore(n)]))
    const pedido = f(lojas)
    const valor =
      pedido && 'onsuccess' in pedido
        ? await new Promise((ok, falhou) => {
            pedido.onsuccess = () => ok(pedido.result)
            pedido.onerror = () => falhou(pedido.error)
          })
        : pedido
    await fim
    return valor ?? padrao
  } catch {
    return padrao
  }
}

const faixa = (trabalho) => IDBKeyRange.bound(`${trabalho}|`, `${trabalho}|￿`)

/** O que fica no aparelho, por trabalho. Tudo devolve o padrão sem IndexedDB (janela anônima): segue só na memória. */
export const deposito = {
  trabalho: (t) => em('trabalhos', 'readonly', (l) => l.trabalhos.get(t)),
  salvarTrabalho: (t, dados) => em('trabalhos', 'readwrite', (l) => l.trabalhos.put(dados, t)),
  async rostos(t) {
    const lista = await em('rostos', 'readonly', (l) => l.rostos.getAll(faixa(t)), [])
    return new Map(lista.map((x) => [x.foto, x]))
  },
  salvarRostos: (t, itens) =>
    em('rostos', 'readwrite', (l) => {
      for (const x of itens) l.rostos.put({ trabalho: t, ...x }, `${t}|${x.foto}`)
    }),
  /** Apaga tudo do trabalho: consentimento, grupos, nomes e vetores. */
  esquecer: (t) =>
    em(['trabalhos', 'rostos'], 'readwrite', (l) => {
      l.trabalhos.delete(t)
      l.rostos.delete(faixa(t))
    }),
  /** Quantas coisas o trabalho tem guardadas aqui (para a tela e os testes conferirem que sumiu). */
  async contar(t) {
    const trabalho = await em('trabalhos', 'readonly', (l) => l.trabalhos.count(t), 0)
    const rostos = await em('rostos', 'readonly', (l) => l.rostos.count(faixa(t)), 0)
    return { trabalho, rostos }
  },
  /** Apaga o que é de trabalho que não está mais na lista deste aparelho (o aberto agora nunca). */
  async faxina(aberto = null) {
    const guardados = await em('trabalhos', 'readonly', (l) => l.trabalhos.getAllKeys(), [])
    if (!guardados.length) return 0
    const existem = new Set((await guardar.trabalhos()).map((t) => t.id))
    const orfaos = guardados.filter((t) => t !== aberto && !existem.has(t))
    for (const t of orfaos) await deposito.esquecer(t)
    return orfaos.length
  },
}

// ───────── a esteira das pessoas ─────────

/** O que a nota e a tela recebem de cada pessoa: ids e a capa (onde está o rosto, para a tela recortar a miniatura). */
function paraTela(pessoas, fotoDe) {
  return pessoas.map((p) => {
    const f = fotoDe(p.capa.foto)
    const caixa = f?.rostos?.[p.capa.i]?.caixa ?? p.capa.caixa
    const quadro = f?.medidas ? { largura: f.medidas.largura, altura: f.medidas.altura } : null
    return { id: p.id, nome: p.nome ?? null, fotos: p.fotos, chave: p.chave, capa: { foto: p.capa.foto, caixa, quadro } }
  })
}

export function criarPessoas({ loja, assinador = null, ajustes = {}, aoMudar = () => {} } = {}) {
  const A = { ...AJUSTES_DE_PESSOAS, ...ajustes }
  const c = loja.catalogo
  let pool = assinador
  const usar = () => (pool ??= criarPool(new URL('./pessoas-worker.js', import.meta.url), { tamanho: 1, nome: 'pessoas' }))
  const ouvintes = new Set()
  let trabalho = null
  let ligado = false
  let situacao = 'desligado'
  let motivo = null
  let feitas = 0
  let total = 0
  let pessoas = []
  let nomes = []
  let assinaturas = new Map()
  let geracao = 0
  let rodando = null
  let relogio = null
  let preparado = false
  let consentidoEm = null

  const estado = () => ({ trabalho, ligado, situacao, motivo, feitas, total, pessoas: paraTela(pessoas, (id) => c.foto(id)) })
  const avisar = () => {
    const e = estado()
    for (const f of ouvintes) f(e)
    aoMudar(e)
  }

  /** Os nomes e a ligação rosto → pessoa que ficam guardados (os vetores ficam na loja `rostos`). */
  const registro = () => ({
    trabalho,
    consentimento: { em: consentidoEm, versao: TEXTOS.versao },
    pessoas: pessoas.map((p) => ({ id: p.id, nome: p.nome ?? null, rostos: p.rostos.map((r) => `${r.foto}|${r.i}`) })),
  })

  function reagrupar() {
    const rostos = rostosDoEnsaio(c.fotos(), assinaturas)
    const novas = manterIds(agruparPessoas(rostos).pessoas, nomes)
    pessoas = novas
    nomes = registro().pessoas
  }

  async function abrir(t) {
    const minha = ++geracao
    clearTimeout(relogio)
    pool?.cancelarTudo?.()
    trabalho = t
    ligado = false
    situacao = 'desligado'
    motivo = null
    pessoas = []
    nomes = []
    assinaturas = new Map()
    feitas = 0
    total = 0
    consentidoEm = null
    avisar()
    void deposito.faxina(t)
    if (!t) return
    const r = await deposito.trabalho(t)
    if (minha !== geracao) return
    if (!r?.consentimento || r.consentimento.versao !== TEXTOS.versao) return
    consentidoEm = r.consentimento.em
    ligado = true
    nomes = r.pessoas ?? []
    assinaturas = await deposito.rostos(t)
    if (minha !== geracao) return
    reagrupar()
    situacao = 'pronto'
    avisar()
    agendar(0)
  }

  /** A fila: fotos com rosto assinável cuja assinatura falta ou é de outra leitura dos rostos. */
  function fila() {
    return c.fotos().filter((f) => {
      if (!Array.isArray(f.rostos) || !rostoParaAssinar(f).length) return false
      return assinaturas.get(f.id)?.chave !== chaveDosRostos(f.rostos)
    })
  }

  function agendar(espera = A.espera) {
    if (!ligado) return
    clearTimeout(relogio)
    relogio = setTimeout(() => void processar(), espera)
  }

  async function processar() {
    if (!ligado || rodando) return rodando
    const minha = geracao
    rodando = (async () => {
      const lista = fila()
      if (!lista.length) {
        // nada a assinar, mas o catálogo pode ter chegado depois do que estava guardado: agrupa de novo
        const antes = JSON.stringify(nomes)
        reagrupar()
        if (situacao !== 'pronto' || JSON.stringify(nomes) !== antes) {
          situacao = 'pronto'
          avisar()
        }
        return
      }
      total = lista.length
      feitas = 0
      if (!preparado) {
        situacao = 'preparando'
        avisar()
        try {
          await usar().pedir('preparar', {}, { prioridade: 1000 })
          preparado = true
        } catch (e) {
          situacao = 'indisponivel'
          motivo = String(e?.message ?? e).slice(0, 200)
          avisar()
          return
        }
      }
      if (minha !== geracao || !ligado) return
      situacao = 'rodando'
      avisar()
      let lote = []
      const despejar = async () => {
        if (!lote.length) return
        const itens = lote
        lote = []
        await deposito.salvarRostos(trabalho, itens)
        reagrupar()
        await deposito.salvarTrabalho(trabalho, registro())
        avisar()
      }
      for (const f of lista) {
        if (minha !== geracao || !ligado) return
        const alvos = rostoParaAssinar(f)
        const chave = chaveDosRostos(f.rostos)
        try {
          const blob = await loja.miniaturas.blob(f.id, 'previa')
          if (!blob) continue
          const r = await usar().pedir('assinar', { blob, rostos: alvos, giro: f.analise?.giro ?? 0 }, { chave: `pessoas:${f.id}` })
          if (!r || minha !== geracao) return
          const item = { foto: f.id, chave, rostos: r.rostos }
          assinaturas.set(f.id, item)
          lote.push(item)
        } catch (e) {
          if (e?.name === 'AbortError') return
          motivo = String(e?.message ?? e).slice(0, 200)
        }
        feitas++
        if (lote.length >= A.lote) await despejar()
        else avisar()
      }
      await despejar()
      situacao = 'pronto'
      avisar()
    })().finally(() => {
      rodando = null
      // chegou foto nova enquanto rodava
      if (ligado && minha === geracao && fila().length) agendar()
    })
    return rodando
  }

  // a análise reescreve rostos (a cada foto lida): assina o que chegou
  c.assinar((aviso) => {
    if (!ligado) return
    if ((aviso.tipo === 'dados' && aviso.campos?.includes('rostos')) || aviso.tipo === 'fotos') agendar()
  })

  return {
    estado,
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    /** O trabalho aberto mudou (ou abriu): lê o que este aparelho já tem dele. */
    abrir,
    /** A pessoa leu o aviso e marcou o consentimento: liga e começa. */
    async ligar() {
      if (!trabalho) return
      ligado = true
      consentidoEm = Date.now()
      situacao = 'pronto'
      await deposito.salvarTrabalho(trabalho, registro())
      avisar()
      return processar()
    },
    /** Apaga vetores, grupos, nomes e o consentimento deste trabalho. Desliga. */
    async esquecer() {
      const t = trabalho
      geracao++
      clearTimeout(relogio)
      pool?.cancelarTudo?.()
      ligado = false
      situacao = 'desligado'
      motivo = null
      pessoas = []
      nomes = []
      assinaturas = new Map()
      feitas = 0
      total = 0
      consentidoEm = null
      if (t) await deposito.esquecer(t)
      avisar()
    },
    async renomear(id, nome) {
      const p = pessoas.find((x) => x.id === id)
      if (!p) return
      const limpo = String(nome ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40)
      p.nome = limpo || null
      nomes = registro().pessoas
      await deposito.salvarTrabalho(trabalho, registro())
      avisar()
    },
    atualizar: () => agendar(),
    processar,
    usarAssinador(novo) {
      pool = novo
      preparado = false
    },
    encerrar() {
      geracao++
      clearTimeout(relogio)
      ouvintes.clear()
      if (!assinador) pool?.encerrar?.()
      pool = null
    },
  }
}

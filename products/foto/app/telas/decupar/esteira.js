// A decupagem do trabalho aberto, do lado da tela: uma esteira (app/decupagem/analisar.js) por loja, que começa
// sozinha quando o trabalho abre, e tudo o que a pessoa decide em volta dela (tipo de ensaio, rigor, a meta "quero
// cerca de N", o aprendizado dos pesos e "aceitar sugestões"). A tela só lê `estado()` e chama as funções.
//
//   const e = esteiraDa(loja)
//   e.estado()  → { trabalho, analise, ensaio, ensaioDetectado, rigor, meta, camadas, sozinha, aprendizado, mexido }
//   e.assinar(f) · comecar() · pausar() · retomar() · definirRigor(r) · definirEnsaio(e) · definirMeta(n | null)
//   e.definirCamadas([...]) · definirSozinha(bool) · aprender(troca) → frases · zerarAprendizado()
//   e.planoDeAceitar() → { itens, escolhidas, rejeitadas, estrelas } · aceitar(plano) → ids
//
// O que fica guardado neste aparelho (localStorage, tudo com try/catch; sem ele, vale o padrão):
//   foto_decupar_sozinha   '0' desliga o começo sozinho (a pessoa liga e desliga nos ajustes)
//   foto_decupar_camadas   as camadas de visão pedidas (padrão: rostos)
//   foto_decupar_pesos     os pesos aprendidos, por tipo de ensaio
//   foto_decupar_t_<id>    ensaio, rigor e meta de cada trabalho
// A meta mexe só no BALDE da nota (magnitude.balde, guardando o da nota em magnitude.baldeDaNota): as notas e os
// motivos continuam os da análise, e tirar a meta devolve os baldes como eram.

import { criarAnalise } from '../../decupagem/analisar.js'
import { ajustarPesos, ENSAIOS as REGRAS, meta as metaDoEnsaio, pesosPadrao, RIGORES as CORTES } from '../../../src/decupagem/nota.js'

export const CHAVES = Object.freeze({
  sozinha: 'foto_decupar_sozinha',
  camadas: 'foto_decupar_camadas',
  pesos: 'foto_decupar_pesos',
  trabalho: (id) => `foto_decupar_t_${id}`,
})
export const CAMADAS_PADRAO = Object.freeze(['rostos'])

/** localStorage que não quebra: sem armazenamento (aba privada, bloqueado), lê o padrão e esquece o que grava. */
export const lembrar = {
  ler(chave, padrao = null) {
    try {
      const v = localStorage.getItem(chave)
      return v == null ? padrao : v
    } catch {
      return padrao
    }
  },
  lerJson(chave, padrao = null) {
    try {
      const v = localStorage.getItem(chave)
      return v == null ? padrao : JSON.parse(v)
    } catch {
      return padrao
    }
  },
  gravar(chave, valor) {
    try {
      if (valor == null) localStorage.removeItem(chave)
      else localStorage.setItem(chave, typeof valor === 'string' ? valor : JSON.stringify(valor))
    } catch {
      // segue sem lembrar
    }
  },
}

/** Classes de objeto (COCO) que só aparecem em esporte: com a camada de objetos, servem para sugerir o ensaio. */
const DE_ESPORTE = new Set(['sports ball', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'skis', 'snowboard', 'frisbee'])

/** O tipo de ensaio que as fotos sugerem, ou null. Só com a camada de objetos rodando numa parte boa do ensaio. */
export function detectarEnsaio(fotos) {
  const olhadas = fotos.filter((f) => f.analise?.camadas?.includes('objetos'))
  if (olhadas.length < 12) return null
  const comEsporte = olhadas.filter((f) => (f.analise.objetos ?? []).some((o) => DE_ESPORTE.has(o.classe))).length
  return comEsporte / olhadas.length >= 0.3 ? 'esporte' : null
}

const porLoja = new WeakMap()

/** A esteira da loja (uma por página). */
export function esteiraDa(loja) {
  let e = porLoja.get(loja)
  if (!e) {
    e = criarEsteira(loja)
    porLoja.set(loja, e)
  }
  return e
}

function criarEsteira(loja) {
  const c = loja.catalogo
  const analise = criarAnalise({ loja })
  const ouvintes = new Set()
  let trabalho = null
  let iniciada = false
  let ensaio = 'geral'
  let ensaioEscolhido = false
  let ensaioDetectado = null
  let rigor = 'equilibrado'
  let metaAtual = null
  let camadas = lerCamadas()
  let sozinha = lembrar.ler(CHAVES.sozinha) !== '0'
  let pesosTodos = lembrar.lerJson(CHAVES.pesos, {}) || {}
  let estadoDaAnalise = analise.estado()
  let instantaneo = null
  let escrevendo = false
  let relogioDaMeta = null
  let relogioDeFotos = null

  function lerCamadas() {
    const v = lembrar.lerJson(CHAVES.camadas, null)
    return Array.isArray(v) ? v.filter((x) => ['rostos', 'objetos', 'rotulos'].includes(x)) : [...CAMADAS_PADRAO]
  }
  const pesos = () => pesosTodos[ensaio] ?? undefined
  const mexido = () => !!pesosTodos[ensaio]

  function publicar() {
    instantaneo = null
    const e = api.estado()
    for (const f of ouvintes) f(e)
  }

  function guardarTrabalho() {
    if (!trabalho) return
    lembrar.gravar(CHAVES.trabalho(trabalho), { ensaio, ensaioEscolhido, rigor, meta: metaAtual })
  }

  // ───────── o trabalho aberto ─────────

  function sincronizar() {
    const t = loja.trabalho()?.id ?? null
    if (t !== trabalho) {
      if (trabalho) analise.cancelar()
      trabalho = t
      iniciada = false
      ensaioDetectado = null
      const g = t ? lembrar.lerJson(CHAVES.trabalho(t), null) : null
      ensaio = g?.ensaio in REGRAS ? g.ensaio : 'geral'
      ensaioEscolhido = !!g?.ensaioEscolhido
      rigor = g?.rigor in CORTES ? g.rigor : 'equilibrado'
      metaAtual = Number.isFinite(g?.meta) && g.meta > 0 ? g.meta : null
      publicar()
    }
    const pronto = !!t && loja.situacao() === 'aberto' && !loja.lendo()
    if (pronto) {
      // o catálogo guardado pode ter vindo com a meta de antes: confere os baldes com a meta de agora
      agendarMeta()
      if (sozinha && !iniciada) api.comecar()
    }
  }

  // ───────── a meta: "quero cerca de N" ─────────

  /** Os baldes com a meta (ou de volta aos da nota, sem ela). Não reanalisa nada: lê a nota que cada foto já tem. */
  function aplicarMeta() {
    clearTimeout(relogioDaMeta)
    relogioDaMeta = null
    const fotos = c.fotos().filter((f) => f.magnitude)
    const mudancas = []
    if (metaAtual == null) {
      for (const f of fotos) {
        const m = f.magnitude
        if (m.baldeDaNota == null) continue
        const { baldeDaNota, ...resto } = m
        mudancas.push({ id: f.id, magnitude: { ...resto, balde: baldeDaNota } })
      }
    } else if (fotos.length) {
      const r = metaDoEnsaio(
        fotos.map((f) => ({ id: f.id, magnitude: f.magnitude })),
        metaAtual,
        { grupos: c.grupos() },
      )
      const ficam = new Set(r.ficam)
      for (const f of fotos) {
        const m = f.magnitude
        const daNota = m.baldeDaNota ?? m.balde
        const novo = ficam.has(f.id) ? 'fica' : daNota === 'fora' ? 'fora' : 'talvez'
        if (novo !== m.balde || m.baldeDaNota == null) mudancas.push({ id: f.id, magnitude: { ...m, balde: novo, baldeDaNota: daNota } })
      }
    }
    if (!mudancas.length) return
    escrevendo = true
    try {
      c.atualizarVarias(mudancas)
    } finally {
      escrevendo = false
    }
  }
  function agendarMeta(espera = 60) {
    clearTimeout(relogioDaMeta)
    relogioDaMeta = setTimeout(aplicarMeta, espera)
  }

  // a análise reescreve as notas (a cada lote e no fim): a meta volta por cima; fotos novas entram na fila
  c.assinar((aviso) => {
    if (escrevendo) return
    if (aviso.tipo === 'dados' && aviso.campos?.includes('magnitude')) {
      if (metaAtual != null) agendarMeta(120)
      const detectado = detectarEnsaio(c.fotos())
      if (detectado !== ensaioDetectado) {
        ensaioDetectado = detectado
        if (detectado && !ensaioEscolhido && detectado !== ensaio) api.definirEnsaio(detectado, { escolhido: false })
        else publicar()
      }
    } else if (aviso.tipo === 'fotos' && aviso.ids?.length && iniciada && sozinha) {
      clearTimeout(relogioDeFotos)
      relogioDeFotos = setTimeout(() => !loja.lendo() && api.comecar(), 600)
    }
  })

  analise.assinar((e) => {
    estadoDaAnalise = e
    publicar()
  })
  loja.assinar(sincronizar)

  const api = {
    analise,
    estado() {
      instantaneo ??= {
        trabalho,
        analise: estadoDaAnalise,
        iniciada,
        ensaio,
        ensaioDetectado,
        ensaioEscolhido,
        rigor,
        meta: metaAtual,
        camadas: [...camadas],
        sozinha,
        mexido: mexido(),
        aprendizado: mexido() ? ajustarPesos(pesos(), []).explicacao : null,
      }
      return instantaneo
    },
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },

    /** Começa (ou continua) a análise do trabalho aberto. Só entra na fila o que falta. */
    comecar() {
      if (!trabalho || loja.lendo()) return null
      iniciada = true
      const fim = analise.iniciar({ camadas, rigor, ensaio, pesos: pesos(), raw: true })
      publicar()
      return fim
    },
    pausar: () => analise.pausar(),
    retomar: () => analise.retomar(),

    definirRigor(r) {
      if (!(r in CORTES) || r === rigor) return
      rigor = r
      guardarTrabalho()
      analise.refazerNota({ rigor, ensaio, pesos: pesos() })
      aplicarMeta()
      publicar()
    },
    definirEnsaio(e, { escolhido = true } = {}) {
      if (!(e in REGRAS)) return
      ensaio = e
      if (escolhido) ensaioEscolhido = true
      guardarTrabalho()
      analise.refazerNota({ rigor, ensaio, pesos: pesos() })
      aplicarMeta()
      publicar()
    },
    /** "Quero cerca de n" (null tira a meta). Os baldes mudam na hora; nenhuma foto é analisada de novo. */
    definirMeta(n) {
      const v = n == null ? null : Math.max(1, Math.round(n))
      if (v === metaAtual) return
      metaAtual = v
      guardarTrabalho()
      aplicarMeta()
      // sem meta, a nota de agora decide o balde de novo (o guardado em baldeDaNota pode ser de antes do rigor)
      if (v == null && c.fotos().some((f) => f.medidas)) analise.refazerNota({ rigor, ensaio, pesos: pesos() })
      publicar()
    },
    definirCamadas(lista) {
      camadas = ['rostos', 'objetos', 'rotulos'].filter((x) => lista.includes(x))
      lembrar.gravar(CHAVES.camadas, camadas)
      publicar()
      if (iniciada) api.comecar()
    },
    definirSozinha(sim) {
      sozinha = !!sim
      lembrar.gravar(CHAVES.sozinha, sozinha ? '1' : '0')
      publicar()
      if (sozinha && !iniciada) sincronizar()
    },

    /**
     * Uma troca da pessoa ("prefiro esta à que a nota escolheu"): os pesos daquele tipo de ensaio andam um passo, a nota
     * é refeita na hora e a mudança volta em palavras.
     */
    aprender(preferida, preterida) {
      const a = preferida?.magnitude
      const b = preterida?.magnitude
      if (!a?.componentes || !b?.componentes || preferida.id === preterida.id) return null
      const rosto = (m) => ({ olhos: m.detalhe?.olhos, nitidez: m.detalhe?.nitidezDoRosto, expressao: m.detalhe?.expressao })
      const r = ajustarPesos(pesos() ?? pesosPadrao(), [
        { preferida: a.componentes, preterida: b.componentes, preferidaRosto: rosto(a), preteridaRosto: rosto(b) },
      ])
      pesosTodos = { ...pesosTodos, [ensaio]: r.pesos }
      lembrar.gravar(CHAVES.pesos, pesosTodos)
      analise.refazerNota({ rigor, ensaio, pesos: r.pesos })
      aplicarMeta()
      publicar()
      return r.explicacao
    },
    zerarAprendizado() {
      pesosTodos = { ...pesosTodos }
      delete pesosTodos[ensaio]
      lembrar.gravar(CHAVES.pesos, pesosTodos)
      analise.refazerNota({ rigor, ensaio, pesos: undefined })
      aplicarMeta()
      publicar()
    },

    /**
     * O que "aceitar sugestões" faria: Fica vira escolhida, Fora vira rejeitada, e as estrelas sugeridas entram onde
     * não há estrela. O que a pessoa já marcou fica como está. Sem meta, as reservas de um momento (a melhor já é a
     * escolhida) ficam sem marca e com no máximo 2 estrelas: alternativa da cena.
     */
    planoDeAceitar() {
      const itens = []
      let escolhidas = 0
      let rejeitadas = 0
      let estrelas = 0
      for (const f of c.fotos()) {
        const m = f.magnitude
        if (!m?.balde) continue
        const campos = {}
        const reserva = metaAtual == null && f.escolha && f.escolha.tamanho > 1 && !f.escolha.escolhida
        if (f.marca == null) {
          if (m.balde === 'fica' && !reserva) campos.marca = 'escolhida'
          else if (m.balde === 'fora') campos.marca = 'rejeitada'
        }
        const sugeridas = reserva && m.balde === 'fica' ? Math.min(2, m.estrelas || 0) : m.estrelas || 0
        if (!f.estrelas && sugeridas) campos.estrelas = sugeridas
        if (!Object.keys(campos).length) continue
        if (campos.marca === 'escolhida') escolhidas++
        if (campos.marca === 'rejeitada') rejeitadas++
        if (campos.estrelas) estrelas++
        itens.push({ id: f.id, campos })
      }
      return { itens, escolhidas, rejeitadas, estrelas }
    },
    /** Aplica o plano como UM passo do desfazer. Devolve os ids que mudaram. */
    aceitar(plano = api.planoDeAceitar()) {
      const porId = new Map(plano.itens.map((i) => [i.id, i.campos]))
      return c.definir([...porId.keys()], (f) => porId.get(f.id), { rotulo: 'Sugestões aceitas' })
    },
    encerrar() {
      analise.encerrar()
      ouvintes.clear()
    },
  }

  sincronizar()
  return api
}

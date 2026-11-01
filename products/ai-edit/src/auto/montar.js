// A montagem da edição automática dentro do projeto: a análise (a música, a batida, as partes e cada tomada com a
// sincronia e as notas) fica em p.auto; montar troca a linha por uma nova (um passo só no Desfazer), põe a música como
// trilha, marca as partes na linha (o que a Entrega já transforma em peças e capítulos) e cala o som das câmeras.
// Depois, cada plano tem as outras opções do mesmo trecho da música (a troca de plano da revisão), e a performance
// trocada continua em sincronia. Puro e imutável, como a linha.

import { posicoes, tamanho } from '../linha.js'
import { paraQuadros, paraSegundos } from '../tempo.js'
import { definirTrilha, musicaNoQuadro } from '../trilha.js'
import { notasDe } from '../musica/nota.js'
import { alternativasEm, cortesNaMusica, escolherPlanos, parteEm, sorteio } from '../musica/montagem.js'

export const VERSAO_AUTO = 1
/** Volume das câmeras na montagem: calado (a música vem da trilha); a pessoa sobe no Inspector se quiser. */
export const CAMERA_CALADA = -60
const PREFIXO_MARCADOR = 'kauto'

let seq = 0
const novoId = () => `c${Date.now().toString(36)}a${(seq++).toString(36)}`
const r3 = (x) => Math.round(x * 1000) / 1000

/**
 * A análise guardada no projeto: { versao, modo, preset: { nome, versao }, musica (id da mídia), duracao, bpm, batidas,
 * compassos, partes, energias, tomadas: { [midia]: { tipo, inicio?, ncc?, destaque?, hz, b64 } } }.
 */
export function comAnalise(p, analise) {
  return { ...p, auto: { ...(p.auto || {}), ...analise, versao: VERSAO_AUTO } }
}

/** As tomadas da análise prontas para a montagem (com as notas decodificadas e a duração da mídia). */
export function tomadasDa(p) {
  const a = p.auto
  if (!a?.tomadas) return []
  return Object.entries(a.tomadas)
    .map(([midia, t]) => {
      const m = p.midias.find((x) => x.id === midia)
      if (!m?.temVideo || midia === a.musica) return null
      return { midia, tipo: t.tipo, inicio: t.inicio ?? 0, duracao: m.duracao, notas: notasDe(t), hz: t.hz || 2 }
    })
    .filter(Boolean)
}

/** A pessoa corrige: esta tomada é performance (em sincronia) ou B-roll. Performance sem sincronia medida não vira. */
export function marcarTomada(p, midia, tipo) {
  const t = p.auto?.tomadas?.[midia]
  if (!t || t.tipo === tipo || !['performance', 'broll'].includes(tipo)) return p
  if (tipo === 'performance' && !Number.isFinite(t.inicio)) return p
  return { ...p, auto: { ...p.auto, tomadas: { ...p.auto.tomadas, [midia]: { ...t, tipo } } } }
}

/** Empurra a sincronia de uma tomada em quadros (a pessoa acerta de ouvido; vale para a próxima montagem). */
export function empurrarSincronia(p, midia, quadros) {
  const t = p.auto?.tomadas?.[midia]
  if (!t || !Number.isFinite(t.inicio) || !quadros) return p
  return { ...p, auto: { ...p.auto, tomadas: { ...p.auto.tomadas, [midia]: { ...t, inicio: r3(t.inicio + paraSegundos(quadros, p.fps)) } } } }
}

/** Troca o nome de uma parte da música (o que a pessoa corrige antes de montar). */
export function comPartes(p, partes) {
  return p.auto ? { ...p, auto: { ...p.auto, partes } } : p
}

/**
 * Monta: { projeto, planos } com a linha nova. ajustes: { ritmo, broll, semente, desde, ate }. o = prepararModo().
 * Sem análise ou sem nada que entre: { projeto: p, planos: [] }.
 */
export function montar(p, o, ajustes = {}) {
  const a = p.auto
  if (!a?.musica || !a.batidas?.length || !p.midias.some((m) => m.id === a.musica)) return { projeto: p, planos: [] }
  const desde = Math.max(0, ajustes.desde ?? 0)
  const ate = Math.min(a.duracao, ajustes.ate ?? a.duracao)
  const tomadas = tomadasDa(p)
  const semente = ajustes.semente ?? 1
  const trechos = cortesNaMusica(a, { ritmo: ajustes.ritmo || 'normal', desde, ate }, o, sorteio(semente))
  const planos = escolherPlanos(trechos, tomadas, a, { broll: ajustes.broll || 'pouco', semente }, o)
  if (!planos.length) return { projeto: p, planos: [] }
  const porMidia = new Map(tomadas.map((t) => [t.midia, t]))
  const fps = p.fps
  const Q = (t) => paraQuadros(t - desde, fps)
  const clipes = []
  for (const x of planos) {
    const m = p.midias.find((y) => y.id === x.midia)
    const q0 = Q(x.ini)
    const len = Q(x.fim) - q0
    if (len <= 0 || !m) continue
    const t = porMidia.get(x.midia)
    // a performance guarda um deslocamento só por tomada (todos os planos dela ficam com o mesmo erro, menor que meio
    // quadro); o B-roll entra no quadro do trecho escolhido
    let ini = x.tipo === 'performance' ? q0 + paraQuadros(desde - t.inicio, fps) : paraQuadros(x.de, fps)
    ini = Math.max(0, Math.min(ini, m.quadros - len))
    const c = { id: novoId(), midia: x.midia, ini, fim: ini + Math.min(len, m.quadros), ajustes: { volume: CAMERA_CALADA } }
    if (x.tipo !== 'performance') c.etiqueta = 'B-roll'
    clipes.push(c)
  }
  // a linha precisa durar a música inteira: o arredondamento de cada plano já fecha nos quadros de Q
  let projeto = { ...p, linha: { ...p.linha, clipes } }
  projeto = definirTrilha(projeto, a.musica, { desde, volume: p.trilha?.midia === a.musica ? p.trilha.volume : 0 })
  // as partes viram marcadores (os da pessoa ficam)
  const partes = a.partes.filter((x) => x.fim > desde && x.ini < ate)
  const marcas = partes.map((x, i) => ({ id: `${PREFIXO_MARCADOR}${i}`, q: Math.max(0, Q(Math.max(x.ini, desde))), nome: x.nome, cor: o.cores_partes[x.tipo] || 'azul', nota: 'Parte da música, medida pela batida e pela harmonia.' }))
  const deles = (p.marcadores || []).filter((k) => !k.id.startsWith(PREFIXO_MARCADOR))
  projeto.marcadores = [...deles, ...marcas].sort((x, y) => x.q - y.q || x.id.localeCompare(y.id))
  projeto.auto = { ...a, ajustes: { ritmo: ajustes.ritmo || 'normal', broll: ajustes.broll || 'pouco', semente, desde, ate } }
  return { projeto, planos }
}

/** O trecho da música de um clipe da linha: { a, b (s da música), parte } ou null (sem trilha ou clipe fora). */
export function trechoDoClipe(p, id) {
  const pos = posicoes(p.linha).find((x) => x.clipe.id === id)
  if (!pos || !p.trilha) return null
  const a = musicaNoQuadro(p, pos.inicio)
  const b = musicaNoQuadro(p, pos.inicio + tamanho(pos.clipe))
  return { a: r3(a), b: r3(b), parte: p.auto?.partes ? parteEm(p.auto.partes, a) : -1, inicio: pos.inicio }
}

/** As outras opções para um clipe (da revisão): [{ midia, nome, de, tipo, nota }]. */
export function alternativasDoClipe(p, id, n = 4) {
  const tr = trechoDoClipe(p, id)
  const c = p.linha.clipes.find((x) => x.id === id)
  if (!tr || !c || !p.auto) return []
  const alts = alternativasEm(tomadasDa(p), tr.a, tr.b, { atual: { midia: c.midia, de: paraSegundos(c.ini, p.fps) }, n })
  return alts.map((x) => ({ ...x, nome: p.midias.find((m) => m.id === x.midia)?.nome || '' }))
}

/** Troca o plano do clipe por uma alternativa (mesmo tamanho na linha; a performance continua em sincronia). */
export function trocarPlano(p, id, alt) {
  const i = p.linha.clipes.findIndex((x) => x.id === id)
  const c = p.linha.clipes[i]
  const m = p.midias.find((x) => x.id === alt?.midia)
  const tr = trechoDoClipe(p, id)
  if (!c || !m || !tr) return p
  const len = tamanho(c)
  const t = p.auto?.tomadas?.[alt.midia]
  let ini = alt.tipo === 'performance' && Number.isFinite(t?.inicio) ? tr.inicio + paraQuadros(p.trilha.desde - t.inicio, p.fps) : paraQuadros(alt.de, p.fps)
  ini = Math.max(0, Math.min(ini, m.quadros - len))
  const novo = { ...c, midia: m.id, ini, fim: ini + len }
  delete novo.velocidade
  delete novo.estabilizar
  delete novo.faixas
  if (alt.tipo === 'performance') delete novo.etiqueta
  else novo.etiqueta = 'B-roll'
  const clipes = p.linha.clipes.slice()
  clipes[i] = novo
  return { ...p, linha: { ...p.linha, clipes } }
}

/**
 * Zoom na batida (punch-in) como propostas para aprovar no Revisar: em cada compasso das partes escolhidas (o refrão,
 * por padrão) que cai no meio de um plano, um zoom curto de `batidas` batidas. [{ id, tipo: 'zoom', midia, ini, fim
 * (s da mídia), escala, foco, estado, motivo }].
 */
export function zoomsNaBatida(p, o) {
  const a = p.auto
  if (!a?.compassos || !p.trilha) return []
  const z = o.zoom_na_batida
  const batida = 60 / (a.bpm || 120)
  const out = []
  const pos = posicoes(p.linha)
  for (const k of a.compassos) {
    const parte = a.partes[parteEm(a.partes, k)]
    if (!parte || !z.partes.includes(parte.tipo)) continue
    const q = paraQuadros(k - p.trilha.desde, p.fps)
    const x = pos.find((y) => q > y.inicio + 1 && q < y.inicio + tamanho(y.clipe) - 1)
    if (!x || x.clipe.velocidade) continue
    const ini = paraSegundos(x.clipe.ini + (q - x.inicio), p.fps)
    const fim = Math.min(paraSegundos(x.clipe.fim, p.fps), ini + z.batidas * batida)
    if (fim - ini < 0.1) continue
    out.push({ id: `zb${Date.now().toString(36)}${out.length}`, tipo: 'zoom', midia: x.clipe.midia, ini: r3(ini), fim: r3(fim), escala: z.escala, foco: { ...z.foco }, estado: 'pendente', motivo: `batida do ${parte.nome}` })
  }
  return out
}

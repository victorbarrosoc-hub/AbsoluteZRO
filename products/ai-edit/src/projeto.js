// O projeto inteiro é um valor imutável: mídias, transcrições, propostas, linha do tempo e legenda. Cada ação da tela
// devolve um projeto novo e o Historico (linha.js) guarda as versões: desfazer vale para tudo (corte, aprovação,
// texto da legenda).

import { duracao, fonteParaLinha, linhaInicial, removerTrechos, tamanho } from './linha.js'
import { marcar } from './propostas.js'
import { fpsDe, paraQuadros, paraSegundos } from './tempo.js'
import { PRODUTO } from './produto.js'
import { corDaMidia } from './cores.js'

export const VERSAO = 1

/**
 * midias: [{ id, nome, caminho?, duracao (s), fps?, largura?, altura?, temVideo, temAudio }]. O fps e o tamanho da
 * linha vêm da primeira mídia com vídeo (30 quadros e 1920×1080 sem vídeo nenhum).
 */
export function novoProjeto({ id, nome, midias = [], preset, fps: fpsPedido, largura, altura }) {
  const video = midias.find((m) => m.temVideo && m.fps)
  const fps = fpsDe(fpsPedido || (video ? video.fps : 30))
  const ms = midias.map((m, i) => ({ cor: corDaMidia(i), ...m, quadros: paraQuadros(m.duracao, fps) }))
  return {
    formato: `${PRODUTO.id}/projeto`,
    versao: VERSAO,
    id: id || cryptoId(),
    nome: nome || ms[0]?.nome?.replace(/\.[^.]+$/, '') || 'Projeto',
    fps,
    largura: largura || video?.largura || 1920,
    altura: altura || video?.altura || 1080,
    marcadores: [],
    midias: ms,
    sons: [],
    efeitos: [],
    transcricoes: {},
    propostas: [],
    linha: linhaInicial(ms),
    legenda: { ligada: true, estilo: preset?.legenda?.estilo || 'destaque', textos: {} },
    preset: preset ? { nome: preset.preset, versao: preset.version } : null,
  }
}

function cryptoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  // ambiente sem crypto.randomUUID: UUID v4 com Math.random (só identifica o projeto, não protege nada)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const midiaPorId = (p, id) => p.midias.find((m) => m.id === id)

/**
 * Tira uma ou várias mídias do projeto (um passo só no Desfazer): some a mídia, os clipes dela na linha, os efeitos presos
 * a ela, a trilha que toca essa mídia, a transcrição, as propostas e as correções da legenda. O arquivo no computador não é tocado (o app nunca apaga mídia) e o Desfazer traz tudo de volta.
 */
export function removerMidia(p, ids) {
  const fora = new Set(Array.isArray(ids) ? ids : [ids])
  if (!p.midias.some((m) => fora.has(m.id))) return p
  const sem = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !fora.has(k)))
  // a trilha (src/trilha.js) sai junto com a música dela
  const { trilha, ...resto } = p
  return {
    ...resto,
    ...(trilha && !fora.has(trilha.midia) ? { trilha } : {}),
    midias: p.midias.filter((m) => !fora.has(m.id)),
    linha: { ...p.linha, clipes: p.linha.clipes.filter((c) => !fora.has(c.midia)) },
    efeitos: (p.efeitos || []).filter((e) => !fora.has(e.midia)),
    transcricoes: sem(p.transcricoes),
    propostas: p.propostas.filter((x) => !fora.has(x.midia)),
    legenda: { ...p.legenda, textos: sem(p.legenda.textos) },
  }
}

/** Guarda a transcrição de uma mídia (substitui a anterior e as propostas que dependiam dela continuam). */
export function comTranscricao(p, midia, transcricao) {
  return { ...p, transcricoes: { ...p.transcricoes, [midia]: transcricao } }
}

/** Troca as propostas pendentes de um tipo por novas (aprovadas e recusadas ficam). */
export function comPropostas(p, novas, tipos) {
  const t = new Set(tipos)
  const ficam = p.propostas.filter((x) => !(t.has(x.tipo) && x.estado === 'pendente' && novas.some((n) => n.midia === x.midia)))
  return { ...p, propostas: [...ficam, ...novas].sort((a, b) => a.ini - b.ini) }
}

const trechoEmQuadros = (p, x) => ({ ini: paraQuadros(x.ini, p.fps), fim: paraQuadros(x.fim, p.fps) })

/** Aprova: zoom só muda de estado; corte também sai da linha do tempo. */
export function aprovar(p, ids) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  const cortes = p.propostas.filter((x) => alvo.has(x.id) && x.tipo !== 'zoom' && x.estado !== 'aprovada')
  let linha = p.linha
  for (const m of new Set(cortes.map((c) => c.midia)))
    linha = removerTrechos(
      linha,
      m,
      cortes.filter((c) => c.midia === m).map((c) => trechoEmQuadros(p, c)),
    )
  const propostas = marcar(p.propostas, [...alvo], 'aprovada')
  return propostas === p.propostas && linha === p.linha ? p : { ...p, propostas, linha }
}

/**
 * Recusa. Um corte que já estava aprovado volta para a linha se os dois lados ainda estão juntos (não foram movidos);
 * senão a recusa é só da proposta e o caminho é o Desfazer.
 */
export function recusar(p, ids) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  let linha = p.linha
  for (const x of p.propostas)
    if (alvo.has(x.id) && x.tipo !== 'zoom' && x.estado === 'aprovada') linha = restaurarTrecho(linha, x.midia, trechoEmQuadros(p, x)) || linha
  const propostas = marcar(p.propostas, [...alvo], 'recusada')
  return propostas === p.propostas && linha === p.linha ? p : { ...p, propostas, linha }
}

/** Põe de volta um trecho cortado entre dois clipes vizinhos da mesma mídia. null se não dá. */
export function restaurarTrecho(linha, midia, { ini, fim }) {
  const cs = linha.clipes
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i]
    const b = cs[i + 1]
    if (a.midia !== midia) continue
    if (a.fim === ini && b && b.midia === midia && b.ini === fim) {
      const clipes = [...cs.slice(0, i), { ...a, fim: b.fim }, ...cs.slice(i + 2)]
      return { ...linha, clipes }
    }
    if (a.ini === fim && (i === 0 || cs[i - 1].midia !== midia || cs[i - 1].fim !== ini) && ini === 0) {
      const clipes = cs.slice()
      clipes[i] = { ...a, ini }
      return { ...linha, clipes }
    }
    if (a.fim === ini && (!b || b.midia !== midia) && cs.filter((c) => c.midia === midia && c.ini >= fim).length === 0) {
      const clipes = cs.slice()
      clipes[i] = { ...a, fim }
      return { ...linha, clipes }
    }
  }
  return null
}

/** Marcador na linha do tempo (quadro da linha), com nome opcional. */
export function adicionarMarcador(p, q, nome = '') {
  const qq = Math.max(0, Math.round(q))
  const ms = p.marcadores || []
  if (ms.some((m) => m.q === qq)) return p
  const id = `k${Date.now().toString(36)}${ms.length}`
  return { ...p, marcadores: [...ms, { id, q: qq, nome: String(nome).slice(0, 60) }].sort((a, b) => a.q - b.q) }
}
export const removerMarcador = (p, id) => ({ ...p, marcadores: (p.marcadores || []).filter((m) => m.id !== id) })

/** Zooms aprovados de uma mídia, em quadros de origem. */
export function zoomsAprovados(p) {
  return p.propostas.filter((x) => x.tipo === 'zoom' && x.estado === 'aprovada').map((x) => ({ ...x, qIni: paraQuadros(x.ini, p.fps), qFim: paraQuadros(x.fim, p.fps) }))
}

/** Texto de uma palavra com a correção da pessoa ('' = palavra apagada da legenda). */
export function textoDa(p, midia, i, original) {
  const t = p.legenda.textos[midia]?.[i]
  return t === undefined ? original : t
}

/** Corrige uma palavra da legenda. */
export function editarPalavra(p, midia, i, texto) {
  const original = p.transcricoes[midia]?.palavras?.[i]?.texto
  const atual = textoDa(p, midia, i, original)
  const novo = String(texto).replace(/\s+/g, ' ').trim()
  if (novo === atual) return p
  const daMidia = { ...(p.legenda.textos[midia] || {}) }
  if (novo === original?.trim()) delete daMidia[i]
  else daMidia[i] = novo
  return { ...p, legenda: { ...p.legenda, textos: { ...p.legenda.textos, [midia]: daMidia } } }
}

/**
 * Palavras na linha do tempo (segundos da linha), já com as correções e sem as que caíram num corte. É o que a
 * legenda desenha e o que o SRT exporta.
 */
export function palavrasNaLinha(p) {
  const out = []
  for (const [midia, tr] of Object.entries(p.transcricoes)) {
    tr.palavras.forEach((w, i) => {
      const texto = textoDa(p, midia, i, w.texto).trim()
      if (!texto) return
      // a palavra entra se o meio dela está na linha; o fim acompanha o pedaço em que ela começa
      const meio = paraQuadros((w.ini + w.fim) / 2, p.fps)
      const qm = fonteParaLinha(p.linha, midia, meio)
      if (qm === null) return
      const desloc = qm - meio
      const ini = Math.max(0, paraSegundos(paraQuadros(w.ini, p.fps) + desloc, p.fps))
      const fim = paraSegundos(paraQuadros(w.fim, p.fps) + desloc, p.fps)
      out.push({ midia, i, texto, ini, fim: Math.max(fim, ini + 0.05) })
    })
  }
  return out.sort((a, b) => a.ini - b.ini)
}

/** Números do projeto para a tela e para a medição da demo. */
export function numeros(p) {
  const original = p.midias.reduce((s, m) => s + m.duracao, 0)
  const final = paraSegundos(duracao(p.linha), p.fps)
  return { original, final, cortado: Math.max(0, original - final), clipes: p.linha.clipes.length, maiorClipe: Math.max(0, ...p.linha.clipes.map((c) => paraSegundos(tamanho(c), p.fps))) }
}

/** Projeto → texto para salvar (.zroedit). */
export const salvar = (p) => JSON.stringify(p)

/** Texto de um .zroedit → projeto, conferindo o básico. */
export function abrir(texto) {
  const p = JSON.parse(texto)
  if (!p || p.formato !== `${PRODUTO.id}/projeto`) throw new Error('Este arquivo não é um projeto do editor.')
  if (p.versao > VERSAO) throw new Error('Projeto de uma versão mais nova do app. Atualize o app.')
  if (!p.fps?.n || !p.fps?.d || !Array.isArray(p.midias) || !Array.isArray(p.linha?.clipes)) throw new Error('Projeto incompleto.')
  return { marcadores: [], sons: [], efeitos: [], ...p }
}

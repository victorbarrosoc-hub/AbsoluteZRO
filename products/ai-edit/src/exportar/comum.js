// Peças comuns dos exportadores: escape de XML, caminho do arquivo no disco de quem edita e a linha do tempo em
// segmentos de zoom e velocidade constantes (cada editor recebe o zoom como escala do clipe e a velocidade como
// velocidade constante do clipe, então um clipe com dois zooms vira dois e uma rampa vira seus degraus).


import { zoomsAprovados } from '../projeto.js'
import { zoomEm } from '../quadro.js'
import { ajustesDe, tamanho } from '../linha.js'
import { corDoClipe } from '../cores.js'
import { modoDe, pedacos, saidaNoClipe } from '../velocidade.js'
import { posicionar } from '../quadro.js'
import { efeitosNaLinha, faixas } from '../efeitos.js'
import { paraQuadros, paraSegundos } from '../tempo.js'
import { faixasDoClipe } from '../faixas.js'
import { trilhaNaLinha } from '../trilha.js'
import { duracao } from '../linha.js'

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

const encSeg = (s) => encodeURIComponent(s).replace(/%2C/g, ',').replace(/%40/g, '@').replace(/%2B/g, '+').replace(/%3D/g, '=').replace(/%26/g, '&')

/** Caminho da mídia: o absoluto quando o app de desktop sabe (o editor acha sem revincular); senão só o nome. */
export const caminhoDa = (m) => m.caminho || m.nome

/** file:///… (FCPXML, OTIO). Nome solto vira relativo ao arquivo exportado. */
export function fileUrl(caminho) {
  const p = caminho.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(p)) return 'file:///' + p.slice(0, 2) + p.slice(2).split('/').map(encSeg).join('/')
  if (!p.startsWith('/')) return p.split('/').map(encSeg).join('/')
  return 'file://' + p.split('/').map((s, i) => (i === 0 ? '' : encSeg(s))).join('/')
}

/** file://localhost/… do XML do Final Cut 7 (Premiere, Resolve): o ":" do drive vira %3a. */
export function pathUrl(caminho) {
  const p = caminho.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(p)) return 'file://localhost/' + p[0] + '%3a' + p.slice(2).split('/').map(encSeg).join('/')
  if (!p.startsWith('/')) return p.split('/').map(encSeg).join('/')
  return 'file://localhost' + p.split('/').map((s, i) => (i === 0 ? '' : encSeg(s))).join('/')
}

/** Nome de arquivo seguro a partir do nome do projeto. */
export const nomeArquivo = (s) =>
  String(s || 'projeto')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'projeto'

/**
 * A linha em segmentos: [{ midia, ini, fim (quadros de origem), linha (quadro na linha), saida (quadros na linha), v
 * (velocidade), som (toca o som?), escala, foco, cor, etiqueta }], quebrando o clipe onde o zoom aprovado muda e nos
 * degraus da curva de velocidade (src/velocidade.js).
 */
export function segmentos(p) {
  const zooms = zoomsAprovados(p)
  const out = []
  let t = 0
  for (const c of p.linha.clipes) {
    const cortes = new Set([c.ini, c.fim])
    for (const z of zooms) if (z.midia === c.midia) for (const q of [z.qIni, z.qFim]) if (q > c.ini && q < c.fim) cortes.add(q)
    const pts = [...cortes].sort((a, b) => a - b)
    for (let i = 0; i < pts.length - 1; i++) {
      const z = zoomEm(zooms, c.midia, pts[i])
      for (const pc of pedacos(c, pts[i], pts[i + 1]))
        out.push({ clipe: c.id, midia: c.midia, ini: pc.ini, fim: pc.fim, linha: t + Math.round(saidaNoClipe(c, pc.ini)), saida: pc.saida, v: pc.v, som: pc.som, modo: modoDe(c), escala: z.escala, foco: z.foco, cor: corDoClipe(p, c), etiqueta: c.etiqueta || null, ajustes: ajustesDe(c), faixas: faixasDoClipe(p, c) })
    }
    t += tamanho(c)
  }
  return out
}

/**
 * Escala total e deslocamento do centro (px da saída, y para baixo) de um segmento: ajustes do clipe + zoom, pela
 * mesma conta da prévia e do render. Escala 1 = a mídia cabe no quadro.
 */
export function transformacao(p, s) {
  const m = p.midias.find((x) => x.id === s.midia) || {}
  const cw = m.largura || p.largura
  const ch = m.altura || p.altura
  const base = posicionar(p.largura, p.altura, cw, ch)
  const r = posicionar(p.largura, p.altura, cw, ch, s.ajustes, { escala: s.escala, foco: s.foco })
  return { escala: r.w / base.w, cx: r.x + r.w / 2 - p.largura / 2, cy: r.y + r.h / 2 - p.altura / 2 }
}

/** Marcadores que caem dentro de um segmento: [{ nome, nota, cor, q (quadro de origem) }]. */
export const marcadoresDe = (p, s) =>
  (p.marcadores || []).filter((k) => k.q >= s.linha && k.q < s.linha + s.saida).map((k) => ({ nome: k.nome || 'Marcador', nota: k.nota || '', cor: k.cor || null, q: s.ini + Math.round((k.q - s.linha) * s.v) }))

/** Cor do marcador no OpenTimelineIO (o enum de lá). */
export const COR_OTIO = Object.freeze({ laranja: 'ORANGE', amarelo: 'YELLOW', verde: 'GREEN', menta: 'CYAN', azul: 'BLUE', roxo: 'PURPLE', rosa: 'PINK', areia: 'YELLOW' })

/**
 * Efeitos sonoros para os exportadores: [{ ...x de efeitosNaLinha, faixa (0, 1, …), seg (segmento onde começa),
 * quadrosSom (duração do arquivo em quadros) }]. Cada faixa não tem sobreposição.
 */
export function efeitosExportados(p) {
  const segs = segmentos(p)
  return faixas(p).flatMap((fx, faixa) =>
    fx.map((x) => ({ ...x, faixa, seg: segs.find((s) => x.inicio >= s.linha && x.inicio < s.linha + s.saida), quadrosSom: Math.max(1, paraQuadros(x.som.duracao, p.fps)) })),
  )
}

/**
 * Efeito que veio de um banco (sem arquivo no disco de quem edita): o arquivo vai junto na entrega, ao lado do XML, com
 * este nome; o XML aponta para ele pelo caminho relativo.
 */
export const arquivoDoSom = (s) => `Efeito - ${nomeArquivo(s.nome)}`
export const caminhoDoSom = (s) => s.caminho || arquivoDoSom(s)

/** Arquivo WAV de uma faixa separada (voz ou instrumental) de uma separação, ao lado do XML na entrega. */
export function arquivoDaFaixa(p, sep, parte) {
  const m = p.midias.find((x) => x.id === sep.midia)
  return `${nomeArquivo((m?.nome || 'som').replace(/\.[^.]+$/, ''))} - ${parte === 'voz' ? 'Voz' : 'Instrumental'} ${Math.round(sep.ini)}s.wav`
}

/**
 * Voz e instrumental separados pela NOSSOM para os exportadores: um pedaço por segmento com faixas (em 100%, onde o
 * som toca) e por faixa que não está muda. [{ seg, parte, sep, volume (dB, já com o do clipe), desde (quadros da
 * separação até o começo do pedaço), arquivo }]. O som original desses segmentos vai calado (as duas somam ele).
 */
export function faixasExportadas(p) {
  const out = []
  for (const s of segmentos(p))
    if (s.som && s.faixas)
      for (const parte of ['voz', 'instrumental']) {
        const v = s.faixas[parte]
        if (v === null) continue
        out.push({ seg: s, parte, sep: s.faixas.sep, volume: Math.round((v + s.ajustes.volume) * 10) / 10, desde: paraQuadros(paraSegundos(s.ini, p.fps) - s.faixas.sep.ini, p.fps), arquivo: arquivoDaFaixa(p, s.faixas.sep, parte) })
      }
  return out
}

/** Os arquivos de faixa que a entrega precisa: [{ sep, parte, arquivo, quadros }], um por separação e faixa usadas. */
export function arquivosDeFaixas(p) {
  const vistos = new Map()
  for (const x of faixasExportadas(p)) if (!vistos.has(x.arquivo)) vistos.set(x.arquivo, { sep: x.sep, parte: x.parte, arquivo: x.arquivo, quadros: Math.max(1, paraQuadros(x.sep.fim - x.sep.ini, p.fps)) })
  return [...vistos.values()]
}

/** Sons usados na linha, na ordem do projeto (cada um vira um arquivo/asset no exportador). */
export const sonsUsados = (p) => {
  const usados = new Set(efeitosNaLinha(p).map((x) => x.som.id))
  return (p.sons || []).filter((s) => usados.has(s.id))
}

/**
 * A trilha (src/trilha.js) para os exportadores: { midia, desde (quadros da música no começo da linha), quadros (na
 * linha), volume (dB) } ou null. Vai numa faixa de áudio própria, do quadro 0 da linha, com a função "music".
 */
export function trilhaExportada(p) {
  const t = trilhaNaLinha(p)
  return t ? { midia: t.midia, desde: paraQuadros(t.desde, p.fps), quadros: Math.max(1, Math.min(duracao(p.linha), paraQuadros(t.dur, p.fps))), volume: t.volume } : null
}

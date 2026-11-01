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
import { paraQuadros } from '../tempo.js'

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
        out.push({ clipe: c.id, midia: c.midia, ini: pc.ini, fim: pc.fim, linha: t + Math.round(saidaNoClipe(c, pc.ini)), saida: pc.saida, v: pc.v, som: pc.som, modo: modoDe(c), escala: z.escala, foco: z.foco, cor: corDoClipe(p, c), etiqueta: c.etiqueta || null, ajustes: ajustesDe(c) })
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

/** Sons usados na linha, na ordem do projeto (cada um vira um arquivo/asset no exportador). */
export const sonsUsados = (p) => {
  const usados = new Set(efeitosNaLinha(p).map((x) => x.som.id))
  return (p.sons || []).filter((s) => usados.has(s.id))
}

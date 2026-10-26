// Peças comuns dos exportadores: escape de XML, caminho do arquivo no disco de quem edita e a linha do tempo em
// segmentos de zoom constante (cada editor recebe o zoom como escala do clipe, então um clipe com dois zooms vira dois).

import { zoomsAprovados } from '../projeto.js'
import { zoomEm } from '../quadro.js'
import { ajustesDe, tamanho } from '../linha.js'
import { corDoClipe } from '../cores.js'
import { posicionar } from '../quadro.js'

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
 * A linha em segmentos: [{ midia, ini, fim (quadros de origem), linha (quadro na linha), escala, foco, cor, etiqueta }], quebrando o
 * clipe onde o zoom aprovado muda.
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
      out.push({ clipe: c.id, midia: c.midia, ini: pts[i], fim: pts[i + 1], linha: t + (pts[i] - c.ini), escala: z.escala, foco: z.foco, cor: corDoClipe(p, c), etiqueta: c.etiqueta || null, ajustes: ajustesDe(c) })
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

/** Marcadores que caem dentro de um segmento: [{ nome, q (quadro de origem) }]. */
export const marcadoresDe = (p, s) => (p.marcadores || []).filter((k) => k.q >= s.linha && k.q < s.linha + (s.fim - s.ini)).map((k) => ({ nome: k.nome || 'Marcador', q: s.ini + (k.q - s.linha) }))

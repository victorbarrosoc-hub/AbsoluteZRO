// QR do link da diária, desenhado como SVG (preto no branco nos dois temas: é o que a câmera lê melhor).
import qrcode from './vendor/qrcode.mjs'

const NS = 'http://www.w3.org/2000/svg'

export function desenharQr(alvo, texto) {
  const q = qrcode(0, 'M')
  q.addData(texto)
  q.make()
  const n = q.getModuleCount()
  const m = 4
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${n + m * 2} ${n + m * 2}`)
  svg.setAttribute('shape-rendering', 'crispEdges')
  const fundo = document.createElementNS(NS, 'rect')
  fundo.setAttribute('width', String(n + m * 2))
  fundo.setAttribute('height', String(n + m * 2))
  fundo.setAttribute('fill', '#ffffff')
  svg.append(fundo)
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', d)
  p.setAttribute('fill', '#000000')
  svg.append(p)
  alvo.replaceChildren(svg)
}

// O cartaz A4 do evento, gerado no aparelho: o aviso de B.4 (docs/estudo/rosto-em-evento.md) e o QR do link, para
// imprimir e pôr na entrada. PNG de 150 ppi (1240 × 1754), preto no branco, Figtree. O QR vem do gerador da casa
// (app/telas/entregar/qr.js, conferido módulo a módulo contra o de Kazuhiko Arase).

import { qrMatriz } from '../telas/entregar/qr.js'
import { comPrazo, TEXTOS } from '../../src/rosto/textos.js'

const L = 1240
const A = 1754

function quebrar(ctx, texto, largura) {
  const linhas = []
  let atual = ''
  for (const p of texto.split(/\s+/)) {
    const tenta = atual ? `${atual} ${p}` : p
    if (ctx.measureText(tenta).width > largura && atual) {
      linhas.push(atual)
      atual = p
    } else atual = tenta
  }
  if (atual) linhas.push(atual)
  return linhas
}

/** { endereco, nome, data?, modo, prazo } → Blob PNG. */
export async function cartazA4({ endereco, nome, data = null, modo, prazo }) {
  await Promise.all([300, 700, 800].map((p) => document.fonts?.load?.(`${p} 40px "Figtree Variable"`).catch(() => {})))
  const tela = new OffscreenCanvas(L, A)
  const c = tela.getContext('2d')
  const fonte = (peso, px) => `${peso} ${px}px "Figtree Variable", system-ui, sans-serif`
  c.fillStyle = '#fff'
  c.fillRect(0, 0, L, A)
  c.fillStyle = '#1d1d1f'
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  const t = TEXTOS[modo === 'aberta' ? 'cartazAberta' : 'cartazConsentimento']

  c.font = fonte(800, 80)
  let y = 230
  for (const linha of quebrar(c, t.titulo, L - 200)) {
    c.fillText(linha, L / 2, y)
    y += 92
  }
  c.font = fonte(300, 44)
  c.fillStyle = '#6e6e73'
  const dia = data ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${data}T12:00:00`)) : ''
  c.fillText([nome, dia].filter(Boolean).join(' · '), L / 2, y + 10)

  // o QR, grande, com a margem branca de 4 módulos
  const { tamanho: n, modulos } = qrMatriz(endereco)
  const lado = 760
  const m = lado / (n + 8)
  const x0 = (L - lado) / 2
  const y0 = y + 80
  c.fillStyle = '#000'
  for (let r = 0; r < n; r++)
    for (let k = 0; k < n; k++) if (modulos[r][k]) c.fillRect(Math.floor(x0 + (k + 4) * m), Math.floor(y0 + (r + 4) * m), Math.ceil(m), Math.ceil(m))

  c.fillStyle = '#1d1d1f'
  c.font = fonte(400, 40)
  y = y0 + lado + 90
  for (const linha of quebrar(c, comPrazo(t.corpo, prazo), L - 240)) {
    c.fillText(linha, L / 2, y)
    y += 56
  }
  c.font = fonte(700, 26)
  c.fillStyle = '#6e6e73'
  c.fillText('Absolute ZRO', L / 2, A - 90)
  return tela.convertToBlob({ type: 'image/png' })
}

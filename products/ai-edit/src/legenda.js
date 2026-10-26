// Legenda animada: agrupa as palavras da linha do tempo em blocos curtos, exporta SRT/VTT e desenha num canvas.
// A prévia e o render chamam o mesmo desenhar(), com o mesmo tamanho relativo: a legenda sai como foi vista.

/** palavras: [{ texto, ini, fim }] em segundos da linha → blocos [{ ini, fim, palavras }]. cfg = preset.legenda */
export function agrupar(palavras, cfg) {
  const blocos = []
  let atual = null
  const fechar = () => {
    if (atual) blocos.push(atual)
    atual = null
  }
  for (const w of palavras) {
    const texto = cfg.caixa_alta ? w.texto.toLocaleUpperCase('pt-BR') : w.texto
    const p = { ...w, texto }
    if (atual) {
      const chars = atual.palavras.reduce((s, x) => s + x.texto.length + 1, 0) + texto.length
      const pausa = p.ini - atual.fim
      const fimDeFrase = /[.!?…:;]["”']?$/.test(atual.palavras.at(-1).texto)
      if (atual.palavras.length >= cfg.max_palavras || chars > cfg.max_caracteres || p.fim - atual.ini > cfg.max_s || pausa > cfg.pausa_quebra_s || fimDeFrase) fechar()
    }
    if (!atual) atual = { ini: p.ini, fim: p.fim, palavras: [] }
    atual.palavras.push(p)
    atual.fim = p.fim
  }
  fechar()
  // cada bloco fica na tela até o próximo começar (se a pausa for curta), sem piscar
  for (let i = 0; i < blocos.length - 1; i++) {
    const prox = blocos[i + 1]
    if (prox.ini - blocos[i].fim < 0.4) blocos[i].fim = prox.ini
  }
  return blocos
}

const linhaTexto = (b) => b.palavras.map((p) => p.texto).join(' ')

function tc(s, sep) {
  const ms = Math.max(0, Math.round(s * 1000))
  const p = (x, n = 2) => String(x).padStart(n, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`
}

export const srt = (blocos) => blocos.map((b, i) => `${i + 1}\n${tc(b.ini, ',')} --> ${tc(b.fim, ',')}\n${linhaTexto(b)}\n`).join('\n')
export const vtt = (blocos) => `WEBVTT\n\n${blocos.map((b) => `${tc(b.ini, '.')} --> ${tc(b.fim, '.')}\n${linhaTexto(b)}\n`).join('\n')}`

/** Bloco que aparece no instante t (busca binária: chamado a cada quadro). */
export function blocoEm(blocos, t) {
  let a = 0
  let b = blocos.length - 1
  while (a <= b) {
    const m = (a + b) >> 1
    if (blocos[m].fim <= t) a = m + 1
    else if (blocos[m].ini > t) b = m - 1
    else return blocos[m]
  }
  return null
}

export const FONTE_LEGENDA = '"Figtree", "Inter", -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif'

/**
 * Desenha a legenda do instante t num contexto 2D de largura l e altura a (o quadro inteiro do vídeo).
 * Estilos: destaque (a palavra falada acende, as próximas esperam apagadas), pop (cada palavra entra crescendo),
 * limpa (bloco inteiro, sem animação). Sempre branco com sombra: lê em qualquer imagem.
 */
export function desenhar(ctx, blocos, t, l, a, { estilo = 'destaque', posicaoY = 0.8 } = {}) {
  const b = blocoEm(blocos, t)
  if (!b) return
  const tam = Math.round(Math.min(l, a * 1.25) * 0.058)
  ctx.save()
  ctx.font = `800 ${tam}px ${FONTE_LEGENDA}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const espaco = ctx.measureText(' ').width
  const maxL = l * 0.84
  // quebra em linhas que cabem na largura
  const linhas = [[]]
  let larg = 0
  for (const p of b.palavras) {
    const w = ctx.measureText(p.texto).width
    if (linhas.at(-1).length && larg + espaco + w > maxL) {
      linhas.push([])
      larg = 0
    }
    larg += (linhas.at(-1).length ? espaco : 0) + w
    linhas.at(-1).push({ p, w })
  }
  const alturaLinha = tam * 1.18
  const base = a * posicaoY - (linhas.length - 1) * alturaLinha * 0.5
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = tam * 0.28
  ctx.shadowOffsetY = tam * 0.06
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(2, tam * 0.11)
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  linhas.forEach((ln, k) => {
    const total = ln.reduce((s, x) => s + x.w, 0) + espaco * (ln.length - 1)
    let x = (l - total) / 2
    const y = base + k * alturaLinha
    for (const { p, w } of ln) {
      let alpha = 1
      let escala = 1
      if (estilo === 'destaque') {
        alpha = t >= p.ini ? 1 : 0.42
        if (t >= p.ini && t < p.fim) escala = 1.06
      } else if (estilo === 'pop') {
        const d = (t - p.ini) / 0.12
        if (d < 0) alpha = 0
        else if (d < 1) {
          alpha = d
          escala = 0.82 + 0.18 * (1 - (1 - d) ** 3)
        }
      }
      if (alpha > 0) {
        ctx.globalAlpha = alpha
        ctx.save()
        ctx.translate(x + w / 2, y - tam * 0.35)
        ctx.scale(escala, escala)
        ctx.strokeText(p.texto, -w / 2, tam * 0.35)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(p.texto, -w / 2, tam * 0.35)
        ctx.restore()
      }
      x += w + espaco
    }
  })
  ctx.restore()
}

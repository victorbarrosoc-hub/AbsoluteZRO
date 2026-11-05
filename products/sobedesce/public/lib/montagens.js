// Montagens (Estúdio › Montagens): fotos do computador em modelos prontos, desenhadas num <canvas> em alta.
// Só geometria e desenho, sem rede. Cada modelo é uma lista de caixas em fração (x, y, largura, altura de 0 a 1) e
// vale para qualquer formato: o espaço entre as fotos é o mesmo em px dos dois lados.
import { cobrir, enquadreDe } from './frames-posts.js'

/** Formatos de postagem (titular, 05/11/2026): o tamanho de exportar é o recomendado de cada rede. */
export const FORMATOS = [
  { id: '9x16', nome: 'Vertical', proporcao: '9:16', w: 1080, h: 1920, uso: 'Reels · Stories · TikTok · Shorts' },
  { id: '4x5', nome: 'Feed retrato', proporcao: '4:5', w: 1080, h: 1350, uso: 'Instagram e Facebook' },
  { id: '3x4', nome: 'Perfil', proporcao: '3:4', w: 1080, h: 1440, uso: 'Grade nova do Instagram' },
  { id: '1x1', nome: 'Quadrado', proporcao: '1:1', w: 1080, h: 1080, uso: 'Feed · LinkedIn · carrossel' },
  { id: '16x9', nome: 'Horizontal', proporcao: '16:9', w: 1920, h: 1080, uso: 'YouTube · Vimeo · tela cheia' },
  { id: '1.91x1', nome: 'Link', proporcao: '1.91:1', w: 1200, h: 628, uso: 'LinkedIn · X · prévia de link' },
  { id: '2x3', nome: 'Pinterest', proporcao: '2:3', w: 1000, h: 1500, uso: 'Pin vertical' },
  { id: '21x9', nome: 'Ultrawide', proporcao: '21:9', w: 2560, h: 1080, uso: 'Portfólio · Vimeo · banner' },
  { id: '2.39x1', nome: 'Cinema', proporcao: '2.39:1', w: 2560, h: 1072, uso: 'Scope, como no cinema' },
]

export const formatoPorId = (id) => FORMATOS.find((f) => f.id === id) || FORMATOS[1]

/** Formato personalizado: largura × altura em px (de 200 a 4096 de cada lado). */
export function formatoPersonalizado(w, h) {
  const lw = Math.round(Math.min(4096, Math.max(200, Number(w) || 1080)))
  const lh = Math.round(Math.min(4096, Math.max(200, Number(h) || 1350)))
  return { id: `${lw}x${lh}`, nome: 'Personalizado', proporcao: `${lw}×${lh}`, w: lw, h: lh, uso: 'Largura × altura em px', personalizado: true }
}

const terco = 1 / 3
/** Modelos prontos: os do Instagram (2×2, faixas, um em cima e dois embaixo…) e outros comuns em quem posta foto. */
export const MODELOS = [
  { id: 'uma', nome: 'Uma foto', caixas: [[0, 0, 1, 1]] },
  {
    id: 'duas-lado',
    nome: 'Dois lado a lado',
    caixas: [
      [0, 0, 0.5, 1],
      [0.5, 0, 0.5, 1],
    ],
  },
  {
    id: 'duas-pilha',
    nome: 'Dois empilhados',
    caixas: [
      [0, 0, 1, 0.5],
      [0, 0.5, 1, 0.5],
    ],
  },
  {
    id: 'tres-faixas',
    nome: 'Três faixas',
    caixas: [
      [0, 0, 1, terco],
      [0, terco, 1, terco],
      [0, 2 * terco, 1, terco],
    ],
  },
  {
    id: 'tres-colunas',
    nome: 'Três colunas',
    caixas: [
      [0, 0, terco, 1],
      [terco, 0, terco, 1],
      [2 * terco, 0, terco, 1],
    ],
  },
  {
    id: 'um-dois',
    nome: 'Um em cima, dois embaixo',
    caixas: [
      [0, 0, 1, 0.55],
      [0, 0.55, 0.5, 0.45],
      [0.5, 0.55, 0.5, 0.45],
    ],
  },
  {
    id: 'grande-dois',
    nome: 'Grande e dois',
    caixas: [
      [0, 0, 0.62, 1],
      [0.62, 0, 0.38, 0.5],
      [0.62, 0.5, 0.38, 0.5],
    ],
  },
  {
    id: 'quatro',
    nome: 'Quatro',
    caixas: [
      [0, 0, 0.5, 0.5],
      [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ],
  },
  {
    id: 'grande-tres',
    nome: 'Grande e três',
    caixas: [
      [0, 0, 1, 0.62],
      [0, 0.62, terco, 0.38],
      [terco, 0.62, terco, 0.38],
      [2 * terco, 0.62, terco, 0.38],
    ],
  },
  {
    id: 'mosaico',
    nome: 'Mosaico',
    caixas: [
      [0, 0, 0.58, 0.6],
      [0.58, 0, 0.42, 0.3],
      [0.58, 0.3, 0.42, 0.3],
      [0, 0.6, 0.42, 0.4],
      [0.42, 0.6, 0.58, 0.4],
    ],
  },
  { id: 'seis', nome: 'Seis', caixas: Array.from({ length: 6 }, (_, i) => [(i % 2) / 2, Math.floor(i / 2) * terco, 0.5, terco]) },
  { id: 'nove', nome: 'Nove', caixas: Array.from({ length: 9 }, (_, i) => [(i % 3) * terco, Math.floor(i / 3) * terco, terco, terco]) },
]

export const modeloPorId = (id) => MODELOS.find((m) => m.id === id) || MODELOS[0]

// ── carrossel contínuo e grade do perfil

/** Formatos de cada slide do carrossel e do quadradinho da grade (os que o Instagram mostra no feed e no perfil). */
export const FORMATOS_CARROSSEL = ['4x5', '1x1', '3x4', '9x16']
export const GRADE = { '3x4': { w: 1080, h: 1440, proporcao: '3:4' }, '1x1': { w: 1080, h: 1080, proporcao: '1:1' } }
export const COLUNAS_GRADE = 3

/**
 * A tela inteira da montagem: o post; o carrossel com os slides lado a lado; a grade com 3 colunas e `linhas` linhas.
 * @returns {{ id: string, nome: string, proporcao: string, w: number, h: number, fatias: { x, y, w, h, n: number }[] }}
 */
export function telaDe({ tipo = 'post', formato, slides = 3, linhas = 2, quadrado = '3x4' }) {
  const f = typeof formato === 'string' ? formatoPorId(formato) : formato
  if (tipo === 'carrossel') {
    const n = Math.max(2, Math.min(10, Math.round(slides) || 2))
    const fatias = Array.from({ length: n }, (_, i) => ({ x: i * f.w, y: 0, w: f.w, h: f.h, n: i + 1 }))
    return { id: f.id, nome: `Carrossel ${f.proporcao}`, proporcao: f.proporcao, w: f.w * n, h: f.h, fatias }
  }
  if (tipo === 'grade') {
    const g = GRADE[quadrado] || GRADE['3x4']
    const l = Math.max(1, Math.min(5, Math.round(linhas) || 1))
    const fatias = []
    for (let r = 0; r < l; r++) for (let c = 0; c < COLUNAS_GRADE; c++) fatias.push({ x: c * g.w, y: r * g.h, w: g.w, h: g.h, n: ordemDePostar(r, c, l) })
    return { id: quadrado in GRADE ? quadrado : '3x4', nome: `Grade ${COLUNAS_GRADE}×${l}`, proporcao: g.proporcao, w: g.w * COLUNAS_GRADE, h: g.h * l, fatias }
  }
  return { ...f, fatias: [{ x: 0, y: 0, w: f.w, h: f.h, n: 1 }] }
}

/**
 * Na grade do perfil, o post mais novo fica em cima, à esquerda: o primeiro a postar é o de baixo, à direita.
 * Devolve 1 para o primeiro a postar.
 */
export function ordemDePostar(linha, coluna, linhas, colunas = COLUNAS_GRADE) {
  return (linhas - 1 - linha) * colunas + (colunas - 1 - coluna) + 1
}

/** O trecho de um take: começo (s) e câmera lenta; o trecho tem a duração da montagem (metade, se lento). */
export function trechoDe(t, duracao, total) {
  const lento = t?.lento === true
  const janela = Math.min(total || Infinity, lento ? duracao / 2 : duracao)
  const max = Math.max(0, (total || 0) - janela)
  const inicio = Math.min(max, Math.max(0, Number.isFinite(t?.inicio) ? t.inicio : 0))
  return { inicio, lento, janela, fim: inicio + janela }
}

/** Modelos para N fotos: os que usam exatamente N primeiro, depois o resto. */
export function modelosPara(n) {
  return [...MODELOS].sort((a, b) => Number(b.caixas.length === n) - Number(a.caixas.length === n))
}

const quase = (a, b) => Math.abs(a - b) < 1e-6

/**
 * As caixas em px de uma montagem `w`×`h`. `espaco` (px) separa as fotos e afasta da borda; com `borda: false`, as
 * fotos encostam na borda e o espaço fica só entre elas.
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function caixasDe(modelo, { w, h, espaco = 0, borda = true }) {
  const m = typeof modelo === 'string' ? modeloPorId(modelo) : modelo
  const e = Math.max(0, espaco)
  const fora = borda ? e : 0
  return m.caixas.map(([fx, fy, fw, fh]) => {
    const esq = quase(fx, 0) ? fora : e / 2
    const dir = quase(fx + fw, 1) ? fora : e / 2
    const cima = quase(fy, 0) ? fora : e / 2
    const baixo = quase(fy + fh, 1) ? fora : e / 2
    const x = fx * w + esq
    const y = fy * h + cima
    return { x, y, w: Math.max(1, fw * w - esq - dir), h: Math.max(1, fh * h - cima - baixo) }
  })
}

/** Qual quadro está no ponto (px da montagem)? Devolve o índice ou -1. */
export function quadroNoPonto(modelo, opts, px, py) {
  const cx = caixasDe(modelo, opts)
  return cx.findIndex((c) => px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h)
}

/** Trocar o conteúdo de dois quadros (foto e enquadre vão juntos). */
export function trocarQuadros(fotos, enquadres, a, b) {
  const f = [...fotos]
  const e = [...enquadres]
  ;[f[a], f[b]] = [f[b], f[a]]
  ;[e[a], e[b]] = [e[b], e[a]]
  return { fotos: f, enquadres: e }
}

/** Fotos em ordem nos quadros vazios (as que já estão num quadro não repetem). */
export function preencher(fotos, quantos, lista) {
  const out = Array.from({ length: quantos }, (_, i) => fotos[i] ?? null)
  const usadas = new Set(out.filter(Boolean))
  const sobra = lista.filter((p) => !usadas.has(p))
  // Só os quadros nunca preenchidos (null): um quadro esvaziado de propósito fica com "" e não recebe outra foto.
  for (let i = 0; i < out.length && sobra.length; i++) if (out[i] == null) out[i] = sobra.shift()
  return out
}

function caminhoArredondado(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Desenha a montagem. `escala` 1 = o tamanho do formato (1080×1350 no 4:5); a prévia usa menos.
 * `imagens[i]` é a <img> carregada do quadro i (ou null), `enquadres[i]` o { x, y, zoom } dela.
 * `espaco` e `cantos` são em px do formato (escala 1).
 */
export function desenharMontagem(
  canvas,
  { formato, modelo, imagens = [], enquadres = [], espaco = 0, cantos = 0, fundo = '#ffffff', escala = 1, destaque = -1, vazio = '#e5e5ea', buracos = null },
) {
  const f = typeof formato === 'string' ? formatoPorId(formato) : formato
  const W = Math.round(f.w * escala)
  const H = Math.round(f.h * escala)
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, W, H)
  const cx = caixasDe(modelo, { w: W, h: H, espaco: espaco * escala })
  cx.forEach((c, i) => {
    ctx.save()
    caminhoArredondado(ctx, c.x, c.y, c.w, c.h, cantos * escala)
    ctx.clip()
    const img = imagens[i]
    if (buracos?.has(i)) {
      // Montagem em vídeo: o quadro do take fica transparente (com os cantos certos); o vídeo toca por baixo.
      ctx.clearRect(c.x - 1, c.y - 1, c.w + 2, c.h + 2)
    } else if (img && img.naturalWidth) {
      const q = enquadreDe(enquadres[i])
      const s = cobrir(img.naturalWidth, img.naturalHeight, c.w, c.h, q.x, q.y, q.zoom)
      ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, c.x, c.y, c.w, c.h)
    } else {
      ctx.fillStyle = vazio
      ctx.fillRect(c.x, c.y, c.w, c.h)
    }
    ctx.restore()
    if (i === destaque) {
      ctx.save()
      ctx.lineWidth = Math.max(2, 3 * (W / 1080))
      ctx.strokeStyle = '#0a84ff'
      caminhoArredondado(ctx, c.x + ctx.lineWidth / 2, c.y + ctx.lineWidth / 2, c.w - ctx.lineWidth, c.h - ctx.lineWidth, cantos * escala)
      ctx.stroke()
      ctx.restore()
    }
  })
  return { w: W, h: H, caixas: cx }
}

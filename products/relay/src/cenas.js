// Cenas de teste do laboratório de aparelhos: quadros I420 BT.709 gerados por conta (puro, determinístico), iguais no
// navegador e no Node. O aparelho codifica, o laboratório decodifica e compara com o mesmo quadro gerado de novo; a
// referência x264 é medida em Node com os mesmos quadros (scripts/laboratorio-referencia.mjs).
//
// Três cenas, do fácil ao difícil para um codificador:
//  - textura: degradês, formas suaves e textura natural (várias frequências) numa panorâmica lenta;
//  - detalhe: listras finas e "texto" em movimento lateral (o que borra primeiro);
//  - grao: a textura com grão de filme novo em todo quadro (o pior caso real).

export const CENAS = [
  { id: 'textura', nome: 'Textura em movimento' },
  { id: 'detalhe', nome: 'Detalhe fino' },
  { id: 'grao', nome: 'Grão de filme' },
]

export const LARGURA = 1920
export const ALTURA = 1080
export const FPS = 30
export const QUADROS = 90 // 3 s

/** Gerador pseudoaleatório com semente (mulberry32). */
function aleatorio(semente) {
  let t = semente >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const faixaC = (v) => (v < 16 ? 16 : v > 240 ? 240 : Math.round(v))

/**
 * O quadro `i` da cena, em I420 (Y, depois Cb, depois Cr), num Uint8Array só. `saida` reaproveita a memória.
 * Faixa de TV (16–235), BT.709.
 */
export function quadro(cena, i, saida = new Uint8Array((LARGURA * ALTURA * 3) / 2), w = LARGURA, h = ALTURA) {
  const t = i / FPS
  const Y = saida.subarray(0, w * h)
  const U = saida.subarray(w * h, (w * h * 5) / 4)
  const V = saida.subarray((w * h * 5) / 4)
  const rnd = cena === 'grao' ? aleatorio(1000 + i) : null
  const graoAcima = rnd ? new Float32Array(w) : null // o grão da linha de cima (grão em 2D, não riscos)
  // duas formas suaves que andam (gaussianas separáveis: linha × coluna, contas fora do laço de pixels)
  const ax = w * (0.3 + 0.15 * Math.sin(t * 0.9))
  const ay = h * (0.45 + 0.1 * Math.cos(t * 0.7))
  const bx = w * (0.7 - 0.1 * t)
  const by = h * 0.6
  const sa = (w * 0.12) ** 2
  const sb = (w * 0.08) ** 2
  const colA = new Float32Array(w)
  const colB = new Float32Array(w)
  const base = new Float32Array(w)
  const listra = new Float32Array(w)
  const desloc = 24 * t * FPS * 0.2
  const pan = 90 * t // panorâmica lenta da textura (px)
  const tx1 = new Float32Array(w)
  const tx2 = new Float32Array(w)
  const tx3 = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    const px = x + pan
    tx1[x] = 14 * Math.sin(px * 0.031 + 1.3)
    tx2[x] = 9 * Math.sin(px * 0.087 + 0.4)
    tx3[x] = 6 * Math.sin(px * 0.23 + 2.1)
  }
  for (let x = 0; x < w; x++) {
    colA[x] = 60 * Math.exp(-((x - ax) ** 2) / sa)
    colB[x] = 45 * Math.exp(-((x - bx) ** 2) / sb)
    base[x] = 40 + (110 * x) / w
    listra[x] = Math.sin((x + desloc) * 0.42)
  }
  for (let y = 0; y < h; y++) {
    const onda = 45 * Math.sin((y / h + t * 0.15) * Math.PI)
    const la = Math.exp(-((y - ay) ** 2) / sa)
    const lb = Math.exp(-((y - by) ** 2) / sb)
    const sy = 90 * Math.sin(y * 0.19)
    const ty1 = Math.sin(y * 0.027 + 0.7)
    const ty2 = Math.sin(y * 0.071 + 2.2)
    const ty3 = Math.sin(y * 0.19 + 1.1)
    let grao = 0 // grão de filme: aleatório filtrado nas duas direções (não é ruído de pixel isolado)
    const texto = cena === 'detalhe' && y % 64 < 18
    const ty = Math.floor(y / 64) * 17
    const o = y * w
    for (let x = 0; x < w; x++) {
      let v = base[x] + onda + colA[x] * la - colB[x] * lb
      if (cena !== 'detalhe') v += tx1[x] * ty1 + tx2[x] * ty2 + tx3[x] * ty3
      if (cena === 'detalhe') {
        v = 0.55 * v + 0.45 * (128 + sy * listra[x])
        if (texto) {
          const xs = (x + desloc) | 0
          if ((Math.floor(xs / 7) * 31 + ty) % 5 < 3 && xs % 7 < 4) v = 30
        }
      }
      if (rnd) {
        grao = 0.35 * grao + 0.35 * graoAcima[x] + 0.6 * (rnd() - 0.5) * 26
        graoAcima[x] = grao
        v += grao
      }
      Y[o + x] = v < 16 ? 16 : v > 235 ? 235 : Math.round(v)
    }
  }
  const cw = w / 2
  const ch = h / 2
  const cu = new Float32Array(cw)
  const cv = new Float32Array(cw)
  for (let x = 0; x < cw; x++) {
    cu[x] = 128 + 28 * Math.sin((x / cw + t * 0.1) * 3.1)
    cv[x] = 128 + (14 * x) / cw
  }
  for (let y = 0; y < ch; y++) {
    const ru = (18 * y) / ch
    const rv = 24 * Math.cos((y / ch - t * 0.08) * 2.7)
    for (let x = 0; x < cw; x++) {
      U[y * cw + x] = faixaC(cu[x] - ru)
      V[y * cw + x] = faixaC(cv[x] + rv)
    }
  }
  return saida
}

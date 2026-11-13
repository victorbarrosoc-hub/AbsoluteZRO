// Rosto em evento · detectar: o plano das passadas do YuNet e a leitura da saída dele. Puro (sem modelo, sem canvas):
// quem roda o modelo é o worker (app/rosto/worker.js), que desenha cada passada e chama `decodificar`.
//
// YuNet 2023mar (entrada tornada livre por scripts/onnx.mjs): entrada BGR 0..255, NCHW; saídas `cls_s`, `obj_s`,
// `bbox_s` (4) e `kps_s` (10) nos passos s = 8, 16 e 32; nota = √(cls · obj). Conferido contra o cv.FaceDetectorYN
// na pesquisa (diferença máxima de 0,0001 px).
//
// Foto do evento (docs/estudo/rosto-em-evento.md, C.7): prévia de 1616 px já girada pelo EXIF, uma passada global em
// 640 e ladrilhos de 640 com sobra de 128. Selfie: uma passada só, no tamanho do quadro (320).

export const PASSOS = [8, 16, 32]
export const FIXO = 640

/**
 * As passadas para uma imagem W × H analisada com o lado maior em `lado` px.
 * Cada passada: { sx, sy, sw, sh } (o retângulo da imagem), k (escala), L e A (o tamanho da entrada, múltiplo de 32),
 * e `borda` (o retângulo do ladrilho em px da imagem, para descartar o rosto cortado pela borda interna) ou null.
 */
export function passadas(W, H, { lado = 1616, fixo = FIXO, sobra = 128 } = {}) {
  const maior = Math.max(W, H)
  const kG = Math.min(1, fixo / maior)
  const lista = [{ sx: 0, sy: 0, sw: W, sh: H, k: kG, L: fixo, A: fixo, borda: null }]
  const k = Math.min(1, lado / maior)
  if (k * maior <= fixo + 1) return lista
  const w = W * k
  const h = H * k
  const anda = fixo - sobra
  const nx = Math.max(1, Math.ceil((w - sobra) / anda))
  const ny = Math.max(1, Math.ceil((h - sobra) / anda))
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = Math.max(0, Math.min(w - fixo, i * anda))
      const y0 = Math.max(0, Math.min(h - fixo, j * anda))
      const tw = Math.min(fixo, w - x0)
      const th = Math.min(fixo, h - y0)
      lista.push({
        sx: x0 / k,
        sy: y0 / k,
        sw: tw / k,
        sh: th / k,
        k,
        L: fixo,
        A: fixo,
        borda: { x0: x0 > 0, y0: y0 > 0, x1: x0 + tw < w - 1, y1: y0 + th < h - 1 },
      })
    }
  }
  return lista
}

/** A passada única de um quadro pequeno (selfie): entrada no tamanho do quadro arredondado para múltiplo de 32. */
export function passadaUnica(W, H, { lado = 320 } = {}) {
  const k = Math.min(1, lado / Math.max(W, H))
  const L = Math.max(32, Math.ceil((W * k) / 32) * 32)
  const A = Math.max(32, Math.ceil((H * k) / 32) * 32)
  return { sx: 0, sy: 0, sw: W, sh: H, k, L, A, borda: null }
}

const limitar = (v) => Math.min(1, Math.max(0, v))

/**
 * Lê as saídas do YuNet de uma passada. `saidas`: { cls_8: Float32Array, … }. Devolve
 * [{ x, y, largura, altura, nota, pontos: [[x, y] × 5] }] em px da imagem (não da entrada).
 */
export function decodificar(saidas, passada, { limiar = 0.6 } = {}) {
  const { L, A, k, sx, sy } = passada
  const achados = []
  for (const s of PASSOS) {
    const cols = L / s
    const lin = A / s
    const cls = saidas[`cls_${s}`]
    const obj = saidas[`obj_${s}`]
    const bb = saidas[`bbox_${s}`]
    const kp = saidas[`kps_${s}`]
    if (!cls || !obj || !bb || !kp) continue
    for (let y = 0; y < lin; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const nota = Math.sqrt(limitar(cls[i]) * limitar(obj[i]))
        if (nota < limiar) continue
        const cx = (x + bb[i * 4]) * s
        const cy = (y + bb[i * 4 + 1]) * s
        const w = Math.exp(bb[i * 4 + 2]) * s
        const h = Math.exp(bb[i * 4 + 3]) * s
        const pontos = []
        for (let j = 0; j < 5; j++) pontos.push([((kp[i * 10 + 2 * j] + x) * s) / k + sx, ((kp[i * 10 + 2 * j + 1] + y) * s) / k + sy])
        achados.push({ x: (cx - w / 2) / k + sx, y: (cy - h / 2) / k + sy, largura: w / k, altura: h / k, nota, pontos })
      }
    }
  }
  if (!passada.borda) return achados
  // rosto cortado pela borda de um ladrilho (que não é a borda da imagem) fica para o vizinho ou para a passada global
  const m = 4 / k
  const { x0, y0, x1, y1 } = passada.borda
  return achados.filter(
    (f) => !((x0 && f.x < sx + m) || (y0 && f.y < sy + m) || (x1 && f.x + f.largura > sx + passada.sw - m) || (y1 && f.y + f.altura > sy + passada.sh - m)),
  )
}

export function iou(a, b) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.largura, b.x + b.largura)
  const y2 = Math.min(a.y + a.altura, b.y + b.altura)
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  return i / (a.largura * a.altura + b.largura * b.altura - i || 1)
}

/** Supressão dos repetidos: fica o de nota maior entre os que se cobrem mais que `limite`. */
export function suprimir(lista, limite = 0.3) {
  const fica = []
  for (const a of [...lista].sort((p, q) => q.nota - p.nota)) if (!fica.some((b) => iou(a, b) > limite)) fica.push(a)
  return fica
}

/** Quanto da caixa `a` está dentro de outra caixa da lista (0..1): rosto colado em outro (beijo, rosto com rosto). */
export function invasao(a, lista) {
  let max = 0
  for (const b of lista) {
    if (b === a) continue
    const x1 = Math.max(a.x, b.x)
    const y1 = Math.max(a.y, b.y)
    const x2 = Math.min(a.x + a.largura, b.x + b.largura)
    const y2 = Math.min(a.y + a.altura, b.y + b.altura)
    const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
    max = Math.max(max, i / Math.min(a.largura * a.altura, b.largura * b.altura || 1))
  }
  return max
}

// Rosto em evento · alinhar: os 5 pontos do YuNet levados ao molde ArcFace de 112 × 112 por uma semelhança (Umeyama 2D,
// sem reflexão) e o recorte feito por interpolação bilinear, como o `warpAffine` do OpenCV (o `alignCrop` do
// FaceRecognizerSF). Puro: roda igual no Node (testes) e no worker (app/rosto/worker.js). Nada aqui identifica ninguém.
//
// Ordem dos pontos do YuNet: olho direito da pessoa (lado esquerdo da imagem), olho esquerdo, ponta do nariz, canto
// direito e canto esquerdo da boca. Imagem: { largura, altura, dados } com dados RGBA (4 por pixel, 0..255).

export const LADO = 112
/** O molde ArcFace de 112 px (o mesmo do OpenCV e do insightface). */
export const MOLDE = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
]

/**
 * Semelhança que leva `de` em `para` por mínimos quadrados (rotação, escala uniforme e translação; sem reflexão).
 * Devolve [a, b, c, d, e, f] no formato do setTransform do canvas: x' = a·x + c·y + e, y' = b·x + d·y + f.
 */
export function semelhanca(de, para) {
  const n = Math.min(de.length, para.length)
  let ax = 0
  let ay = 0
  let bx = 0
  let by = 0
  for (let i = 0; i < n; i++) {
    ax += de[i][0] / n
    ay += de[i][1] / n
    bx += para[i][0] / n
    by += para[i][1] / n
  }
  let re = 0
  let im = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const x = de[i][0] - ax
    const y = de[i][1] - ay
    const u = para[i][0] - bx
    const v = para[i][1] - by
    re += x * u + y * v
    im += x * v - y * u
    den += x * x + y * y
  }
  if (!(den > 0)) return [1, 0, 0, 1, bx - ax, by - ay]
  re /= den
  im /= den
  return [re, im, -im, re, bx - (re * ax - im * ay), by - (im * ax + re * ay)]
}

/** A inversa de [a, b, c, d, e, f]. */
export function inverter([a, b, c, d, e, f]) {
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

/**
 * O recorte alinhado (RGBA, `lado` × `lado`): cada pixel do recorte busca a posição na imagem pela transformação
 * inversa e mistura os 4 vizinhos (bilinear). Fora da imagem conta como preto (como o BORDER_CONSTANT do OpenCV).
 */
export function recortar(imagem, pontos, { molde = MOLDE, lado = LADO } = {}) {
  const m = semelhanca(pontos, molde)
  return recortarCom(imagem, m, lado)
}

export function recortarCom({ largura: W, altura: H, dados }, m, lado = LADO) {
  const [ia, ib, ic, id, ie, iff] = inverter(m)
  const saida = new Uint8ClampedArray(lado * lado * 4)
  for (let v = 0; v < lado; v++) {
    for (let u = 0; u < lado; u++) {
      const x = ia * u + ic * v + ie
      const y = ib * u + id * v + iff
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      const fx = x - x0
      const fy = y - y0
      const o = (v * lado + u) * 4
      for (let ch = 0; ch < 3; ch++) {
        let s = 0
        for (let j = 0; j < 2; j++) {
          const yy = y0 + j
          if (yy < 0 || yy >= H) continue
          const wy = j ? fy : 1 - fy
          for (let i = 0; i < 2; i++) {
            const xx = x0 + i
            if (xx < 0 || xx >= W) continue
            s += dados[(yy * W + xx) * 4 + ch] * wy * (i ? fx : 1 - fx)
          }
        }
        saida[o + ch] = s
      }
      saida[o + 3] = 255
    }
  }
  return { largura: lado, altura: lado, dados: saida }
}

/** Entrada do SFace: RGB 0..255 em NCHW (a normalização (x − 127,5) / 128 mora dentro do modelo). */
export function tensorDoRosto({ dados }, lado = LADO) {
  const n = lado * lado
  const t = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    t[i] = dados[i * 4]
    t[n + i] = dados[i * 4 + 1]
    t[2 * n + i] = dados[i * 4 + 2]
  }
  return t
}

/** Entrada do YuNet: BGR 0..255 sem normalizar, NCHW. `dados` RGBA de largura L e altura A. */
export function tensorDoDetector(dados, L, A) {
  const n = L * A
  const t = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    t[i] = dados[i * 4 + 2]
    t[n + i] = dados[i * 4 + 1]
    t[2 * n + i] = dados[i * 4]
  }
  return t
}

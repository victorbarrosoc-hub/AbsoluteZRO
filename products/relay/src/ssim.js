// SSIM do luma (Y) entre dois quadros, em janelas 8×8 com passo 4 (o mesmo desenho do filtro ssim do ffmpeg). Puro: o
// laboratório de aparelhos mede no navegador e a referência é medida em Node com esta mesma função.

const C1 = (0.01 * 255) ** 2
const C2 = (0.03 * 255) ** 2

/**
 * `a`, `b`: planos Y (Uint8Array) de `w × h`; `passoA`/`passoB`: bytes por linha de cada um (o decodificador pode
 * entregar linhas mais largas que a imagem). Devolve a média do SSIM das janelas (1 = idêntico).
 */
export function ssimY(a, b, w, h, passoA = w, passoB = w) {
  let soma = 0
  let n = 0
  for (let y = 0; y + 8 <= h; y += 4) {
    for (let x = 0; x + 8 <= w; x += 4) {
      let sa = 0
      let sb = 0
      let saa = 0
      let sbb = 0
      let sab = 0
      for (let j = 0; j < 8; j++) {
        const ia = (y + j) * passoA + x
        const ib = (y + j) * passoB + x
        for (let i = 0; i < 8; i++) {
          const pa = a[ia + i]
          const pb = b[ib + i]
          sa += pa
          sb += pb
          saa += pa * pa
          sbb += pb * pb
          sab += pa * pb
        }
      }
      const ma = sa / 64
      const mb = sb / 64
      const va = saa / 64 - ma * ma
      const vb = sbb / 64 - mb * mb
      const cov = sab / 64 - ma * mb
      soma += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
      n++
    }
  }
  return soma / n
}

/** SSIM da referência no bitrate dado, pela curva medida (interpolação no log do bitrate). */
export function referenciaNoBitrate(curva, kbps) {
  const pts = [...curva].sort((p, q) => p.kbps - q.kbps)
  if (kbps <= pts[0].kbps) return pts[0].ssim
  if (kbps >= pts.at(-1).kbps) return pts.at(-1).ssim
  for (let i = 1; i < pts.length; i++)
    if (kbps <= pts[i].kbps) {
      const f = (Math.log(kbps) - Math.log(pts[i - 1].kbps)) / (Math.log(pts[i].kbps) - Math.log(pts[i - 1].kbps))
      return pts[i - 1].ssim + f * (pts[i].ssim - pts[i - 1].ssim)
    }
  return pts.at(-1).ssim
}

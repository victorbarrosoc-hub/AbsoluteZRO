// CAMZRO · LUT .cube (formato da Adobe/Resolve). Conta pura: lê o texto e devolve a tabela para o shader e para a
// prévia em CPU (aplicar() faz a interpolação trilinear, a mesma que a placa de vídeo faz na textura 3D).
//
// Aceita LUT_3D_SIZE (2–65) e LUT_1D_SIZE (2–65536), DOMAIN_MIN/DOMAIN_MAX, TITLE e comentários (#). Ordem dos dados
// do .cube: o vermelho varia mais rápido, depois o verde, depois o azul.

export const MAX_3D = 65
export const MAX_1D = 65536
export const MAX_BYTES = 16 * 1024 * 1024

export class ErroLut extends Error {}

/** Lê um .cube. Devolve { titulo, tipo: '3d'|'1d', tamanho, min, max, dados: Float32Array (RGB) }. */
export function lerCube(texto) {
  if (typeof texto !== 'string') throw new ErroLut('Arquivo vazio.')
  if (texto.length > MAX_BYTES) throw new ErroLut('Arquivo grande demais para uma LUT.')
  let titulo = ''
  let tipo = null
  let tamanho = 0
  let min = [0, 0, 0]
  let max = [1, 1, 1]
  let dados = null
  let i = 0
  const linhas = texto.split(/\r?\n/)
  for (const bruta of linhas) {
    const linha = bruta.replace(/#.*$/, '').trim()
    if (!linha) continue
    const pal = linha.split(/\s+/)
    const chave = pal[0].toUpperCase()
    if (chave === 'TITLE') {
      titulo = linha
        .slice(5)
        .trim()
        .replace(/^"|"$/g, '')
        .slice(0, 80)
      continue
    }
    if (chave === 'LUT_3D_SIZE' || chave === 'LUT_1D_SIZE') {
      if (tipo) throw new ErroLut('A LUT declara o tamanho duas vezes.')
      tipo = chave === 'LUT_3D_SIZE' ? '3d' : '1d'
      tamanho = Number(pal[1])
      const teto = tipo === '3d' ? MAX_3D : MAX_1D
      if (!Number.isInteger(tamanho) || tamanho < 2 || tamanho > teto) throw new ErroLut(`Tamanho de LUT inválido (${pal[1]}).`)
      dados = new Float32Array((tipo === '3d' ? tamanho ** 3 : tamanho) * 3)
      continue
    }
    if (chave === 'DOMAIN_MIN' || chave === 'DOMAIN_MAX') {
      const v = pal.slice(1, 4).map(Number)
      if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) throw new ErroLut('Domínio inválido.')
      if (chave === 'DOMAIN_MIN') min = v
      else max = v
      continue
    }
    if (/^LUT_|^[A-Z_]+$/.test(chave) && !/^[-+.\d]/.test(chave)) continue // outras palavras-chave (LUT_IN_VIDEO_RANGE…)
    if (!dados) throw new ErroLut('Faltou LUT_3D_SIZE antes dos dados.')
    if (pal.length < 3) throw new ErroLut('Linha de dados com menos de três números.')
    if (i >= dados.length) throw new ErroLut('A LUT tem mais linhas do que o tamanho diz.')
    for (let k = 0; k < 3; k++) {
      const v = Number(pal[k])
      if (!Number.isFinite(v)) throw new ErroLut('Número inválido nos dados.')
      dados[i++] = v
    }
  }
  if (!dados) throw new ErroLut('Não é um .cube: falta LUT_3D_SIZE.')
  if (i !== dados.length) throw new ErroLut(`A LUT tem ${i / 3} linhas; o tamanho pede ${dados.length / 3}.`)
  if (min.some((v, k) => !(max[k] > v))) throw new ErroLut('DOMAIN_MAX precisa ser maior que DOMAIN_MIN.')
  return { titulo, tipo, tamanho, min, max, dados }
}

const lerp = (a, b, t) => a + (b - a) * t
const prender = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Aplica a LUT numa cor RGB (0–1), com interpolação trilinear (3D) ou linear por canal (1D). */
export function aplicar(lut, [r, g, b]) {
  const n = lut.tamanho
  const norm = [r, g, b].map((v, k) => prender((v - lut.min[k]) / (lut.max[k] - lut.min[k])))
  if (lut.tipo === '1d') {
    return norm.map((v, k) => {
      const x = v * (n - 1)
      const i0 = Math.floor(x)
      const i1 = Math.min(n - 1, i0 + 1)
      return lerp(lut.dados[i0 * 3 + k], lut.dados[i1 * 3 + k], x - i0)
    })
  }
  const [x, y, z] = norm.map((v) => v * (n - 1))
  const [x0, y0, z0] = [x, y, z].map(Math.floor)
  const [x1, y1, z1] = [x0, y0, z0].map((v) => Math.min(n - 1, v + 1))
  const [fx, fy, fz] = [x - x0, y - y0, z - z0]
  const p = (i, j, k, c) => lut.dados[((k * n + j) * n + i) * 3 + c]
  const saida = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const c00 = lerp(p(x0, y0, z0, c), p(x1, y0, z0, c), fx)
    const c10 = lerp(p(x0, y1, z0, c), p(x1, y1, z0, c), fx)
    const c01 = lerp(p(x0, y0, z1, c), p(x1, y0, z1, c), fx)
    const c11 = lerp(p(x0, y1, z1, c), p(x1, y1, z1, c), fx)
    saida[c] = lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz)
  }
  return saida
}

/** Uma LUT 1D vira 3D (para o shader ter um caminho só). */
export function para3d(lut, n = 33) {
  if (lut.tipo === '3d') return lut
  const dados = new Float32Array(n ** 3 * 3)
  let o = 0
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const v = aplicar(lut, [i / (n - 1), j / (n - 1), k / (n - 1)].map((t, c) => lut.min[c] + t * (lut.max[c] - lut.min[c])))
        dados[o++] = v[0]
        dados[o++] = v[1]
        dados[o++] = v[2]
      }
  return { ...lut, tipo: '3d', tamanho: n, dados }
}

/** RGBA Float32 para a textura 3D (WebGL2 RGBA16F aceita FLOAT na subida e filtra linear). */
export function paraTextura(lut) {
  const l = para3d(lut)
  const n = l.tamanho
  const rgba = new Float32Array(n ** 3 * 4)
  for (let i = 0, o = 0; i < l.dados.length; i += 3, o += 4) {
    rgba[o] = l.dados[i]
    rgba[o + 1] = l.dados[i + 1]
    rgba[o + 2] = l.dados[i + 2]
    rgba[o + 3] = 1
  }
  return { tamanho: n, rgba, min: l.min, max: l.max }
}

/** Gera um .cube (para testar e para exportar o look ativo). */
export function escreverCube({ titulo = 'CAMZRO', tamanho = 17, funcao }) {
  const linhas = [`TITLE "${String(titulo).replace(/"/g, '')}"`, `LUT_3D_SIZE ${tamanho}`]
  for (let b = 0; b < tamanho; b++)
    for (let g = 0; g < tamanho; g++)
      for (let r = 0; r < tamanho; r++) {
        const v = funcao([r / (tamanho - 1), g / (tamanho - 1), b / (tamanho - 1)])
        linhas.push(v.map((x) => x.toFixed(6)).join(' '))
      }
  return `${linhas.join('\n')}\n`
}

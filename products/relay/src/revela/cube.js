// LUT 3D no formato .cube (Adobe/Resolve): cabeçalho + uma linha "r g b" por ponto, com o vermelho variando mais
// rápido. O Resolve lê 17, 33 e 65 pontos; monitor e câmera costumam aceitar 33.

export const TAMANHOS = [17, 33, 65]

/** Calcula a LUT aplicando `f(r, g, b) → [r, g, b]` (código 0–1) em cada ponto da grade. */
export function assar(f, tamanho = 33) {
  if (!TAMANHOS.includes(tamanho)) throw new Error(`Tamanho de LUT não suportado: ${tamanho} (use 17, 33 ou 65)`)
  const n = tamanho
  const dados = new Float32Array(n * n * n * 3)
  let i = 0
  for (let bi = 0; bi < n; bi++)
    for (let gi = 0; gi < n; gi++)
      for (let ri = 0; ri < n; ri++) {
        const o = f(ri / (n - 1), gi / (n - 1), bi / (n - 1))
        dados[i++] = o[0]
        dados[i++] = o[1]
        dados[i++] = o[2]
      }
  return { tamanho: n, dados }
}

/**
 * Texto do .cube. O título não pode ter aspas nem quebra de linha. `comentarios`: linhas "# …" no topo (espaços de
 * entrada e saída, faixa, interpolação), que o Resolve e o OCIO ignoram e quem abre o arquivo lê.
 */
export function escreverCube(lut, titulo = 'Revela', comentarios = []) {
  const limpo = String(titulo)
    .replace(/["\r\n]/g, ' ')
    .slice(0, 120)
  const linhas = [
    ...comentarios.map((c) => `# ${String(c).replace(/[\r\n]/g, ' ')}`),
    `TITLE "${limpo}"`,
    `LUT_3D_SIZE ${lut.tamanho}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
  ]
  const d = lut.dados
  for (let i = 0; i < d.length; i += 3) linhas.push(`${fmt(d[i])} ${fmt(d[i + 1])} ${fmt(d[i + 2])}`)
  return linhas.join('\n') + '\n'
}
const fmt = (v) => Math.min(1, Math.max(0, v)).toFixed(6)

/** Lê um .cube 3D com domínio 0–1. */
export function lerCube(texto) {
  let tamanho = 0
  const valores = []
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.trim()
    if (!l || l.startsWith('#')) continue
    if (/^LUT_3D_SIZE\s/.test(l)) tamanho = Number(l.split(/\s+/)[1])
    else if (/^LUT_1D_SIZE\s/.test(l)) throw new Error('LUT 1D não é suportada')
    else if (/^[-+.\d]/.test(l)) valores.push(...l.split(/\s+/).map(Number))
  }
  if (!tamanho || valores.length !== tamanho ** 3 * 3) throw new Error('Arquivo .cube incompleto')
  return { tamanho, dados: Float32Array.from(valores) }
}

/** Aplica a LUT num pixel (interpolação trilinear). */
export function aplicar(lut, r, g, b) {
  const n = lut.tamanho
  const d = lut.dados
  const pos = (v) => Math.min(n - 1, Math.max(0, v * (n - 1)))
  const x = pos(r)
  const y = pos(g)
  const z = pos(b)
  const x0 = Math.min(n - 2, Math.floor(x))
  const y0 = Math.min(n - 2, Math.floor(y))
  const z0 = Math.min(n - 2, Math.floor(z))
  const fx = x - x0
  const fy = y - y0
  const fz = z - z0
  const out = [0, 0, 0]
  for (let k = 0; k < 8; k++) {
    const dx = k & 1
    const dy = (k >> 1) & 1
    const dz = (k >> 2) & 1
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz)
    if (!w) continue
    const i = (((z0 + dz) * n + (y0 + dy)) * n + (x0 + dx)) * 3
    out[0] += w * d[i]
    out[1] += w * d[i + 1]
    out[2] += w * d[i + 2]
  }
  return out
}

/**
 * Aplica a LUT com interpolação tetraédrica (a que o Resolve, a ARRI e o OCIO recomendam para LUT de look): segue a
 * diagonal do cinza, então o eixo neutro não ganha cor da interpolação.
 */
export function aplicarTetra(lut, r, g, b) {
  const n = lut.tamanho
  const d = lut.dados
  const pos = (v) => Math.min(n - 1, Math.max(0, v * (n - 1)))
  const x = pos(r)
  const y = pos(g)
  const z = pos(b)
  const x0 = Math.min(n - 2, Math.floor(x))
  const y0 = Math.min(n - 2, Math.floor(y))
  const z0 = Math.min(n - 2, Math.floor(z))
  const fx = x - x0
  const fy = y - y0
  const fz = z - z0
  const i = (dx, dy, dz) => (((z0 + dz) * n + (y0 + dy)) * n + (x0 + dx)) * 3
  const c000 = i(0, 0, 0)
  const c111 = i(1, 1, 1)
  let a, b2, w0, w1, w2, w3
  if (fx >= fy) {
    if (fy >= fz) [a, b2, w0, w1, w2, w3] = [i(1, 0, 0), i(1, 1, 0), 1 - fx, fx - fy, fy - fz, fz]
    else if (fx >= fz) [a, b2, w0, w1, w2, w3] = [i(1, 0, 0), i(1, 0, 1), 1 - fx, fx - fz, fz - fy, fy]
    else [a, b2, w0, w1, w2, w3] = [i(0, 0, 1), i(1, 0, 1), 1 - fz, fz - fx, fx - fy, fy]
  } else if (fz >= fy) [a, b2, w0, w1, w2, w3] = [i(0, 0, 1), i(0, 1, 1), 1 - fz, fz - fy, fy - fx, fx]
  else if (fz >= fx) [a, b2, w0, w1, w2, w3] = [i(0, 1, 0), i(0, 1, 1), 1 - fy, fy - fz, fz - fx, fx]
  else [a, b2, w0, w1, w2, w3] = [i(0, 1, 0), i(1, 1, 0), 1 - fy, fy - fx, fx - fz, fz]
  return [0, 1, 2].map((k) => w0 * d[c000 + k] + w1 * d[a + k] + w2 * d[b2 + k] + w3 * d[c111 + k])
}

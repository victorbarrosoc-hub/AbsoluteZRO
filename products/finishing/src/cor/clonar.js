// Revela · Clonar LUT: o mesmo frame antes e depois da cor vira uma LUT. Como os dois são o mesmo quadro, cada pixel
// diz exatamente para onde aquela cor foi: não há o que adivinhar, só preencher as cores que o frame não tem.
//
// Como:
//   1. uma matriz afim (3×4) por mínimos quadrados: o "jeito geral" da correção (balanço, contraste, saturação);
//   2. o que a matriz não explica (curvas, matizes que mudaram de lugar) vai para uma grade 17³ por espalhamento
//      trilinear, depois borrada para chegar às cores vizinhas;
//   3. onde a grade não tem amostra, o resultado volta suave para a matriz (regularização), em vez de inventar.
//
// Entrada: `{ largura, altura, pixels }` com o mesmo tamanho, código 0–1 (o still exportado do editor).

const G = 17
const MAX_AMOSTRAS = 80_000
const K = 0.6 // peso fictício de "nenhuma amostra": puxa o resíduo para zero onde há pouco dado
const limitar = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Resolve A·x = b (4×4) por eliminação de Gauss com pivô. */
function resolver4(A, b) {
  const m = A.map((linha, i) => [...linha, b[i]])
  for (let c = 0; c < 4; c++) {
    let p = c
    for (let r = c + 1; r < 4; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    ;[m[c], m[p]] = [m[p], m[c]]
    if (Math.abs(m[c][c]) < 1e-12) return null
    for (let r = 0; r < 4; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k < 5; k++) m[r][k] -= f * m[c][k]
    }
  }
  return m.map((linha, i) => linha[4] / linha[i])
}

/** Matriz afim (3 linhas de 4) que leva antes → depois, por mínimos quadrados (com um pouco de ridge para estabilidade). */
function ajustarAfim(amostras) {
  const AtA = Array.from({ length: 4 }, () => [0, 0, 0, 0])
  const Atb = [0, 1, 2].map(() => [0, 0, 0, 0])
  for (const [r, g, b, R, Gv, B] of amostras) {
    const x = [r, g, b, 1]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) AtA[i][j] += x[i] * x[j]
      Atb[0][i] += x[i] * R
      Atb[1][i] += x[i] * Gv
      Atb[2][i] += x[i] * B
    }
  }
  const n = amostras.length || 1
  // ridge puxando para a identidade: com pouca variedade de cor a matriz não explode
  const lambda = 1e-3 * n
  const ident = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ]
  return [0, 1, 2].map((canal) => {
    const A = AtA.map((linha, i) => linha.map((v, j) => v + (i === j ? lambda : 0)))
    const b = Atb[canal].map((v, i) => v + lambda * ident[canal][i])
    return resolver4(A, b) ?? ident[canal]
  })
}

const aplicarAfim = (M, r, g, b) => M.map((l) => l[0] * r + l[1] * g + l[2] * b + l[3])

function borrar(grade, canais) {
  // caixa 3×3×3 separável, uma passada por eixo
  const idx = (r, g, b) => (b * G + g) * G + r
  for (const eixo of [0, 1, 2]) {
    const saida = new Float32Array(grade.length)
    for (let b = 0; b < G; b++)
      for (let g = 0; g < G; g++)
        for (let r = 0; r < G; r++) {
          const p = [r, g, b]
          for (let c = 0; c < canais; c++) {
            let s = 0
            let n = 0
            for (const d of [-1, 0, 1]) {
              const q = [...p]
              q[eixo] += d
              if (q[eixo] < 0 || q[eixo] >= G) continue
              s += grade[idx(q[0], q[1], q[2]) * canais + c] * (d === 0 ? 2 : 1)
              n += d === 0 ? 2 : 1
            }
            saida[idx(r, g, b) * canais + c] = s / n
          }
        }
    grade.set(saida)
  }
}

/**
 * Clona a cor de `depois` (o frame corrigido) a partir de `antes` (o mesmo frame sem a correção).
 * Devolve `{ aplicar(r, g, b, intensidade?) → [r, g, b], resumo: { amostras, cobertura, erro } }`.
 */
export function clonarLut(antes, depois, opcoes = {}) {
  if (antes.largura !== depois.largura || antes.altura !== depois.altura) throw new Error('As duas imagens precisam ter o mesmo tamanho')
  const intensidade = opcoes.intensidade ?? 1
  const total = antes.largura * antes.altura
  const passo = Math.max(1, Math.floor(total / MAX_AMOSTRAS))
  const amostras = []
  for (let i = 0; i < total; i += passo) {
    const k = i * 3
    amostras.push([antes.pixels[k], antes.pixels[k + 1], antes.pixels[k + 2], depois.pixels[k], depois.pixels[k + 1], depois.pixels[k + 2]])
  }
  const M = ajustarAfim(amostras)

  // resíduo (depois − afim) espalhado na grade com pesos trilineares
  const soma = new Float32Array(G * G * G * 3)
  const peso = new Float32Array(G * G * G)
  for (const [r, g, b, R, Gv, B] of amostras) {
    const a = aplicarAfim(M, r, g, b)
    const res = [R - a[0], Gv - a[1], B - a[2]]
    const x = r * (G - 1)
    const y = g * (G - 1)
    const z = b * (G - 1)
    const x0 = Math.min(G - 2, Math.floor(x))
    const y0 = Math.min(G - 2, Math.floor(y))
    const z0 = Math.min(G - 2, Math.floor(z))
    const fx = x - x0
    const fy = y - y0
    const fz = z - z0
    for (let dz = 0; dz < 2; dz++)
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz)
          const n = ((z0 + dz) * G + (y0 + dy)) * G + (x0 + dx)
          peso[n] += w
          soma[n * 3] += w * res[0]
          soma[n * 3 + 1] += w * res[1]
          soma[n * 3 + 2] += w * res[2]
        }
  }
  const nAmostras = amostras.length
  let cobertos = 0
  for (let n = 0; n < peso.length; n++) if (peso[n] > 0) cobertos++
  for (let i = 0; i < 2; i++) {
    borrar(soma, 3)
    borrar(peso, 1)
  }
  // média ponderada do resíduo em cada nó; o K no denominador leva a zero (só a matriz) onde quase não há amostra
  const residuo = new Float32Array(G * G * G * 3)
  for (let n = 0; n < peso.length; n++) for (let c = 0; c < 3; c++) residuo[n * 3 + c] = soma[n * 3 + c] / (peso[n] + K)

  function residuoEm(r, g, b) {
    const x = limitar(r) * (G - 1)
    const y = limitar(g) * (G - 1)
    const z = limitar(b) * (G - 1)
    const x0 = Math.min(G - 2, Math.floor(x))
    const y0 = Math.min(G - 2, Math.floor(y))
    const z0 = Math.min(G - 2, Math.floor(z))
    const fx = x - x0
    const fy = y - y0
    const fz = z - z0
    const o = [0, 0, 0]
    for (let dz = 0; dz < 2; dz++)
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz)
          const n = ((z0 + dz) * G + (y0 + dy)) * G + (x0 + dx)
          o[0] += w * residuo[n * 3]
          o[1] += w * residuo[n * 3 + 1]
          o[2] += w * residuo[n * 3 + 2]
        }
    return o
  }

  function aplicar(r, g, b, t = intensidade) {
    const a = aplicarAfim(M, r, g, b)
    const e = residuoEm(r, g, b)
    return [0, 1, 2].map((c) => {
      const alvo = limitar(a[c] + e[c])
      const orig = [r, g, b][c]
      return orig + (alvo - orig) * t
    })
  }

  // quão bem a LUT reproduz o próprio "depois" (erro médio em código, 0–1)
  let erro = 0
  const conferir = amostras.filter((_, i) => i % 7 === 0)
  for (const [r, g, b, R, Gv, B] of conferir) {
    const o = aplicar(r, g, b, 1)
    erro += (Math.abs(o[0] - R) + Math.abs(o[1] - Gv) + Math.abs(o[2] - B)) / 3
  }
  erro /= conferir.length || 1

  return { preset: 'clone', aplicar, resumo: { amostras: nAmostras, cobertura: cobertos / peso.length, erro, matriz: M } }
}

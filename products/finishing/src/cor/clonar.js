// Revela · Clonar LUT: o mesmo frame antes e depois da cor vira uma LUT. Como os dois são o mesmo quadro, cada pixel
// diz exatamente para onde aquela cor foi: não há o que adivinhar, só preencher as cores que o frame não tem.
//
// Como:
//   1. uma curva de tom (a mesma nos três canais, monótona): o contraste do grade, que uma matriz sozinha não segue;
//   2. uma matriz afim (3×4) por mínimos quadrados sobre a curva: o "jeito geral" da cor (balanço, saturação);
//   3. o que sobra (matizes que mudaram de lugar) vai para uma grade 17³ por espalhamento trilinear, depois borrada
//      para chegar às cores vizinhas;
//   4. onde a grade não tem amostra, o resultado volta suave para curva + matriz (regularização), em vez de inventar.
//
// Medido em stills reais do Resolve (S-Log3 → Rec.709 e S-Log3 → look de película, 4 cenas): a curva corta o erro
// pela metade numa cena que a LUT não viu, e cada frame a mais do mesmo grade ajuda a acertar as outras cenas.
//
// Entrada: `{ largura, altura, pixels }` com o mesmo tamanho, código 0–1 (o still exportado do editor), ou listas
// de imagens: vários frames do mesmo grade, cada "antes" com o seu "depois".

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

const FAIXAS = 32
const MIN_POR_FAIXA = 30

/**
 * Curva de tom do grade: média de entrada → média de saída em faixas, monótona (as faixas que descem viram uma só,
 * pela média ponderada) e esticada em reta até 0 e 1 onde o frame não tem luz. Devolve `curva(v)` para um canal.
 */
function ajustarCurva(amostras) {
  const sx = new Float64Array(FAIXAS)
  const sy = new Float64Array(FAIXAS)
  const sn = new Float64Array(FAIXAS)
  for (const [r, g, b, R, Gv, B] of amostras) {
    const x = (r + g + b) / 3
    const k = Math.min(FAIXAS - 1, Math.floor(x * FAIXAS))
    sx[k] += x
    sy[k] += (R + Gv + B) / 3
    sn[k]++
  }
  // blocos {x, y, n}; junta vizinhos que descem até a curva só subir
  const blocos = []
  for (let k = 0; k < FAIXAS; k++) {
    if (sn[k] < MIN_POR_FAIXA) continue
    blocos.push({ x: sx[k], y: sy[k], n: sn[k] })
    while (blocos.length > 1 && blocos.at(-1).y / blocos.at(-1).n < blocos.at(-2).y / blocos.at(-2).n) {
      const b = blocos.pop()
      const a = blocos.at(-1)
      a.x += b.x
      a.y += b.y
      a.n += b.n
    }
  }
  const xs = blocos.map((b) => b.x / b.n)
  const ys = blocos.map((b) => b.y / b.n)
  if (xs.length < 2) return (v) => v
  // pontas em reta, pela inclinação do primeiro e do último trecho
  const inclinacao = (i, j) => Math.max(0, (ys[j] - ys[i]) / Math.max(1e-6, xs[j] - xs[i]))
  const n = xs.length
  const baixo = ys[0] - inclinacao(0, 1) * xs[0]
  const alto = ys[n - 1] + inclinacao(n - 2, n - 1) * (1 - xs[n - 1])
  xs.unshift(0)
  ys.unshift(baixo)
  xs.push(1)
  ys.push(alto)
  return (v) => {
    if (v <= 0) return ys[0]
    if (v >= 1) return ys.at(-1)
    let i = 1
    while (xs[i] < v) i++
    const t = (v - xs[i - 1]) / Math.max(1e-9, xs[i] - xs[i - 1])
    return ys[i - 1] + (ys[i] - ys[i - 1]) * t
  }
}

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
  const listaAntes = [antes].flat()
  const listaDepois = [depois].flat()
  if (!listaAntes.length || listaAntes.length !== listaDepois.length) throw new Error('Cada frame sem a cor precisa do seu frame com a cor')
  listaAntes.forEach((a, i) => {
    if (a.largura !== listaDepois[i].largura || a.altura !== listaDepois[i].altura) throw new Error('As duas imagens precisam ter o mesmo tamanho')
  })
  const intensidade = opcoes.intensidade ?? 1
  const total = listaAntes.reduce((s, a) => s + a.largura * a.altura, 0)
  const passo = Math.max(1, Math.floor(total / MAX_AMOSTRAS))
  // amostra: [r, g, b] de antes, [R, G, B] de depois
  const amostras = []
  listaAntes.forEach((a, j) => {
    const d = listaDepois[j]
    for (let i = 0; i < a.largura * a.altura; i += passo) {
      const k = i * 3
      amostras.push([a.pixels[k], a.pixels[k + 1], a.pixels[k + 2], d.pixels[k], d.pixels[k + 1], d.pixels[k + 2]])
    }
  })
  const curva = ajustarCurva(amostras)
  const base = (r, g, b) => [curva(r), curva(g), curva(b)]
  const M = ajustarAfim(amostras.map(([r, g, b, R, Gv, B]) => [...base(r, g, b), R, Gv, B]))
  const geral = (r, g, b) => aplicarAfim(M, ...base(r, g, b))

  // resíduo (depois − afim) espalhado na grade com pesos trilineares
  const soma = new Float32Array(G * G * G * 3)
  const peso = new Float32Array(G * G * G)
  for (const [r, g, b, R, Gv, B] of amostras) {
    const a = geral(r, g, b)
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
    const a = geral(r, g, b)
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

  return { preset: 'clone', aplicar, resumo: { amostras: nAmostras, frames: listaAntes.length, cobertura: cobertos / peso.length, erro, matriz: M } }
}

/** Luminância de uma imagem numa grade pequena (o bastante para comparar enquadramentos). */
function lumaPequena(img, lado = 48) {
  const out = new Float32Array(lado * lado)
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++) {
      const k = (Math.floor(((y + 0.5) / lado) * img.altura) * img.largura + Math.floor(((x + 0.5) / lado) * img.largura)) * 3
      out[y * lado + x] = 0.2126 * img.pixels[k] + 0.7152 * img.pixels[k + 1] + 0.0722 * img.pixels[k + 2]
    }
  return out
}

/**
 * Os dois são o mesmo frame (com cores diferentes)? Correlação da luz numa grade pequena: o grade muda o nível, não
 * onde fica o claro e o escuro. Quadros diferentes ficam bem abaixo.
 */
export function mesmoQuadro(a, b) {
  const x = lumaPequena(a)
  const y = lumaPequena(b)
  const n = x.length
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += x[i] / n
    my += y[i] / n
  }
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxy / Math.sqrt(sxx * syy + 1e-12) > 0.85
}

/**
 * Um par novo chega sem dizer qual é qual: a LUT que já existe decide. Aplicada no "sem a cor" ela chega perto do
 * "com a cor"; no sentido errado, não. Devolve `{ antes, depois }`, ou null quando os dois não são o mesmo frame.
 */
export function orientarPar(lut, a, b) {
  if (a.largura !== b.largura || a.altura !== b.altura || !mesmoQuadro(a, b)) return null
  const erro = (de, para) => {
    let s = 0
    let n = 0
    for (let i = 0; i < de.pixels.length; i += 3 * 37) {
      const o = lut.aplicar(de.pixels[i], de.pixels[i + 1], de.pixels[i + 2], 1)
      s += Math.abs(o[0] - para.pixels[i]) + Math.abs(o[1] - para.pixels[i + 1]) + Math.abs(o[2] - para.pixels[i + 2])
      n += 3
    }
    return s / n
  }
  return erro(a, b) <= erro(b, a) ? { antes: a, depois: b } : { antes: b, depois: a }
}

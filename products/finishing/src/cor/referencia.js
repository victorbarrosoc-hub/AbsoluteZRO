// Referência → LUT criativa.
//
// Entra um frame de referência (o estilo que a pessoa quer) e um frame do material dela, os dois em código Rec.709.
// Sai uma função de cor que leva o material para o estilo, pronta para virar .cube (cube.js).
//
//   1. Tom: preto e teto dos altos da referência, o contraste de cada trecho dela e a exposição do material (não copia
//      o quanto a cena é clara ou escura). Curva monótona com inclinação limitada (nada de posterizar).
//   2. Tom de cor ao longo da luz: em cada faixa (sombras … altos) acha o deslocamento que sobrepõe a nuvem de cores
//      do material à da referência (pele com pele, céu com céu); depois junta as faixas numa reta (dominante geral +
//      split-tone sombras → altos). O que só existe numa imagem (um vestido vermelho enorme) não tem par e não puxa.
//   3. Saturação: comparada dentro do mesmo matiz (azul com azul, pele com pele), para que "ter mais céu" na
//      referência não vire "mais saturação". Faixa ou matiz com pouco pixel puxa pouco (vai para "não mexer").
//   4. Intensidade: 0 = não mexe, 1 = o estilo inteiro.
//
// Copia cor e contraste, não o filme: grão, halation, lente, luz do set e direção de arte não cabem numa LUT.

import { codigoParaOklab, oklabParaCodigo } from './oklab.js'

const PERCENTIS = [0.005, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 0.995]
const FAIXAS = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]
const SIGMA = 0.11
const INCLINACAO = [0.25, 4]
const CONTRASTE = [0.5, 2]
const EXPOSICAO = 0.25
const SATURACAO = [0.6, 1.5]
const BUSCA = 15 // casas de 0,004: até ±0,06 de deslocamento em a e b
const SETORES = 12
const CROMA_MINIMO = 0.02
const MAX_PIXELS = 80_000

/**
 * Imagem: `{ largura, altura, pixels }`, com `pixels` em código Rec.709 0–1, RGB intercalado (Float32Array ou array).
 * Devolve só o que interessa para comparar (L, a, b de uma amostra regular da imagem).
 */
export function analisar(img) {
  const total = img.pixels.length / 3
  const passo = Math.max(1, Math.ceil(total / MAX_PIXELS))
  const n = Math.ceil(total / passo)
  const L = new Float64Array(n)
  const A = new Float64Array(n)
  const B = new Float64Array(n)
  for (let i = 0, j = 0; j < n; i += passo, j++) {
    const o = codigoParaOklab(img.pixels[i * 3], img.pixels[i * 3 + 1], img.pixels[i * 3 + 2])
    L[j] = o[0]
    A[j] = o[1]
    B[j] = o[2]
  }
  return { L, A, B }
}

// ─────────── tom ───────────

function quantis(valores, ps) {
  const ord = Float64Array.from(valores).sort()
  return ps.map((p) => {
    const x = p * (ord.length - 1)
    const i = Math.floor(x)
    return ord[i] + (ord[Math.min(ord.length - 1, i + 1)] - ord[i]) * (x - i)
  })
}

/** Curva monótona (Fritsch–Carlson) pelos pontos, com prolongamento reto até 0 e 1. */
export function curvaMonotona(xs, ys) {
  const n = xs.length
  const d = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  const m = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]))
  m.push(d[n - 2])
  return (x) => {
    if (x <= xs[0]) return ys[0] + (x - xs[0]) * m[0]
    if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * m[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i]
    const t = (x - xs[i]) / h
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
  }
}

/**
 * Curva de luz do material para a referência, sem copiar a exposição da cena (uma referência noturna não pode
 * escurecer um dia de sol):
 * - piso e teto absolutos (0,5% e 99,5%): o preto levantado e o teto dos altos são do grade;
 * - o cinza médio do material anda só `EXPOSICAO` em direção ao da referência;
 * - entre eles, a forma: cada trecho ganha o contraste relativo da referência, limitado.
 */
function curvaDeTom(Lmat, Lref) {
  const qm = quantis(Lmat, PERCENTIS)
  const qr = quantis(Lref, PERCENTIS)
  const meio = PERCENTIS.indexOf(0.5)
  const ultimo = PERCENTIS.length - 1
  if (qm[ultimo] - qm[0] < 1e-3) return { f: (x) => x, xs: [], ys: [] } // material chapado
  const ys = new Array(PERCENTIS.length)
  ys[0] = qr[0]
  ys[ultimo] = qr[ultimo]
  ys[meio] = limitar(qm[meio] + EXPOSICAO * (qr[meio] - qm[meio]), [ys[0], ys[ultimo]])
  const larguras = (de, ate) => {
    const w = []
    for (let i = de; i < ate; i++) {
      const dm = qm[i + 1] - qm[i]
      const dr = qr[i + 1] - qr[i]
      w.push(dm > 1e-5 && dr > 1e-5 ? dm * limitar(dr / dm, CONTRASTE) : dm)
    }
    return w
  }
  for (const [de, ate] of [
    [0, meio],
    [meio, ultimo],
  ]) {
    const w = larguras(de, ate)
    const soma = w.reduce((x, y) => x + y, 0)
    const escala = soma > 1e-6 ? (ys[ate] - ys[de]) / soma : 0
    for (let i = de + 1; i < ate; i++) ys[i] = ys[i - 1] + w[i - 1 - de] * escala
  }
  // pontos de entrada repetidos (trecho chapado) não definem curva: fica o primeiro
  const xs = []
  const yy = []
  for (let i = 0; i < qm.length; i++) {
    if (xs.length && qm[i] - xs[xs.length - 1] < 1e-4) continue
    xs.push(qm[i])
    yy.push(ys[i])
  }
  if (xs.length < 2) return { f: (x) => x, xs, ys: yy }
  // inclinação limitada: nem achata nem estica demais um trecho de luz
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1]
    yy[i] = Math.min(yy[i - 1] + INCLINACAO[1] * dx, Math.max(yy[i - 1] + INCLINACAO[0] * dx, yy[i]))
  }
  const base = curvaMonotona(xs, yy)
  // fora dos quantis medidos: reto com inclinação 1 (sem extrapolar o contraste da ponta)
  const lo = xs[0]
  const hi = xs[xs.length - 1]
  const f = (x) => (x < lo ? yy[0] + (x - lo) : x > hi ? yy[yy.length - 1] + (x - hi) : base(x))
  return { f: (x) => Math.min(1, Math.max(0, f(x))), xs, ys: yy }
}

// ─────────── cor por faixa ───────────

function quantilPonderado(vals, pesos, q) {
  const idx = Array.from(vals.keys()).sort((i, j) => vals[i] - vals[j])
  let total = 0
  for (const p of pesos) total += p
  let acc = 0
  for (const i of idx) {
    acc += pesos[i]
    if (acc >= q * total) return vals[i]
  }
  return vals[idx[idx.length - 1]]
}

const pesoFaixa = (L, c) => Math.exp(-((L - c) ** 2) / (2 * SIGMA * SIGMA))

/** Pixels de cada faixa de luz (`L` já na escala da referência), com o peso de cada um na faixa. */
function separarFaixas(L, A, B) {
  return FAIXAS.map((c) => {
    const as = []
    const bs = []
    const ws = []
    let soma = 0
    for (let i = 0; i < L.length; i++) {
      const w = pesoFaixa(L[i], c)
      if (w < 0.02) continue
      as.push(A[i])
      bs.push(B[i])
      ws.push(w)
      soma += w
    }
    return { peso: soma / L.length, as, bs, ws }
  })
}

// histograma 2D de (a, b): 120 × 120 casas de 0,004, suavizado
const CASA = 0.004
const LADO = 120
const MEIO = LADO / 2

function histograma(f, escala) {
  const h = new Float64Array(LADO * LADO)
  for (let i = 0; i < f.as.length; i++) {
    const x = Math.floor((f.as[i] * escala) / CASA + MEIO)
    const y = Math.floor((f.bs[i] * escala) / CASA + MEIO)
    if (x >= 0 && x < LADO && y >= 0 && y < LADO) h[y * LADO + x] += f.ws[i]
  }
  const nucleo = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => Math.exp(-(d * d) / (2 * 1.5 * 1.5)))
  const borrar = (src, passo, outroPasso) => {
    const out = new Float64Array(src.length)
    for (let p = 0; p < LADO; p++)
      for (let q = 0; q < LADO; q++) {
        let v = 0
        for (let k = 0; k < 9; k++) {
          const qq = q + k - 4
          if (qq >= 0 && qq < LADO) v += nucleo[k] * src[p * outroPasso + qq * passo]
        }
        out[p * outroPasso + q * passo] = v
      }
    return out
  }
  const b = borrar(borrar(h, 1, LADO), LADO, 1)
  let soma = 0
  for (const v of b) soma += v
  if (soma > 0) for (let i = 0; i < b.length; i++) b[i] /= soma
  return b
}

/**
 * Deslocamento de cor (a, b) que melhor sobrepõe a nuvem de cores do material (já com a saturação da referência) à da
 * referência, nesta faixa. Pele casa com pele, céu com céu, neutro com neutro, sem precisar saber qual é qual; o que
 * só existe numa das imagens (o vestido vermelho) não tem par e não puxa.
 */
function alinhar(fr, fm, sat) {
  if (!fr.ws.length || !fm.ws.length) return [0, 0]
  const hr = histograma(fr, 1)
  const hm = histograma(fm, sat)
  const cheias = []
  for (let i = 0; i < hm.length; i++) if (hm[i] > 1e-5) cheias.push(i)
  const R = BUSCA
  const placar = new Float64Array((2 * R + 1) ** 2)
  let melhor = -1
  let mx = 0
  let my = 0
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      let v = 0
      for (const i of cheias) {
        const x = (i % LADO) + dx
        const y = Math.floor(i / LADO) + dy
        if (x >= 0 && x < LADO && y >= 0 && y < LADO) v += Math.min(hm[i], hr[y * LADO + x])
      }
      v -= 1e-4 * Math.hypot(dx, dy) // empate: fica o menor deslocamento
      placar[(dy + R) * (2 * R + 1) + dx + R] = v
      if (v > melhor) {
        melhor = v
        mx = dx
        my = dy
      }
    }
  // ajuste fino entre casas (parábola pelos vizinhos)
  const em = (dx, dy) => placar[(dy + R) * (2 * R + 1) + dx + R]
  const fino = (a, b, c) => {
    const den = a - 2 * b + c
    return den < 0 ? limitar((0.5 * (a - c)) / den, [-0.5, 0.5]) : 0
  }
  const fx = Math.abs(mx) < R ? fino(em(mx - 1, my), em(mx, my), em(mx + 1, my)) : 0
  const fy = Math.abs(my) < R ? fino(em(mx, my - 1), em(mx, my), em(mx, my + 1)) : 0
  return [(mx + fx) * CASA, (my + fy) * CASA]
}

/**
 * Razão de saturação referência ÷ material, comparando cada matiz com ele mesmo (12 setores). Pixels quase neutros
 * ficam fora (o matiz deles é ruído). Setor que falta em uma das imagens não vota.
 */
function razaoSaturacao(ref, mat) {
  const porSetor = (img) => {
    const setores = Array.from({ length: SETORES }, () => [])
    for (let i = 0; i < img.A.length; i++) {
      const c = Math.hypot(img.A[i], img.B[i])
      if (c < CROMA_MINIMO) continue
      const h = (Math.atan2(img.B[i], img.A[i]) / (2 * Math.PI) + 1) % 1
      setores[Math.floor(h * SETORES) % SETORES].push(c)
    }
    return setores.map((cs) => ({ n: cs.length / img.A.length, mediana: cs.length ? quantis(cs, [0.5])[0] : 0 }))
  }
  const r = porSetor(ref)
  const m = porSetor(mat)
  const razoes = []
  const pesos = []
  for (let k = 0; k < SETORES; k++) {
    const peso = Math.min(r[k].n, m[k].n)
    if (peso < 0.005) continue
    razoes.push(r[k].mediana / m[k].mediana)
    pesos.push(peso)
  }
  return razoes.length ? limitar(quantilPonderado(razoes, pesos, 0.5), SATURACAO) : 1
}

const limitar = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))

/**
 * Cria o look. Devolve `{ aplicar(r, g, b, intensidade?) → [r, g, b], resumo }`: a intensidade pode mudar a cada
 * chamada sem refazer a análise (a tela usa isso no controle deslizante).
 * `opcoes.intensidade` (0–1, padrão 1); `opcoes.tom` / `opcoes.cor` (padrão true) ligam só o contraste ou só a cor.
 */
export function criarLook(referencia, material, opcoes = {}) {
  const intensidade = limitar(opcoes.intensidade ?? 1, [0, 1])
  const usarTom = opcoes.tom ?? true
  const usarCor = opcoes.cor ?? true
  const ref = referencia.L ? referencia : analisar(referencia)
  const mat = material.L ? material : analisar(material)

  const tom = usarTom ? curvaDeTom(mat.L, ref.L) : { f: (x) => x, xs: [], ys: [] }
  const Lmat = mat.L.map(tom.f)
  const sat = usarCor ? razaoSaturacao(ref, mat) : 1
  const fr = separarFaixas(ref.L, ref.A, ref.B)
  const fm = separarFaixas(Lmat, mat.A, mat.B)
  const desloc = FAIXAS.map((_, k) => (usarCor ? alinhar(fr[k], fm[k], sat) : [0, 0]))

  // confiança: faixa rara em qualquer das imagens quase não mexe
  // deslocamento de cor ao longo da luz como uma reta (dominante geral + inclinação sombras → altos, o split-tone):
  // cada faixa sozinha oscila com o conteúdo; a reta junta as sete e só segue o que é consistente
  const conf = FAIXAS.map((_, k) => Math.min(fr[k].peso / (fr[k].peso + 0.01), fm[k].peso / (fm[k].peso + 0.01)))
  const reta = [0, 1].map((canal) => {
    const d = desloc.map((v) => v[canal])
    let sw = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    FAIXAS.forEach((x, k) => {
      const w = conf[k]
      sw += w
      sx += w * x
      sy += w * d[k]
      sxx += w * x * x
      sxy += w * x * d[k]
    })
    if (sw < 1e-6) return [0, 0]
    const den = sw * sxx - sx * sx
    const inclinacao = den > 1e-9 ? (sw * sxy - sx * sy) / den : 0
    return [(sy - inclinacao * sx) / sw, inclinacao]
  })
  const confGeral = conf.reduce((x, y) => x + y, 0) / FAIXAS.length
  const faixas = FAIXAS.map((c, k) => ({
    L: c,
    desloca: [conf[k] * (reta[0][0] + reta[0][1] * c), conf[k] * (reta[1][0] + reta[1][1] * c)],
    saturacao: 1 + confGeral * (sat - 1),
    confianca: conf[k],
  }))

  const naLuz = (L) => {
    let w = 0
    const r = [0, 0, 0]
    for (const f of faixas) {
      const p = pesoFaixa(L, f.L) + 1e-9
      w += p
      r[0] += p * f.desloca[0]
      r[1] += p * f.desloca[1]
      r[2] += p * f.saturacao
    }
    return r.map((v) => v / w)
  }

  function emOklab(L, a, b, t = intensidade) {
    const L2 = tom.f(L)
    if (!usarCor) return [L + (L2 - L) * t, a, b]
    const [da, db, s] = naLuz(L2)
    const a2 = a * s + da
    const b2 = b * s + db
    return [L + (L2 - L) * t, a + (a2 - a) * t, b + (b2 - b) * t]
  }

  return {
    aplicar(r, g, b, t = intensidade) {
      const [L, a, bb] = codigoParaOklab(r, g, b)
      const o = emOklab(L, a, bb, limitar(t, [0, 1]))
      return oklabParaCodigo(o[0], o[1], o[2])
    },
    emOklab,
    resumo: {
      intensidade,
      tom: { preto: tom.f(0), cinza: tom.f(0.5), branco: tom.f(1), pontos: tom.xs.map((x, i) => [x, tom.ys[i]]) },
      faixas,
    },
  }
}

/** Frase curta para cada faixa de luz ("Sombras: mais frio"). A saturação é uma só: `descreverSaturacao`. */
export function descrever(resumo) {
  const nomes = ['Pretos', 'Sombras', 'Sombras altas', 'Médios', 'Médios altos', 'Altos', 'Brancos']
  return resumo.faixas.map((f, i) => {
    const [da, db] = f.desloca
    const partes = []
    if (Math.hypot(da, db) >= 0.004) {
      if (Math.abs(db) >= Math.abs(da)) partes.push(db > 0 ? 'mais quente' : 'mais frio')
      else partes.push(da > 0 ? 'para o magenta' : 'para o verde')
    }
    return `${nomes[i]}: ${partes.length ? partes.join(', ') : 'sem mudança de cor'}`
  })
}

/** "Saturação: 16% menos" (vale para a imagem inteira). */
export function descreverSaturacao(resumo) {
  const s = resumo.faixas[0]?.saturacao ?? 1
  const pct = Math.round(Math.abs(s - 1) * 100)
  return pct < 3 ? 'Saturação: igual' : `Saturação: ${pct}% ${s > 1 ? 'mais' : 'menos'}`
}

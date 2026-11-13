// Branco por temperatura e tinta, de 2000 a 50000 K, como os fotógrafos conhecem: a temperatura anda pelo lugar dos
// corpos negros (Planck) e a tinta sai dele na perpendicular, no diagrama CIE 1960 (u, v) — a mesma construção da
// temperatura de cor correlata (CCT e Duv).
//
// Fontes:
// - xy do corpo negro: Kim, Kang, Kim, Shin, Kim, Lee, Jeong (2002), "Design of advanced color temperature control
//   system for HDTV applications", J. Korean Physical Society 41(6): cúbicas em 1/T ajustadas de 1667 a 25000 K.
//   Acima de 25000 K a cúbica é usada fora do ajuste: ela tende a (0,2404; 0,2351) com T → ∞, contra (0,2399; 0,2342)
//   do corpo negro de temperatura infinita, então o erro até 50000 K fica abaixo de 0,001 em xy.
// - (u, v): CIE 1960 UCS (MacAdam). Isotermas perpendiculares ao lugar de Planck nesse diagrama: definição da CCT
//   (Robertson 1968; CIE 15).
// - Escala da tinta: Duv = tinta / 3000, positivo para o lado verde. É a convenção dos arquivos DNG e do Camera Raw
//   (tinta +10 ≈ D65 sobre 6500 K), para a predefinição importada dizer a mesma coisa aqui.
//
// A temperatura e a tinta descrevem a LUZ DA CENA. Dizer que a luz era mais azul (mais kelvin) esquenta a foto; dizer
// que era mais verde (tinta positiva) puxa a foto para o magenta.

export const KELVIN_MIN = 2000
export const KELVIN_MAX = 50000
const ESCALA_TINTA = 3000

const suave = (a, b, x) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a)
  return t * t * (3 - 2 * t)
}

/**
 * xy do corpo negro à temperatura T (kelvin). Vale de 1667 K para cima. Nas emendas das cúbicas do artigo (2222 K e
 * 4000 K) os dois trechos, que ali diferem em menos de 2e-4, são misturados numa janela estreita: o lugar fica sem
 * degrau nem quina, e a perpendicular (a tinta) não pula.
 */
export function xyDePlanck(T) {
  const t = Math.max(1667, T)
  const i = 1 / t
  const xBaixo = ((-0.2661239e9 * i - 0.2343589e6) * i + 0.8776956e3) * i + 0.17991
  const xAlto = ((-3.0258469e9 * i + 2.1070379e6) * i + 0.2226347e3) * i + 0.24039
  const em4000 = suave(3800, 4200, t)
  const x = t <= 3800 ? xBaixo : t >= 4200 ? xAlto : xBaixo + (xAlto - xBaixo) * em4000
  const y1 = ((-1.1063814 * x - 1.3481102) * x + 2.18555832) * x - 0.20219683
  const y2 = ((-0.9549476 * x - 1.37418593) * x + 2.09137015) * x - 0.16748867
  const y3 = ((3.081758 * x - 5.8733867) * x + 3.75112997) * x - 0.37001483
  const y12 = y1 + (y2 - y1) * suave(2122, 2322, t)
  return [x, y12 + (y3 - y12) * em4000]
}

/** xy → (u, v) do CIE 1960. */
export function uvDeXy([x, y]) {
  const d = -2 * x + 12 * y + 3
  return [(4 * x) / d, (6 * y) / d]
}

/** (u, v) do CIE 1960 → xy. */
export function xyDeUv([u, v]) {
  const d = 2 * u - 8 * v + 4
  return [(3 * u) / d, (2 * v) / d]
}

// Ponto do lugar de Planck e a normal para o lado verde, em (u, v), em função do mired (1e6 / T). A tangente sai por
// diferença central em mired: é em mired que o lugar anda em passos parecidos.
function lugar(mired) {
  const p = uvDeXy(xyDePlanck(1e6 / mired))
  const h = 0.25
  const a = uvDeXy(xyDePlanck(1e6 / (mired - h)))
  const b = uvDeXy(xyDePlanck(1e6 / (mired + h)))
  let tu = b[0] - a[0]
  let tv = b[1] - a[1]
  const n = Math.hypot(tu, tv)
  tu /= n
  tv /= n
  // a normal com v crescente é o lado verde em toda a faixa (as isotermas têm inclinação negativa em u, v)
  return { u: p[0], v: p[1], tu, tv, nu: tv > 0 ? -tv : tv, nv: tv > 0 ? tu : -tu }
}

/** xy do branco de temperatura T (kelvin) e tinta (−150 a 150). */
export function xyDeTemperatura(kelvin, tinta = 0) {
  const T = Math.min(KELVIN_MAX * 2, Math.max(1667, kelvin))
  const l = lugar(1e6 / T)
  const d = tinta / ESCALA_TINTA
  return xyDeUv([l.u + l.nu * d, l.v + l.nv * d])
}

/**
 * A volta: de um xy para a temperatura (o pé da perpendicular no lugar de Planck) e a tinta (a distância com sinal).
 * Devolve também `noLugar: false` quando o ponto está tão longe (|tinta| > 150) que falar em temperatura deixa de
 * fazer sentido; os números saem mesmo assim, limitados à faixa.
 */
export function temperaturaDeXy(xy) {
  const [u, v] = uvDeXy(xy)
  // g(mired) = (ponto − lugar) · tangente: zero no pé da perpendicular; positivo quando o pé está mais adiante
  const g = (m) => {
    const l = lugar(m)
    return (u - l.u) * l.tu + (v - l.v) * l.tv
  }
  const mMin = 1e6 / (KELVIN_MAX * 2)
  const mMax = 1e6 / 1667
  // varre para achar o trecho com troca de sinal mais perto do ponto (longe do lugar pode haver mais de um pé)
  const N = 96
  let melhor = null
  let anterior = { m: mMin, g: g(mMin) }
  for (let i = 1; i <= N; i++) {
    // passo igual em log do mired: o lugar tem mais curva nas temperaturas baixas, mas a faixa alta é comprida
    const m = mMin * (mMax / mMin) ** (i / N)
    const atual = { m, g: g(m) }
    if (anterior.g >= 0 && atual.g < 0) {
      const l = lugar((anterior.m + atual.m) / 2)
      const dist = Math.hypot(u - l.u, v - l.v)
      if (!melhor || dist < melhor.dist) melhor = { a: anterior.m, b: atual.m, dist }
    }
    anterior = atual
  }
  let mired
  if (melhor) {
    let { a, b } = melhor
    for (let i = 0; i < 60; i++) {
      const meio = (a + b) / 2
      if (g(meio) >= 0) a = meio
      else b = meio
    }
    mired = (a + b) / 2
  } else {
    mired = g(mMin) < 0 ? mMin : mMax
  }
  const l = lugar(mired)
  const tinta = ((u - l.u) * l.nu + (v - l.v) * l.nv) * ESCALA_TINTA
  const kelvin = 1e6 / mired
  return {
    kelvin: Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, kelvin)),
    tinta: Math.min(150, Math.max(-150, tinta)),
    noLugar: Math.abs(tinta) <= 150 && kelvin >= KELVIN_MIN * 0.999 && kelvin <= KELVIN_MAX * 1.001,
  }
}

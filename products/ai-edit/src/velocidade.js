// Velocidade do clipe (speed ramp). A curva fica no clipe, ancorada na mídia de origem: pontos [x, v] com x de 0 a 1
// ao longo do trecho de origem do clipe e v de 0,1 (10%) a 8 (800%), ligados por uma curva monótona no espaço do log
// (100% → 800% e 100% → 12,5% andam o mesmo tanto, e a curva nunca passa do ponto: sem "pulo" fora do desenho).
//
// A curva vira uma tabela de DEGRAUS de velocidade constante (≈ 4 quadros de saída cada; vizinhos quase iguais se
// juntam). Prévia, render e exportadores usam os mesmos degraus: o que se vê é o que sai, e o Premiere, o DaVinci e o
// EDL (que só leem velocidade constante) recebem a mesma rampa que o Final Cut.
//
// Som (decisão do titular, 31/10/2026): só toca onde a velocidade é 100%; nas partes aceleradas ou lentas, silêncio.
//
// Referências estudadas: curvas prontas do CapCut (Montagem, Herói, Bala, Flash), pontos de velocidade + curva do
// DaVinci, rampa com alças Bézier do Premiere e os presets editáveis + "aplicar em vários takes" do Hélice Ramps.

export const V_MIN = 0.1
export const V_MAX = 8
const PASSO = 4 // quadros de saída por degrau
const JUNTA = 0.02 // degraus vizinhos com menos de 2% de diferença viram um
const NORMAL = 0.02 // |v − 1| até 2% conta como 100% (som ligado)

const lim = (v) => Math.min(V_MAX, Math.max(V_MIN, v))

/** Curvas prontas: nome, dica e pontos [x, v]. As de cima vêm do mercado (CapCut, Hélice); "Manter duração" é nossa. */
export const CURVAS = Object.freeze([
  { id: 'montagem', nome: 'Montagem', dica: 'Acelera, respira devagar e acelera de novo.', pontos: [[0, 1], [0.18, 4], [0.36, 0.5], [0.58, 0.5], [0.76, 4], [1, 1]] },
  { id: 'heroi', nome: 'Herói', dica: 'Rápido até o momento, câmera lenta nele, rápido de novo.', pontos: [[0, 2], [0.3, 2], [0.44, 0.25], [0.6, 0.25], [0.74, 2], [1, 2]] },
  { id: 'bala', nome: 'Bala', dica: 'Quase parado no meio, como bullet time.', pontos: [[0, 3], [0.36, 3], [0.5, 0.12], [0.64, 3], [1, 3]] },
  { id: 'vale', nome: 'Vale', dica: 'Entra e sai rápido, desacelera no meio (U).', pontos: [[0, 4], [0.28, 3.2], [0.5, 0.35], [0.72, 3.2], [1, 4]] },
  { id: 'pico', nome: 'Pico', dica: 'Normal, um estouro de velocidade no meio, normal.', pontos: [[0, 1], [0.36, 1], [0.5, 6], [0.64, 1], [1, 1]] },
  { id: 'flash-entrada', nome: 'Flash de entrada', dica: 'Chega rápido e assenta na velocidade normal.', pontos: [[0, 6], [0.28, 6], [0.5, 1], [1, 1]] },
  { id: 'flash-saida', nome: 'Flash de saída', dica: 'Normal e sai acelerando.', pontos: [[0, 1], [0.5, 1], [0.72, 6], [1, 6]] },
  { id: 'arrancada', nome: 'Arrancada', dica: 'Começa lento e dispara (curva em S).', pontos: [[0, 0.4], [0.3, 0.5], [0.7, 4], [1, 5]] },
  { id: 'pulso', nome: 'Pulso duplo', dica: 'Dois estouros no ritmo, normal entre eles.', pontos: [[0, 1], [0.2, 5], [0.35, 1], [0.65, 1], [0.8, 5], [1, 1]] },
  { id: 'lenta', nome: 'Câmera lenta', dica: '50% o clipe inteiro.', pontos: [[0, 0.5], [1, 0.5]] },
  { id: 'rapida', nome: 'Acelerado', dica: '200% o clipe inteiro.', pontos: [[0, 2], [1, 2]] },
])

/** Pontos válidos: x de 0 a 1 em ordem (primeiro 0, último 1), v dentro dos limites. null = sem curva (100%). */
export function limparPontos(pontos) {
  if (!Array.isArray(pontos)) return null
  const ps = pontos
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([x, v]) => [Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000, Math.round(lim(v) * 1000) / 1000])
    .sort((a, b) => a[0] - b[0])
  const unicos = ps.filter((p, i) => i === 0 || p[0] > ps[i - 1][0])
  if (!unicos.length) return null
  if (unicos[0][0] > 0) unicos.unshift([0, unicos[0][1]])
  if (unicos.at(-1)[0] < 1) unicos.push([1, unicos.at(-1)[1]])
  if (unicos.every((p) => Math.abs(p[1] - 1) < 1e-6)) return null
  return unicos
}

/** v(x) da curva: Hermite monótona (Fritsch–Carlson) no log2 da velocidade. */
export function avaliar(pontos, x) {
  if (!pontos) return 1
  const n = pontos.length
  if (n === 1) return pontos[0][1]
  const xs = pontos.map((p) => p[0])
  const ys = pontos.map((p) => Math.log2(p[1]))
  if (x <= xs[0]) return 2 ** ys[0]
  if (x >= xs[n - 1]) return 2 ** ys[n - 1]
  const d = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  const m = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  let i = 0
  while (i < n - 2 && x > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i]
  const t = (x - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
  return lim(2 ** y)
}

/** Quanto do tempo original a curva usa: ∫ dx / v(x). 1 = mesma duração; 0,5 = metade. */
export function fatorDuracao(pontos, amostras = 400) {
  if (!pontos) return 1
  let s = 0
  for (let k = 0; k < amostras; k++) s += 1 / avaliar(pontos, (k + 0.5) / amostras)
  return s / amostras
}

/** "Manter duração": a mesma forma, escalada para o clipe ocupar o mesmo tempo na linha (o que o ritmo da música pede). */
export function manterDuracao(pontos) {
  if (!pontos) return null
  const k = fatorDuracao(pontos)
  return limparPontos(pontos.map(([x, v]) => [x, v * k]))
}

/**
 * Corta a curva para um novo trecho de origem [iniNovo, fimNovo) de um clipe que ia de [ini, fim): os pontos que
 * caem dentro continuam onde estavam na mídia; as pontas novas pegam a velocidade daquele ponto (fora do trecho
 * antigo, a velocidade da ponta). Dividir, aparar e cortar silêncio de um clipe acelerado não muda a rampa.
 */
export function reancorar(pontos, ini, fim, iniNovo, fimNovo) {
  if (!pontos || fimNovo <= iniNovo || fim <= ini) return pontos ? limparPontos(pontos) : null
  const u = (q) => (q - ini) / (fim - ini)
  const x = (q) => (q - iniNovo) / (fimNovo - iniNovo)
  const em = (q) => avaliar(pontos, Math.min(1, Math.max(0, u(q))))
  const dentro = pontos.filter(([px]) => {
    const q = ini + px * (fim - ini)
    return q > iniNovo && q < fimNovo
  })
  return limparPontos([[0, em(iniNovo)], ...dentro.map(([px, v]) => [x(ini + px * (fim - ini)), v]), [1, em(fimNovo)]])
}

// ───────── a tabela de degraus (guardada por clipe: clipes são imutáveis, então o próprio objeto é a chave) ─────────

const cache = new WeakMap()

/**
 * Degraus de um clipe: [{ s0, s1 (quadros de origem, relativos ao início do clipe), o0, o1 (quadros de saída), v }],
 * contíguos, cobrindo [0, N) na origem e [0, L) na saída. Sem curva: um degrau só, v = 1.
 */
export function degraus(c) {
  const hit = cache.get(c)
  if (hit) return hit
  const N = Math.max(1, c.fim - c.ini)
  const pontos = c.velocidade?.pontos || null
  let r
  if (!pontos) r = [{ s0: 0, s1: N, o0: 0, o1: N, v: 1 }]
  else {
    // tempo de saída acumulado em cada quadro de origem
    const C = new Float64Array(N + 1)
    for (let s = 0; s < N; s++) C[s + 1] = C[s] + 1 / avaliar(pontos, (s + 0.5) / N)
    const L = Math.max(1, Math.round(C[N]))
    const escala = L / C[N]
    // origem (fracionária) no quadro de saída k
    let j = 0
    const origemEm = (k) => {
      const alvo = k / escala
      while (j < N && C[j + 1] < alvo) j++
      const a = C[j]
      const b = C[Math.min(N, j + 1)]
      return j + (b > a ? (alvo - a) / (b - a) : 0)
    }
    const cortes = [[0, 0]]
    for (let k = PASSO; k < L; k += PASSO) {
      const s = Math.round(origemEm(k))
      if (s > cortes.at(-1)[1] && s < N) cortes.push([k, s])
    }
    cortes.push([L, N])
    let ds = []
    for (let i = 0; i < cortes.length - 1; i++) {
      const [o0, s0] = cortes[i]
      const [o1, s1] = cortes[i + 1]
      if (o1 > o0 && s1 > s0) ds.push({ s0, s1, o0, o1, v: (s1 - s0) / (o1 - o0) })
      else if (ds.length) {
        ds.at(-1).s1 = s1
        ds.at(-1).o1 = o1
        ds.at(-1).v = (ds.at(-1).s1 - ds.at(-1).s0) / (ds.at(-1).o1 - ds.at(-1).o0)
      }
    }
    // junta vizinhos quase iguais (menos clipes no Premiere e no EDL, mesma rampa)
    const juntos = []
    for (const d of ds) {
      const a = juntos.at(-1)
      if (a && Math.abs(a.v - d.v) / Math.max(a.v, d.v) < JUNTA) {
        a.s1 = d.s1
        a.o1 = d.o1
        a.v = (a.s1 - a.s0) / (a.o1 - a.o0)
      } else juntos.push({ ...d })
    }
    ds = juntos
    r = ds
  }
  Object.freeze(r)
  cache.set(c, r)
  return r
}

/** Quadros que o clipe ocupa na linha. */
export const saidaDoClipe = (c) => (c.velocidade ? degraus(c).at(-1).o1 : c.fim - c.ini)

/** Quadro de origem (absoluto, fracionário) para o deslocamento k (quadros de saída) dentro do clipe. */
export function origemNoClipe(c, k) {
  if (!c.velocidade) return c.ini + k
  const ds = degraus(c)
  const d = ds.find((x) => k < x.o1) || ds.at(-1)
  return c.ini + d.s0 + (Math.min(k, d.o1) - d.o0) * d.v
}

/** Deslocamento de saída (fracionário) para o quadro de origem absoluto q dentro do clipe. */
export function saidaNoClipe(c, q) {
  const s = q - c.ini
  if (!c.velocidade) return s
  const ds = degraus(c)
  const d = ds.find((x) => s < x.s1) || ds.at(-1)
  return d.o0 + (Math.min(s, d.s1) - d.s0) / d.v
}

/** Velocidade no deslocamento de saída k. */
export function velocidadeNoClipe(c, k) {
  if (!c.velocidade) return 1
  const ds = degraus(c)
  return (ds.find((x) => k < x.o1) || ds.at(-1)).v
}

/** O som toca nesta velocidade? Só em 100% (decisão do titular). */
export const comSom = (v) => Math.abs(v - 1) <= NORMAL

/**
 * Pedaços de velocidade constante do trecho de origem [a, b) (absolutos) do clipe: [{ ini, fim (origem), saida
 * (quadros de saída, inteiro), v, som }]. Usado pelos segmentos dos exportadores e do render.
 */
export function pedacos(c, a, b) {
  if (!c.velocidade) return [{ ini: a, fim: b, saida: b - a, v: 1, som: true }]
  const ds = degraus(c)
  const o = (q) => Math.round(saidaNoClipe(c, q))
  const cortes = new Set([a, b])
  for (const d of ds) if (c.ini + d.s0 > a && c.ini + d.s0 < b) cortes.add(c.ini + d.s0)
  const pts = [...cortes].sort((x, y) => x - y)
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const ini = pts[i]
    const fim = pts[i + 1]
    const saida = o(fim) - o(ini)
    if (saida <= 0) {
      // menos de um quadro de saída: o trecho vai junto com o anterior
      if (out.length) out.at(-1).fim = fim
      continue
    }
    const v = (fim - ini) / saida
    out.push({ ini, fim, saida, v, som: comSom(v) })
  }
  for (const p of out) {
    p.v = (p.fim - p.ini) / p.saida
    p.som = comSom(p.v)
  }
  return out
}

/** Velocidade média do clipe (para mostrar "220%" no clipe e no Inspector). */
export const velocidadeMedia = (c) => (c.fim - c.ini) / saidaDoClipe(c)

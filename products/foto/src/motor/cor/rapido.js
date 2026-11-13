// log2 e 2^x por tabela, para o laço por pixel em JS (a GPU usa as funções dela). Math.log2 e Math.pow custam de 15
// a 60 ns cada no V8; estas ficam perto de 3 ns, com erro relativo abaixo de 3e-7 (cem vezes menor que um passo de
// 16 bits). Onde a conta precisa ser exata — a inversa da tela, a montagem das tabelas — o motor usa Math.
//
// log2: o expoente sai dos bits do float32 e a mantissa vai a uma tabela de 1024 trechos de log2(1 + m), com
// interpolação linear (erro ≤ (1/1024)²/(8·ln 2) = 1,7e-7). 2^x: parte inteira por tabela de potências, fração por
// tabela de 1024 trechos (erro relativo ≤ (ln 2/1024)²/8 = 5,7e-8).

const f32 = new Float32Array(1)
const i32 = new Int32Array(f32.buffer)
const N = 1024
const LOG = new Float64Array(N + 2)
const EXP = new Float64Array(N + 2)
for (let i = 0; i <= N + 1; i++) {
  LOG[i] = Math.log2(1 + i / N)
  EXP[i] = 2 ** (i / N)
}
const POT_MIN = -300
const POT_MAX = 300
const POT = new Float64Array(POT_MAX - POT_MIN + 1)
for (let k = POT_MIN; k <= POT_MAX; k++) POT[k - POT_MIN] = 2 ** k

/** log2(v) para v > 1,2e-38 (float32 normal). */
export function log2(v) {
  f32[0] = v
  const b = i32[0]
  const m = b & 0x7fffff
  const i = m >>> 13
  return (b >>> 23) - 127 + LOG[i] + (LOG[i + 1] - LOG[i]) * ((m & 0x1fff) * (1 / 8192))
}

/** 2^x, com x limitado a ±300. */
export function exp2(x) {
  if (x < POT_MIN) x = POT_MIN
  else if (x > POT_MAX - 1) x = POT_MAX - 1
  const k = Math.floor(x)
  const p = (x - k) * N
  const i = p | 0
  return POT[k - POT_MIN] * (EXP[i] + (EXP[i + 1] - EXP[i]) * (p - i))
}

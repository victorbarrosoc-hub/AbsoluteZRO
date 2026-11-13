// FFT própria (radix-2, Cooley-Tukey iterativa) e o cepstro de potência que a decupagem usa para separar tremido de
// desfoque de foco. Sem dependência: roda igual em Node, no navegador e num worker.
//
// Convenção: a direta usa e^(−2πi·k·n/N) e não divide; a inversa usa e^(+2πi·k·n/N) e divide por N. É a mesma do
// numpy.fft, o que deixa os testes compararem número com número.
//
// Por que existe um caminho só para imagem real (`espectroReal`, `cepstroDePotencia`): a prévia é real, então metade
// do espectro é o espelho conjugado da outra metade (simetria hermitiana). Duas linhas reais cabem numa FFT complexa
// só (uma na parte real, outra na imaginária) e só metade das colunas precisa ser transformada. No cepstro a volta
// pede apenas a vizinhança do centro (o tremido aparece a poucos pixels da origem), então só essas colunas são
// calculadas. Dá cerca de um terço das transformadas de uma FFT 2D ingênua nos dois sentidos.

const planos = new Map()

/** True quando n é potência de dois (≥ 2). */
export const potenciaDeDois = (n) => Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0

/**
 * Plano de FFT de tamanho n (potência de dois): tabela de senos e cossenos e a permutação de inversão de bits.
 * Fica guardado: pedir o mesmo tamanho de novo não refaz nada.
 * @returns {{ n: number, direta(re: Float64Array, im: Float64Array, inicio?: number, passo?: number): void,
 *             inversa(re: Float64Array, im: Float64Array, inicio?: number, passo?: number): void }}
 */
export function criarFft(n) {
  if (!potenciaDeDois(n)) throw new Error(`FFT: tamanho ${n} não é potência de dois`)
  const pronto = planos.get(n)
  if (pronto) return pronto
  const cos = new Float64Array(n / 2)
  const sen = new Float64Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n)
    sen[i] = Math.sin((2 * Math.PI * i) / n)
  }
  const troca = new Uint32Array(n)
  let bits = 0
  while (1 << bits < n) bits++
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    troca[i] = r
  }

  // pares da permutação (i < j), já resolvidos: a troca vira uma passada sem teste
  const pares = []
  for (let i = 0; i < n; i++) if (troca[i] > i) pares.push(i, troca[i])
  const paresDe = Uint32Array.from(pares)
  // rascunho contíguo para transformar uma coluna: andar de `passo` em `passo` num vetor grande estoura o cache
  const tr = new Float64Array(n)
  const ti = new Float64Array(n)

  // O miolo: transforma n valores contíguos a partir de `o`. `sinal` = −1 na direta, +1 na inversa.
  function miolo(re, im, o, sinal) {
    for (let p = 0; p < paresDe.length; p += 2) {
      const a = o + paresDe[p]
      const b = o + paresDe[p + 1]
      const xr = re[a]
      re[a] = re[b]
      re[b] = xr
      const xi = im[a]
      im[a] = im[b]
      im[b] = xi
    }
    // primeiro estágio: o fator é 1, sem multiplicação
    for (let a = o; a < o + n; a += 2) {
      const xr = re[a + 1]
      const xi = im[a + 1]
      re[a + 1] = re[a] - xr
      im[a + 1] = im[a] - xi
      re[a] += xr
      im[a] += xi
    }
    for (let meio = 2; meio < n; meio <<= 1) {
      const salto = n / (meio << 1)
      const dobro = meio << 1
      for (let k = 0; k < meio; k++) {
        const wr = cos[k * salto]
        const wi = sinal * sen[k * salto]
        for (let a = o + k; a < o + n; a += dobro) {
          const b = a + meio
          const xr = re[b] * wr - im[b] * wi
          const xi = re[b] * wi + im[b] * wr
          re[b] = re[a] - xr
          im[b] = im[a] - xi
          re[a] += xr
          im[a] += xi
        }
      }
    }
  }

  // `inicio` e `passo` deixam transformar uma linha (passo 1) ou uma coluna (passo = largura) no lugar.
  function transformar(re, im, inicio, passo, sinal) {
    if (passo === 1) return miolo(re, im, inicio, sinal)
    for (let i = 0, p = inicio; i < n; i++, p += passo) {
      tr[i] = re[p]
      ti[i] = im[p]
    }
    miolo(tr, ti, 0, sinal)
    for (let i = 0, p = inicio; i < n; i++, p += passo) {
      re[p] = tr[i]
      im[p] = ti[i]
    }
  }

  const plano = {
    n,
    direta: (re, im, inicio = 0, passo = 1) => transformar(re, im, inicio, passo, -1),
    inversa(re, im, inicio = 0, passo = 1) {
      transformar(re, im, inicio, passo, 1)
      for (let i = 0; i < n; i++) {
        re[inicio + i * passo] /= n
        im[inicio + i * passo] /= n
      }
    },
  }
  planos.set(n, plano)
  return plano
}

/**
 * FFT 2D complexa, no lugar. `re` e `im` têm largura × altura valores, linha a linha. Os dois lados precisam ser
 * potência de dois. `inversa = true` desfaz a direta (com a divisão por largura × altura).
 */
export function fft2(re, im, largura, altura, inversa = false) {
  const linhas = criarFft(largura)
  const colunas = criarFft(altura)
  for (let y = 0; y < altura; y++) (inversa ? linhas.inversa : linhas.direta)(re, im, y * largura, 1)
  for (let x = 0; x < largura; x++) (inversa ? colunas.inversa : colunas.direta)(re, im, x, largura)
}

/**
 * Espectro de uma imagem REAL quadrada n × n (potência de dois). Devolve só as colunas kx = 0..n/2 (o resto é o
 * espelho conjugado): `re` e `im` com n linhas (ky) e n/2 + 1 colunas, e `colunas = n/2 + 1`.
 */
export function espectroReal(dados, n) {
  const fft = criarFft(n)
  const colunas = n / 2 + 1
  const re = new Float64Array(n * colunas)
  const im = new Float64Array(n * colunas)
  const zr = new Float64Array(n)
  const zi = new Float64Array(n)
  // duas linhas reais por FFT: z = a + i·b. Depois A[k] = (Z[k] + conj(Z[−k])) / 2 e B[k] = (Z[k] − conj(Z[−k])) / 2i
  for (let y = 0; y < n; y += 2) {
    const a = y * n
    const b = a + n
    for (let x = 0; x < n; x++) {
      zr[x] = dados[a + x]
      zi[x] = dados[b + x]
    }
    fft.direta(zr, zi)
    const sa = y * colunas
    const sb = sa + colunas
    for (let k = 0; k < colunas; k++) {
      const m = (n - k) & (n - 1)
      re[sa + k] = (zr[k] + zr[m]) / 2
      im[sa + k] = (zi[k] - zi[m]) / 2
      re[sb + k] = (zi[k] + zi[m]) / 2
      im[sb + k] = (zr[m] - zr[k]) / 2
    }
  }
  for (let k = 0; k < colunas; k++) fft.direta(re, im, k, colunas)
  return { re, im, colunas }
}

/**
 * Cepstro de potência de uma imagem real quadrada: C = IFFT2(log(|FFT2(I)| + piso)), só na vizinhança do centro.
 * (Bogert, Healy e Tukey, 1963; para borrão de movimento, Cannon, IEEE Trans. ASSP 24(1), 1976.)
 *
 * Como log|F| é real e par, C também é real e par: C(−dy, −dx) = C(dy, dx). Por isso só a metade dx ≥ 0 é calculada.
 * Devolve `{ raio, lado, dados }` com lado = raio + 1 colunas (dx = 0..raio) e 2·raio + 1 linhas (dy = −raio..raio):
 * C(dy, dx) = dados[(dy + raio) · lado + dx]. Use `lerCepstro` para qualquer (dy, dx).
 */
export function cepstroDePotencia(dados, n, raio, piso = 1e-3) {
  if (raio >= n / 2) throw new Error('Cepstro: o raio precisa ser menor que metade do lado')
  const fft = criarFft(n)
  const { re, im, colunas } = espectroReal(dados, n)
  // X = log(|F| + piso) no plano inteiro (n × n), preenchido pelo espelho: X(−ky, −kx) = X(ky, kx)
  const X = new Float64Array(n * n)
  for (let ky = 0; ky < n; ky++) {
    const espelho = ((n - ky) & (n - 1)) * n
    for (let kx = 0; kx < colunas; kx++) {
      const i = ky * colunas + kx
      const v = Math.log(Math.sqrt(re[i] * re[i] + im[i] * im[i]) + piso)
      X[ky * n + kx] = v
      X[espelho + ((n - kx) & (n - 1))] = v
    }
  }
  // linhas ky = 0..n/2 (as outras são o conjugado), duas por FFT, guardando só dx = 0..raio
  const lado = raio + 1
  const gr = new Float64Array(n * lado)
  const gi = new Float64Array(n * lado)
  const zr = new Float64Array(n)
  const zi = new Float64Array(n)
  for (let ky = 0; ky <= n / 2; ky += 2) {
    const a = ky * n
    const temB = ky + 1 <= n / 2
    const b = a + n
    for (let x = 0; x < n; x++) {
      zr[x] = X[a + x]
      zi[x] = temB ? X[b + x] : 0
    }
    fft.direta(zr, zi)
    for (let k = 0; k < lado; k++) {
      const m = (n - k) & (n - 1)
      gr[ky * lado + k] = (zr[k] + zr[m]) / 2
      gi[ky * lado + k] = (zi[k] - zi[m]) / 2
      if (temB) {
        gr[(ky + 1) * lado + k] = (zi[k] + zi[m]) / 2
        gi[(ky + 1) * lado + k] = (zr[m] - zr[k]) / 2
      }
    }
  }
  for (let ky = n / 2 + 1; ky < n; ky++) {
    const de = (n - ky) * lado
    const para = ky * lado
    for (let k = 0; k < lado; k++) {
      gr[para + k] = gr[de + k]
      gi[para + k] = -gi[de + k]
    }
  }
  const saida = new Float64Array((2 * raio + 1) * lado)
  const escala = 1 / (n * n)
  for (let k = 0; k < lado; k++) {
    fft.direta(gr, gi, k, lado)
    for (let dy = -raio; dy <= raio; dy++) saida[(dy + raio) * lado + k] = gr[((dy + n) & (n - 1)) * lado + k] * escala
  }
  return { raio, lado, dados: saida }
}

/** Valor do cepstro em (dy, dx), com |dy| e |dx| ≤ raio. Usa a simetria C(−dy, −dx) = C(dy, dx). */
export function lerCepstro(cepstro, dy, dx) {
  const { raio, lado, dados } = cepstro
  return dx >= 0 ? dados[(dy + raio) * lado + dx] : dados[(raio - dy) * lado - dx]
}

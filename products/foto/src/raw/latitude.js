// Latitude: o que o ARQUIVO tem de faixa, medido no dado do sensor e não na ficha da câmera. É o número que decide
// quanto dá para puxar das altas e das sombras desta foto, e o que a decupagem usa para não reprovar uma foto escura
// que ainda tem dado limpo.
//
// O que se mede, e por quê (método rodado em 12 arquivos reais antes de virar código):
//   preto      nos pixels mascarados do sensor, quando existem DE VERDADE. A margem declarada mente: na Canon R6 a
//              margem tem 156 colunas, mas só ~140 são pretas; em outras câmeras a margem é enchimento com zeros ou
//              cópia da imagem. Por isso a faixa é validada pelo dado (média e desvio linha a linha).
//   branco     a saturação efetiva por canal: o menor entre o declarado e o empilhamento no topo do histograma.
//              A Canon 30D declara 4095 e corta em 3398.
//   ruído      modelo Poisson-Gauss, var(S) = ganho·S + leitura² em DN (Foi, Trimeche, Katkovnik e Egiazarian,
//              "Practical Poissonian-Gaussian noise modeling and fitting for single-image raw-data", IEEE TIP 2008; é
//              o mesmo modelo da tag NoiseProfile do DNG). Leitura: desvio dos mascarados. Ganho: ajuste sobre a
//              diferença entre verdes vizinhos, por faixa de sinal, com desvio robusto (MAD). Com NoiseProfile no
//              arquivo, vale o perfil.
//   faixa      de engenharia = log2(saturação / ruído de leitura); fotográfica = até o sinal em que SNR = 10.
//   margem     quantos stops sobram desta foto até estourar (por canal), quantos até o piso de ruído, e quantos há
//              acima e abaixo do cinza médio (0,18), já com a exposição base do arquivo.
//   cortado    fração da área com 1, 2 ou 3 canais saturados (1 e 2 dão para reconstruir; 3 é perda).
//
// Tudo em uma amostra do sensor (blocos inteiros do mosaico, de N em N linhas de bloco): 24 MP em bem menos de 150 ms.
// O que não deu para medir sai `null`, nunca um número de enfeite; `confianca` diz o quanto confiar.

import { corEm, pretoEm, G } from './negativo.js'

const SENSELS_NA_AMOSTRA = 6e6 // alvo da amostra: o suficiente para ver 0,01 % de um canal empilhado
const FAIXAS = 56 // faixas de sinal do ajuste de ruído: a 0 é "sem sinal" e as demais têm 1/3 de stop
const MEIA_DIFERENCA = 4095 // a diferença entre dois verdes entra num histograma de −4095 a +4095
const LARGURA_DIF = MEIA_DIFERENCA * 2 + 1
const PARES_POR_FAIXA = 400 // menos que isso e o desvio robusto da faixa não é confiável
const CORTE = 0.98 // sensel conta como saturado a partir de 98 % da faixa (preto → branco) do canal
const CINZA = 0.18

const log2 = Math.log2
const mod = (a, n) => ((a % n) + n) % n

// ------------------------------------------------------------------------------------------------- mascarados

/** Média, desvio e fração de zeros de uma linha (ou coluna) da margem, no miolo da imagem. */
function perfil(n, ao, de, ate, linhaFixa) {
  const { dados, largura } = n.sensor
  const passo = Math.max(1, Math.floor((ate - de) / 600))
  let s = 0
  let s2 = 0
  let zeros = 0
  let k = 0
  for (let i = de; i < ate; i += passo) {
    const v = linhaFixa ? dados[ao * largura + i] : dados[i * largura + ao]
    s += v
    s2 += v * v
    if (v === 0) zeros++
    k++
  }
  const media = s / k
  return { media, desvio: Math.sqrt(Math.max(0, s2 / k - media * media)), zeros: zeros / k }
}

const mediana = (v) => {
  const o = Float64Array.from(v).sort()
  return o.length ? o[o.length >> 1] : NaN
}

/**
 * Procura, em cada margem, a faixa que é preta de verdade: anda da borda do sensor para dentro enquanto a média de
 * cada linha fica a 1 % da mediana e o desvio não dispara. Devolve o retângulo validado mais largo, ou null.
 */
function acharMascarados(n, pretoDeclarado, faixaDeclarada) {
  const { sensor, area } = n
  const y0 = area.y + Math.floor(area.altura * 0.2)
  const y1 = area.y + Math.floor(area.altura * 0.8)
  const x0 = area.x + Math.floor(area.largura * 0.2)
  const x1 = area.x + Math.floor(area.largura * 0.8)
  // cada margem: espessura, e como ir da borda de fora (i = 0) para dentro
  const margens = [
    { nome: 'esquerda', esp: area.x, pos: (i) => i, vertical: true },
    { nome: 'direita', esp: sensor.largura - area.x - area.largura, pos: (i) => sensor.largura - 1 - i, vertical: true },
    { nome: 'topo', esp: area.y, pos: (i) => i, vertical: false },
    { nome: 'base', esp: sensor.altura - area.y - area.altura, pos: (i) => sensor.altura - 1 - i, vertical: false }
  ]
  let melhor = null
  for (const m of margens) {
    if (m.esp < 8) continue
    const linhas = []
    for (let i = 0; i < m.esp; i++) linhas.push(m.vertical ? perfil(n, m.pos(i), y0, y1, false) : perfil(n, m.pos(i), x0, x1, true))
    const miolo = linhas.slice(2, Math.max(8, m.esp >> 1))
    const ref = mediana(miolo.map((l) => l.media))
    const desvioRef = mediana(miolo.map((l) => l.desvio))
    // enchimento (tudo igual) e preto cortado em zero não servem: não dá para medir ruído neles
    if (!(desvioRef > 0) || mediana(miolo.map((l) => l.zeros)) > 0.01) continue
    // e o preto medido tem de conversar com o declarado: senão a faixa é outra coisa (calibração, cópia da imagem)
    if (Math.abs(ref - pretoDeclarado) > Math.max(8, 0.01 * faixaDeclarada)) continue
    const tolerancia = Math.max(2, ref * 0.01)
    let k = 2
    while (k < m.esp && Math.abs(linhas[k].media - ref) <= tolerancia && linhas[k].desvio <= 3 * desvioRef + 1) k++
    const usadas = k - 4 // linhas 2 a k − 3: fora as duas da borda do sensor e as duas que encostam na imagem
    if (usadas < 4) continue
    const comprimento = m.vertical ? area.altura - 16 : area.largura - 16
    if (!melhor || usadas * comprimento > melhor.usadas * melhor.comprimento) melhor = { ...m, usadas, comprimento, de: 2, ate: k - 3 }
  }
  if (!melhor) return null
  const a = melhor.pos(melhor.de)
  const b = melhor.pos(melhor.ate)
  return melhor.vertical
    ? { margem: melhor.nome, x: Math.min(a, b), y: area.y + 8, largura: melhor.usadas, altura: area.altura - 16 }
    : { margem: melhor.nome, x: area.x + 8, y: Math.min(a, b), largura: area.largura - 16, altura: melhor.usadas }
}

/** Preto por cor e ruído de leitura no retângulo mascarado (desvio com corte em 4σ contra pixel quente). */
function medirMascarados(n, r) {
  const { dados, largura } = n.sensor
  const lado = n.cfa.lado
  let passoY = Math.max(1, Math.floor((r.largura * r.altura) / 150000)) // ~150 mil pixels bastam
  while (passoY % 2 === 0 || passoY % 3 === 0) passoY++ // sem casar com o período do mosaico (2 ou 6): toda fase entra
  // uma estatística por posição do mosaico: cada uma tem o seu preto (a 30D tem um verde em 128 e o outro em 127)
  const fases = lado * lado
  const soma = new Float64Array(fases)
  const soma2 = new Float64Array(fases)
  const conta = new Float64Array(fases)
  const media = new Float64Array(fases)
  const fx = new Uint8Array(r.largura)
  for (let i = 0; i < r.largura; i++) fx[i] = mod(r.x + i - n.area.x, lado)
  const medir = (raio) => {
    soma.fill(0)
    soma2.fill(0)
    conta.fill(0)
    for (let y = r.y; y < r.y + r.altura; y += passoY) {
      const fy = mod(y - n.area.y, lado) * lado
      const linha = y * largura + r.x
      for (let i = 0; i < r.largura; i++) {
        const k = fy + fx[i]
        const v = dados[linha + i]
        if (raio > 0 && Math.abs(v - media[k]) > raio) continue
        soma[k] += v
        soma2[k] += v * v
        conta[k]++
      }
    }
    let variancia = 0
    let total = 0
    for (let k = 0; k < fases; k++) {
      if (!conta[k]) continue
      media[k] = soma[k] / conta[k]
      variancia += soma2[k] - conta[k] * media[k] * media[k]
      total += conta[k]
    }
    return { desvio: Math.sqrt(Math.max(0, variancia / Math.max(1, total - fases))), total }
  }
  let m = medir(0)
  m = medir(4 * m.desvio + 1)
  const preto = [0, 0, 0]
  const vezes = [0, 0, 0]
  for (let k = 0; k < fases; k++) {
    if (!conta[k]) continue
    preto[n.cfa.padrao[k]] += media[k]
    vezes[n.cfa.padrao[k]]++
  }
  return { preto: preto.map((v, k) => (vezes[k] ? v / vezes[k] : NaN)), leitura: m.desvio, amostras: m.total }
}

// ------------------------------------------------------------------------------------------------- histograma

/** Valor do histograma `h` em que a soma acumulada chega à fração `q` de `total`. */
function percentil(h, total, q) {
  const alvo = q * total
  let soma = 0
  for (let i = 0; i < h.length; i++) {
    soma += h[i]
    if (soma >= alvo) return i
  }
  return h.length - 1
}

/**
 * Empilhamento no topo do histograma de um canal: o sinal de que o sensor (ou o conversor) corta ali.
 * Critério: os 4 últimos níveis com dado (ignorando pixels quentes isolados acima) guardam mais de 0,01 % do canal,
 * com densidade mais de 10× a da faixa 97–98,5 % desse nível e mais de 4× a dos 8 níveis logo abaixo. Uma área clara
 * sem corte não passa: o ruído de fótons espalha o topo por dezenas de níveis.
 * Devolve { nivel, fracao } ou null.
 */
function empilhamento(h, total, preto) {
  if (total < 1000) return null
  // topo: ignora até 0,002 % de pixels soltos acima (quentes ou defeituosos)
  const solto = Math.max(1, Math.floor(total * 2e-5))
  let acima = 0
  let topo = h.length - 1
  while (topo > 0 && acima + h[topo] <= solto) acima += h[topo--]
  if (topo < 16 || topo - preto < 64) return null
  let pico = 0
  let nivel = topo
  for (let i = topo; i > topo - 4; i--) {
    pico += h[i]
    if (h[i] > h[nivel]) nivel = i
  }
  const de = Math.round(topo * 0.97)
  const ate = Math.max(de + 1, Math.round(topo * 0.985))
  let longe = 0
  for (let i = de; i < ate; i++) longe += h[i]
  let perto = 0
  for (let i = topo - 12; i < topo - 4; i++) perto += h[i]
  const densidadeLonge = (longe / (ate - de)) * 4 + 1
  const densidadePerto = (perto / 8) * 4 + 1
  if (pico / total > 1e-4 && pico / densidadeLonge > 10 && pico / densidadePerto > 4) return { nivel, fracao: (pico + acima) / total }
  return null
}

// ----------------------------------------------------------------------------------------------------- ruído

/** Desvio robusto de uma diferença inteira a partir do histograma dela: MAD e depois variância aparada em ±3σ. */
function desvioDaDiferenca(h, base, total) {
  // mediana
  let soma = 0
  let med = 0
  for (let i = 0; i < LARGURA_DIF; i++) {
    soma += h[base + i]
    if (soma >= total / 2) {
      med = i
      break
    }
  }
  // MAD com interpolação dentro do nível (a diferença é inteira; com ruído de 1 DN a mediana crua só vale 0 ou 1)
  let dentro = h[base + med]
  let raio = 0
  let anterior = 0
  while (dentro < total / 2 && raio < LARGURA_DIF) {
    raio++
    anterior = dentro
    dentro += (med - raio >= 0 ? h[base + med - raio] : 0) + (med + raio < LARGURA_DIF ? h[base + med + raio] : 0)
  }
  const fracao = dentro > anterior ? (total / 2 - anterior) / (dentro - anterior) : 0
  let sigma = Math.max(0.3, 1.4826 * (raio === 0 ? 0.5 * (total / 2 / Math.max(1, dentro)) : raio - 0.5 + fracao))
  // variância aparada em ±3σ, duas voltas; 0,9733 é a fração da variância de uma normal dentro de ±3σ
  for (let volta = 0; volta < 2; volta++) {
    const alcance = Math.max(1, Math.ceil(3 * sigma))
    let s = 0
    let s2 = 0
    let k = 0
    for (let d = -alcance; d <= alcance; d++) {
      const i = med + d
      if (i < 0 || i >= LARGURA_DIF) continue
      const c = h[base + i]
      s += c * d
      s2 += c * d * d
      k += c
    }
    if (k < 2) break
    const media = s / k
    sigma = Math.sqrt(Math.max(0.01, (s2 / k - media * media) / 0.9733))
  }
  return sigma
}

/** Mínimos quadrados ponderados de var = a·S + b, com peso 1/var² (as sombras não somem atrás das altas). */
function ajustar(pontos) {
  let sw = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const p of pontos) {
    const w = 1 / (p.variancia * p.variancia + 1e-9)
    sw += w
    sx += w * p.sinal
    sy += w * p.variancia
    sxx += w * p.sinal * p.sinal
    sxy += w * p.sinal * p.variancia
  }
  const det = sw * sxx - sx * sx
  if (!(det > 0)) return null
  const a = (sw * sxy - sx * sy) / det
  return { a, b: (sy - a * sx) / sw }
}

/** Sinal (DN acima do preto) em que SNR = k no modelo var = a·S + σ²: raiz positiva de S² − k²a·S − k²σ² = 0. */
const sinalComSnr = (k, a, sigma) => (k * k * a + Math.sqrt(k ** 4 * a * a + 4 * k * k * sigma * sigma)) / 2

// ------------------------------------------------------------------------------------------------------ medida

/**
 * Negativo → Latitude (contrato em docs/ARQUITETURA.md). Campos numéricos que não puderam ser medidos saem `null`.
 * Além do contrato, devolve `detalhe` (de onde veio cada número, para a tela de diagnóstico e os testes).
 */
export function medirLatitude(negativo, { amostra = SENSELS_NA_AMOSTRA } = {}) {
  const n = negativo
  const { dados, largura } = n.sensor
  const { area, cfa } = n
  const lado = cfa.lado
  const bloco = lado === 2 ? 2 : 3 // X-Trans: blocos de 3×3 (cada um tem as três cores)

  // preto declarado por cor (média do padrão repetido) e faixa declarada
  const pretoDeclarado = [0, 0, 0]
  const vezes = [0, 0, 0]
  const centroY = area.y + (Math.floor(area.altura / 2 / 12) * 12 || 0)
  const centroX = area.x + (Math.floor(area.largura / 2 / 12) * 12 || 0)
  for (let l = 0; l < 12 && centroY + l < area.y + area.altura; l++) {
    for (let c = 0; c < 12 && centroX + c < area.x + area.largura; c++) {
      const k = corEm(n, centroY + l, centroX + c)
      pretoDeclarado[k] += pretoEm(n, centroY + l, centroX + c)
      vezes[k]++
    }
  }
  for (let k = 0; k < 3; k++) pretoDeclarado[k] = vezes[k] ? pretoDeclarado[k] / vezes[k] : n.preto.porCanal[k]
  const brancoDeclarado = n.branco.declarado

  // ---- preto: mascarados validados, ou o declarado
  const retangulo = acharMascarados(n, pretoDeclarado[G], brancoDeclarado[G] - pretoDeclarado[G])
  const mascarados = retangulo ? medirMascarados(n, retangulo) : null
  const temMascarados = !!mascarados && mascarados.amostras >= 2000 && mascarados.preto.every(Number.isFinite) && mascarados.leitura > 0
  const preto = temMascarados ? mascarados.preto : pretoDeclarado

  // ---- amostra: blocos inteiros do mosaico, pulando linhas de bloco
  const blocosX = Math.floor(area.largura / bloco)
  const blocosY = Math.floor(area.altura / bloco)
  const salto = Math.max(1, Math.round((blocosX * blocosY * bloco * bloco) / amostra))
  const larguraUtil = blocosX * bloco
  // cor de cada coluna, para cada fase de linha do mosaico
  const cores = []
  for (let f = 0; f < lado; f++) {
    const cc = new Uint8Array(larguraUtil)
    for (let x = 0; x < larguraUtil; x++) cc[x] = cfa.padrao[f * lado + (x % lado)]
    cores.push(cc)
  }

  // ---- passada 1: histograma por cor
  const hist = new Uint32Array(3 * 65536)
  for (let by = 0; by < blocosY; by += salto) {
    for (let j = 0; j < bloco; j++) {
      const y = by * bloco + j
      const cc = cores[y % lado]
      const linha = (area.y + y) * largura + area.x
      for (let x = 0; x < larguraUtil; x++) hist[(cc[x] << 16) | dados[linha + x]]++
    }
  }
  const h = [0, 1, 2].map((k) => hist.subarray(k << 16, (k + 1) << 16))
  const total = h.map((hk) => {
    let s = 0
    for (let i = 0; i < 65536; i++) s += hk[i]
    return s
  })

  // ---- branco efetivo por canal
  const pilha = h.map((hk, k) => empilhamento(hk, total[k], preto[k]))
  const branco = [0, 1, 2].map((k) => (pilha[k] ? Math.min(brancoDeclarado[k], pilha[k].nivel) : brancoDeclarado[k]))
  const faixa = branco.map((w, k) => w - preto[k])
  const limite = faixa.map((f, k) => preto[k] + CORTE * f)

  // ---- passada 2: canais cortados por bloco e diferença entre verdes vizinhos por faixa de sinal
  const faixaDe = new Uint8Array(65536) // nível médio do par (DN) → faixa de sinal
  for (let v = 0; v < 65536; v++) {
    const s = v - preto[G]
    faixaDe[v] = s < 1 ? 0 : Math.min(FAIXAS - 1, 1 + Math.floor(log2(s) * 3))
  }
  const dif = new Uint32Array(FAIXAS * LARGURA_DIF)
  const somaSinal = new Float64Array(FAIXAS)
  const pares = new Float64Array(FAIXAS)
  const cortados = [0, 0, 0, 0]
  const lim0 = limite[0]
  const lim1 = limite[1]
  const lim2 = limite[2]
  const limG = limite[G]
  let blocos = 0
  if (lado === 2) {
    const k00 = cfa.padrao[0]
    const k01 = cfa.padrao[1]
    const k10 = cfa.padrao[2]
    const k11 = cfa.padrao[3]
    const l00 = limite[k00]
    const l01 = limite[k01]
    const l10 = limite[k10]
    const l11 = limite[k11]
    const verdeEm00 = k00 === G // os dois verdes ficam numa diagonal: (0,0)-(1,1) ou (0,1)-(1,0)
    const bits = new Uint8Array([0, 1, 1, 2, 1, 2, 2, 3])
    for (let by = 0; by < blocosY; by += salto) {
      const r0 = (area.y + by * 2) * largura + area.x
      const r1 = r0 + largura
      for (let x = 0; x < larguraUtil; x += 2) {
        const v00 = dados[r0 + x]
        const v01 = dados[r0 + x + 1]
        const v10 = dados[r1 + x]
        const v11 = dados[r1 + x + 1]
        const m = (v00 >= l00 ? 1 << k00 : 0) | (v01 >= l01 ? 1 << k01 : 0) | (v10 >= l10 ? 1 << k10 : 0) | (v11 >= l11 ? 1 << k11 : 0)
        cortados[bits[m]]++
        const a = verdeEm00 ? v00 : v01
        const b = verdeEm00 ? v11 : v10
        if (a < limG && b < limG) {
          const f = faixaDe[(a + b) >> 1]
          let d = a - b + MEIA_DIFERENCA
          if (d < 0) d = 0
          else if (d >= LARGURA_DIF) d = LARGURA_DIF - 1
          dif[f * LARGURA_DIF + d]++
          somaSinal[f] += a + b
          pares[f]++
        }
      }
      blocos += larguraUtil >> 1
    }
  } else {
    const lims = [lim0, lim1, lim2]
    for (let by = 0; by < blocosY; by += salto) {
      const y = by * 3
      const linhas = [0, 1, 2].map((j) => (area.y + y + j) * largura + area.x)
      const cs = [0, 1, 2].map((j) => cores[(y + j) % lado])
      for (let x = 0; x < larguraUtil; x += 3) {
        let m = 0
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const k = cs[j][x + i]
            if (dados[linhas[j] + x + i] >= lims[k]) m |= 1 << k
          }
        }
        cortados[(m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1)]++
      }
      blocos += blocosX
      // verdes vizinhos na mesma linha (no X-Trans eles andam aos pares)
      for (let j = 0; j < 3; j++) {
        const cc = cs[j]
        const linha = linhas[j]
        for (let x = 0; x + 1 < larguraUtil; x++) {
          if (cc[x] !== G || cc[x + 1] !== G) continue
          const a = dados[linha + x]
          const b = dados[linha + x + 1]
          x++
          if (a >= limG || b >= limG) continue
          const f = faixaDe[(a + b) >> 1]
          let d = a - b + MEIA_DIFERENCA
          if (d < 0) d = 0
          else if (d >= LARGURA_DIF) d = LARGURA_DIF - 1
          dif[f * LARGURA_DIF + d]++
          somaSinal[f] += a + b
          pares[f]++
        }
      }
    }
  }

  // ---- ajuste do ruído
  const pontos = []
  for (let f = 0; f < FAIXAS; f++) {
    if (pares[f] < PARES_POR_FAIXA) continue
    const sinal = somaSinal[f] / pares[f] / 2 - preto[G]
    if (sinal > 0.9 * CORTE * faixa[G]) continue // encostada no corte: a distribuição está aparada, o desvio mente
    const sigma = desvioDaDiferenca(dif, f * LARGURA_DIF, pares[f]) / Math.SQRT2 // a diferença soma o ruído dos dois
    pontos.push({ sinal, variancia: sigma * sigma, pares: pares[f] })
  }
  let ajuste = null
  if (pontos.length >= 3) {
    const sinais = pontos.map((p) => Math.max(p.sinal, 1))
    const stops = log2(Math.max(...sinais) / Math.min(...sinais))
    const reta = ajustar(pontos)
    if (reta && reta.a > 0 && stops >= 2) {
      const menor = Math.min(...pontos.map((p) => p.variancia))
      // `apoio`: quanto da variância da faixa mais escura é ruído de leitura. Perto de 0, a leitura é extrapolação
      ajuste = { ganho: reta.a, leitura: reta.b > 0 ? Math.sqrt(reta.b) : null, faixas: pontos.length, stops, apoio: reta.b > 0 ? reta.b / menor : 0 }
      // sem termo constante positivo, o menor ruído visto no arquivo é um TETO para o ruído de leitura
      if (ajuste.leitura === null) ajuste.teto = Math.sqrt(Math.min(...pontos.map((p) => p.variancia)))
    }
  }

  // ---- modelo de ruído: perfil do arquivo > mascarados + ajuste > ajuste > nada
  let ruido = { leitura: null, ganho: null, origem: 'declarado' }
  const perfil = n.perfilRuido && n.perfilRuido[G]
  const faixaDoPerfil = brancoDeclarado[G] - pretoDeclarado[G] // o NoiseProfile vale no sinal normalizado pelo branco declarado
  if (perfil && perfil.escala > 0 && perfil.deslocamento >= 0) {
    ruido = { leitura: Math.sqrt(perfil.deslocamento) * faixaDoPerfil, ganho: perfil.escala * faixaDoPerfil, origem: 'perfil' }
  } else if (temMascarados) {
    ruido = { leitura: mascarados.leitura, ganho: ajuste ? ajuste.ganho : null, origem: 'mascarados' }
  } else if (ajuste) {
    ruido = { leitura: ajuste.leitura ?? ajuste.teto, ganho: ajuste.ganho, origem: 'ajuste' }
  }

  // ---- faixa dinâmica e margens (o verde como referência de luminância)
  const temRuido = ruido.leitura > 0
  const s10 = temRuido && ruido.ganho > 0 ? sinalComSnr(10, ruido.ganho, ruido.leitura) : null
  const p999 = h.map((hk, k) => percentil(hk, total[k], 0.999) - preto[k])
  const p001 = Math.max(percentil(h[G], total[G], 0.001) - preto[G], 0.5)
  const exposicaoBase = n.exposicaoBase || 0
  const latitude = {
    preto,
    branco,
    ruido,
    faixa: {
      engenharia: temRuido ? log2(faixa[G] / ruido.leitura) : null,
      fotografica: s10 ? log2(faixa[G] / s10) : null
    },
    margem: {
      altas: p999.map((p, k) => Math.max(0, log2(faixa[k] / Math.max(p, 1)))),
      sombras: temRuido ? Math.max(0, log2(p001 / ruido.leitura)) : null,
      acimaDoCinza: log2(1 / CINZA) + exposicaoBase,
      abaixoDoCinza: temRuido ? log2((CINZA * faixa[G]) / ruido.leitura) - exposicaoBase : null
    },
    cortado: { um: cortados[1] / Math.max(1, blocos), dois: cortados[2] / Math.max(1, blocos), tres: cortados[3] / Math.max(1, blocos) },
    confianca: 'baixa'
  }

  // ---- confiança
  //   alta   ruído de leitura medido nos mascarados, ou perfil do fabricante que o ajuste confirma (ganho a até 2×)
  //   media  só o ajuste, com a leitura apoiada no dado (pelo menos um quarto da variância da faixa mais escura),
  //          ou perfil que o ajuste não confirma
  //   baixa  leitura extrapolada (a foto não tem sombra funda), ajuste que não fechou (leitura é um teto) ou nada medido
  if (ruido.origem === 'mascarados' && ruido.ganho > 0) latitude.confianca = 'alta'
  else if (ruido.origem === 'perfil') latitude.confianca = ajuste && ajuste.ganho / ruido.ganho > 0.5 && ajuste.ganho / ruido.ganho < 2 ? 'alta' : 'media'
  else if (ruido.origem === 'mascarados') latitude.confianca = 'media'
  else if (ruido.origem === 'ajuste' && ajuste.leitura !== null && ajuste.apoio >= 0.25) latitude.confianca = 'media'

  latitude.detalhe = {
    pretoDeclarado,
    brancoDeclarado: [...brancoDeclarado],
    mascarados: temMascarados ? { ...retangulo, leitura: mascarados.leitura, amostras: mascarados.amostras } : null,
    empilhamento: pilha,
    ajuste,
    amostra: { salto, blocos, sensels: blocos * bloco * bloco },
    percentis: { p999, p001 }
  }
  return latitude
}

// ------------------------------------------------------------------------------------------------------ resumo

const ev = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pct = (v) => (v >= 0.1 ? Math.round(v * 100) : v >= 0.01 ? Math.round(v * 1000) / 10 : Math.round(v * 10000) / 100).toLocaleString('pt-BR')

/**
 * Frases curtas para a tela, só com o que foi medido. Exemplos: '+1,1 EV até estourar', '5,6 EV de sombra limpa',
 * '14,0 EV de faixa no sensor', 'Altas luzes: 3 % da área perdeu um canal (recuperável)'.
 */
export function resumoLatitude(latitude) {
  const l = latitude
  const frases = []
  const estouro = l.cortado.um + l.cortado.dois + l.cortado.tres
  const altas = Math.min(...l.margem.altas)
  if (estouro < 0.0005) frases.push(`+${ev(altas)} EV até estourar`)
  else {
    const recuperavel = l.cortado.um + l.cortado.dois
    if (l.cortado.tres >= 0.0005) frases.push(`Altas luzes: ${pct(l.cortado.tres)} % da área estourou de vez`)
    if (recuperavel >= 0.0005) frases.push(`Altas luzes: ${pct(recuperavel)} % da área perdeu ${l.cortado.dois > l.cortado.um ? 'dois canais' : 'um canal'} (recuperável)`)
  }
  if (l.margem.sombras !== null) frases.push(l.margem.sombras >= 0.05 ? `${ev(l.margem.sombras)} EV de sombra limpa` : 'Sombras já no ruído')
  if (l.faixa.engenharia !== null) {
    frases.push(`${ev(l.faixa.engenharia)} EV de faixa no sensor${l.faixa.fotografica !== null ? ` (${ev(l.faixa.fotografica)} com pouco ruído)` : ''}`)
  }
  if (l.confianca === 'baixa') frases.push(l.ruido.leitura === null ? 'Ruído não medido neste arquivo' : 'Medida aproximada: o ruído deste arquivo não fechou no modelo')
  return frases
}

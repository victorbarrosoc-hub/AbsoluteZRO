// O que precisa de vizinhança no motor Latitude: ruído, neblina, clareza, textura, nitidez, grão e vinheta. Tudo em
// Float32, com filtros separáveis de custo O(n) (caixa por soma corrente, mínimo por caixa de van Herk), e tudo com
// tamanho proporcional à foto: os raios são frações do lado maior da imagem CHEIA vezes `escala` (pixels deste bloco
// por pixel da imagem cheia), para a prévia reduzida parecer com a exportação.
//
// Um "bloco" é um pedaço da foto já na geometria de saída:
//   { largura, altura, dados: Float32Array (RGB, cena), x0, y0 (onde o bloco fica no quadro), quadro: { largura,
//     altura } (a foto inteira nesta escala), escala }
// `revelar` passa blocos com margem (ver `margemLocal`), de modo que o resultado no miolo é o mesmo da foto inteira.
//
// Fontes:
// - Filtro guiado: He, Sun e Tang (2013), "Guided image filtering", IEEE TPAMI 35(6). Preserva borda sem inverter
//   gradiente; é a base de clareza, textura, ruído e do refino da neblina.
// - Neblina: He, Sun e Tang (2011), "Single image haze removal using dark channel prior", IEEE TPAMI 33(12).
// - Ruído: transformada de Anscombe generalizada para ruído de Poisson + Gauss (Starck, Murtagh e Bijaoui, 1998,
//   "Image Processing and Data Analysis"; Mäkitalo e Foi, 2013, IEEE TIP 22(1)), com o ganho e a leitura medidos no
//   arquivo. Estimativa sem modelo: desvio absoluto mediano (Donoho e Johnstone, 1994).
// - Mínimo em janela: van Herk (1992), Gil e Werman (1993).
//
// Clareza, textura e nitidez mexem no log2 da norma do pixel (a mesma norma do mapa de tons) e devolvem o resultado
// como ganho nos três canais: o matiz não muda, e o mesmo ajuste dá o mesmo efeito na sombra e na alta luz.

import { luminancia } from './cor/espacos.js'
import { CINZA, PESO_MAXIMO } from './tela.js'

const EPS = CINZA * 2 ** -16
const Y2020 = luminancia('rec2020')

// As escalas (frações do lado maior da imagem cheia) e as forças em ±100. Escolhas de aparência, documentadas aqui.
export const LOCAL = {
  textura: { raio: 0.0006, limiarEv: 0.2, ganho: 0.8 },
  clareza: { raio: 0.012, limiarEv: 0.5, ganho: 0.8 },
  neblina: { raio: 0.006, omega: 0.9, tMin: 0.1, veu: 0.5 },
  ruido: { raioLuz: 0.0005, raioCor: 0.0016, limiarLuz: 2.5, limiarCor: 4 },
  // nitidez: k = 2,5 em 150; o desvio é limitado (tanh) a `limite` EV, que cresce com `detalhe`; a máscara corta onde
  // a variação local é menor que mascara/100 · 0,25 EV
  nitidez: { ganho: 2.5, limiteMin: 0.03, limiteMax: 0.4, mascaraEv: 0.25 },
  // grão: desvio de 0,3 EV em 100; célula de 0,8 a 4 px numa foto de 4000 px de lado maior
  grao: { ev: 0.3, celulaMin: 0.8, celulaMax: 4, ladoRef: 4000 },
  vinheta: { ev: 2 },
}

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// ─────────── filtros ───────────

/** Média em janela quadrada de raio `r` (lado 2r + 1), separável, O(n). Na beirada a janela encolhe. */
export function caixa(origem, w, h, r, destino = new Float64Array(w * h)) {
  if (r < 1) {
    destino.set(origem)
    return destino
  }
  const temp = new Float64Array(w * h)
  // horizontal
  for (let y = 0; y < h; y++) {
    const l = y * w
    let soma = 0
    const ate = Math.min(r, w - 1)
    for (let x = 0; x <= ate; x++) soma += origem[l + x]
    let conta = ate + 1
    for (let x = 0; x < w; x++) {
      temp[l + x] = soma / conta
      const entra = x + r + 1
      const sai = x - r
      if (entra < w) {
        soma += origem[l + entra]
        conta++
      }
      if (sai >= 0) {
        soma -= origem[l + sai]
        conta--
      }
    }
  }
  // vertical, com a soma corrente de cada coluna
  const soma = new Float64Array(w)
  const ate = Math.min(r, h - 1)
  for (let y = 0; y <= ate; y++) {
    const l = y * w
    for (let x = 0; x < w; x++) soma[x] += temp[l + x]
  }
  let conta = ate + 1
  for (let y = 0; y < h; y++) {
    const l = y * w
    const inv = 1 / conta
    for (let x = 0; x < w; x++) destino[l + x] = soma[x] * inv
    const entra = y + r + 1
    const sai = y - r
    if (entra < h) {
      const le = entra * w
      for (let x = 0; x < w; x++) soma[x] += temp[le + x]
      conta++
    }
    if (sai >= 0) {
      const ls = sai * w
      for (let x = 0; x < w; x++) soma[x] -= temp[ls + x]
      conta--
    }
  }
  return destino
}

/**
 * Filtro guiado. `guia` e `p` são planos w×h; devolve q = média(a)·guia + média(b), com a = cov(guia, p)/(var(guia) +
 * eps) e b = média(p) − a·média(guia). Com `p` igual a `guia` é o alisamento que respeita borda: onde a variância da
 * janela é muito maior que eps a imagem passa igual; onde é menor, vira a média. `borda` (opcional, Float32Array)
 * recebe a média de a.
 */
export function filtroGuiado(guia, p, w, h, r, eps, borda = null) {
  const n = w * h
  const mesmo = guia === p
  const mI = caixa(guia, w, h, r)
  const prod = new Float64Array(n)
  for (let i = 0; i < n; i++) prod[i] = guia[i] * guia[i]
  const mII = caixa(prod, w, h, r)
  let mP = mI
  let mIP = mII
  if (!mesmo) {
    mP = caixa(p, w, h, r)
    for (let i = 0; i < n; i++) prod[i] = guia[i] * p[i]
    mIP = caixa(prod, w, h, r)
  }
  const a = prod
  const b = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = mII[i] - mI[i] * mI[i]
    const c = mIP[i] - mI[i] * mP[i]
    const ai = c / ((v > 0 ? v : 0) + eps)
    a[i] = ai
    b[i] = mP[i] - ai * mI[i]
  }
  const mA = caixa(a, w, h, r, mII)
  const mB = caixa(b, w, h, r, mI)
  const q = new Float32Array(n)
  for (let i = 0; i < n; i++) q[i] = mA[i] * guia[i] + mB[i]
  // quanto da janela é borda (0 = superfície lisa, 1 = borda forte), para quem quiser pesar o detalhe
  if (borda) for (let i = 0; i < n; i++) borda[i] = mA[i]
  return q
}

// Mínimo em janela de raio r, separável (van Herk / Gil-Werman): três comparações por pixel, qualquer raio.
function minimoEmLinha(origem, destino, inicio, passo, n, r, g, hh) {
  const k = 2 * r + 1
  // g: mínimo acumulado dentro de cada bloco de k, da esquerda; hh: da direita. Com r de folga (infinito) nas pontas.
  const total = n + 2 * r
  const valor = (j) => (j < r || j >= n + r ? Infinity : origem[inicio + (j - r) * passo])
  for (let j = 0; j < total; j++) g[j] = j % k === 0 ? valor(j) : Math.min(g[j - 1], valor(j))
  for (let j = total - 1; j >= 0; j--) hh[j] = j === total - 1 || (j + 1) % k === 0 ? valor(j) : Math.min(hh[j + 1], valor(j))
  for (let x = 0; x < n; x++) destino[inicio + x * passo] = Math.min(hh[x], g[x + 2 * r])
}

export function minimo(origem, w, h, r) {
  if (r < 1) return Float32Array.from(origem)
  const temp = new Float32Array(w * h)
  const saida = new Float32Array(w * h)
  const maior = Math.max(w, h) + 2 * r
  const g = new Float32Array(maior)
  const hh = new Float32Array(maior)
  for (let y = 0; y < h; y++) minimoEmLinha(origem, temp, y * w, 1, w, r, g, hh)
  for (let x = 0; x < w; x++) minimoEmLinha(temp, saida, x, w, h, r, g, hh)
  return saida
}

/** Desfoque gaussiano separável de desvio `sigma` (núcleo exato até 3σ, normalizado; na beirada repete a borda). */
export function gaussiano(origem, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float64Array(r + 1)
  let soma = 0
  for (let i = 0; i <= r; i++) {
    k[i] = Math.exp((-i * i) / (2 * sigma * sigma))
    soma += i ? 2 * k[i] : k[i]
  }
  for (let i = 0; i <= r; i++) k[i] /= soma
  const temp = new Float32Array(w * h)
  const saida = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const l = y * w
    for (let x = 0; x < w; x++) {
      let s = k[0] * origem[l + x]
      for (let i = 1; i <= r; i++) s += k[i] * (origem[l + (x - i < 0 ? 0 : x - i)] + origem[l + (x + i >= w ? w - 1 : x + i)])
      temp[l + x] = s
    }
  }
  for (let y = 0; y < h; y++) {
    const l = y * w
    for (let x = 0; x < w; x++) {
      let s = k[0] * temp[l + x]
      for (let i = 1; i <= r; i++) s += k[i] * (temp[(y - i < 0 ? 0 : y - i) * w + x] + temp[(y + i >= h ? h - 1 : y + i) * w + x])
      saida[l + x] = s
    }
  }
  return saida
}

// ─────────── planos de apoio ───────────

// log2 da norma de cada pixel (a mesma norma da tela: 75% luminância, 25% maior canal), com piso em EPS
function planoDeLuz(dados, n) {
  const p = new Float32Array(n)
  const w0 = Y2020[0] * (1 - PESO_MAXIMO)
  const w1 = Y2020[1] * (1 - PESO_MAXIMO)
  const w2 = Y2020[2] * (1 - PESO_MAXIMO)
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const r = dados[o]
    const g = dados[o + 1]
    const b = dados[o + 2]
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b
    const v = w0 * r + w1 * g + w2 * b + PESO_MAXIMO * mx
    p[i] = Math.log2(v > EPS ? v : EPS)
  }
  return p
}

// aplica a diferença de luz (novo − antigo, em EV) como ganho nos três canais
function aplicarGanhoEv(dados, n, antigo, novo) {
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const d = novo[i] - antigo[i]
    if (d === 0) continue
    const g = 2 ** d
    dados[o] *= g
    dados[o + 1] *= g
    dados[o + 2] *= g
  }
}

const raioEmPixels = (fracao, bloco) => Math.round(fracao * ladoCheio(bloco) * bloco.escala)
const ladoCheio = (bloco) => Math.max(bloco.quadro.largura, bloco.quadro.altura) / bloco.escala

// ─────────── clareza e textura ───────────

/**
 * Contraste local em duas escalas, no log2 da norma:
 *   L' = L + t·(1 − a_fino)²·(L − guiado_fino(L)) + c·(1 − a_largo)²·(L − guiado_largo(L))
 * O filtro guiado deixa a borda forte na base (variação acima do limiar da escala), e o que ainda sobra de detalhe
 * junto dela é pesado por (1 − a)², com a a média do coeficiente do filtro (perto de 1 na borda, 0 na superfície):
 * o que é amplificado é o relevo dentro das superfícies, e a borda não ganha halo. `textura` e `clareza` em −100..100.
 */
export function contrasteLocal(bloco, { textura = 0, clareza = 0 } = {}) {
  if (!textura && !clareza) return bloco
  const { largura: w, altura: h, dados } = bloco
  const n = w * h
  const L = planoDeLuz(dados, n)
  const novo = Float32Array.from(L)
  const borda = new Float32Array(n)
  for (const [valor, cfg] of [
    [textura, LOCAL.textura],
    [clareza, LOCAL.clareza],
  ]) {
    if (!valor) continue
    const r = raioEmPixels(cfg.raio, bloco)
    if (r < 1) continue // nesta escala o detalhe é menor que um pixel: não há o que realçar (nem na exportação reduzida)
    const base = filtroGuiado(L, L, w, h, r, cfg.limiarEv * cfg.limiarEv, borda)
    const k = (valor / 100) * cfg.ganho
    for (let i = 0; i < n; i++) {
      const liso = 1 - borda[i]
      novo[i] += k * liso * liso * (L[i] - base[i])
    }
  }
  aplicarGanhoEv(dados, n, L, novo)
  return bloco
}

// ─────────── neblina ───────────

/**
 * A luz do ar (a cor da neblina) de uma imagem: a média das cores do 0,1% de pixels com o canal escuro mais alto.
 * `revelar` mede isto uma vez, numa versão reduzida da foto inteira, e passa para todos os blocos.
 */
export function luzDoAr(imagem) {
  const { largura: w, altura: h, dados } = imagem
  const n = w * h
  const escuro = new Float32Array(n)
  for (let i = 0, o = 0; i < n; i++, o += 3) escuro[i] = Math.min(dados[o], dados[o + 1], dados[o + 2])
  const r = Math.max(1, Math.round(LOCAL.neblina.raio * Math.max(w, h)))
  const canal = minimo(escuro, w, h, r)
  const ordem = Float32Array.from(canal).sort()
  const corte = ordem[Math.min(n - 1, Math.floor(n * 0.999))]
  const soma = [0, 0, 0]
  let conta = 0
  for (let i = 0; i < n; i++) {
    if (canal[i] < corte) continue
    soma[0] += dados[i * 3]
    soma[1] += dados[i * 3 + 1]
    soma[2] += dados[i * 3 + 2]
    conta++
  }
  const piso = 1e-4
  return [Math.max(piso, soma[0] / conta), Math.max(piso, soma[1] / conta), Math.max(piso, soma[2] / conta)]
}

/**
 * Tirar neblina (quantidade > 0) pelo canal escuro: t = 1 − ω·mín_janela(mín_canais(I/A)), refinado por filtro guiado
 * pela luz; J = (I − A)/máx(t, 0,1) + A. Quantidade negativa põe neblina: J = I·t + A·(1 − t), t = 1 − 0,5·|q|.
 */
export function tirarNeblina(bloco, { quantidade = 0, ar = null } = {}) {
  if (!quantidade) return bloco
  const { largura: w, altura: h, dados } = bloco
  const n = w * h
  const A = ar ?? luzDoAr(bloco)
  const q = quantidade / 100
  if (q < 0) {
    const t = 1 + q * LOCAL.neblina.veu
    for (let i = 0; i < n * 3; i += 3) {
      dados[i] = dados[i] * t + A[0] * (1 - t)
      dados[i + 1] = dados[i + 1] * t + A[1] * (1 - t)
      dados[i + 2] = dados[i + 2] * t + A[2] * (1 - t)
    }
    return bloco
  }
  const escuro = new Float32Array(n)
  const guia = new Float32Array(n)
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const m = Math.min(dados[o] / A[0], dados[o + 1] / A[1], dados[o + 2] / A[2])
    escuro[i] = m < 0 ? 0 : m > 1 ? 1 : m
    // guia em raiz quadrada da luz relativa ao ar: escala parecida com a do olho, limitada
    const y = (Y2020[0] * dados[o]) / A[0] + (Y2020[1] * dados[o + 1]) / A[1] + (Y2020[2] * dados[o + 2]) / A[2]
    guia[i] = Math.sqrt(y < 0 ? 0 : y > 4 ? 4 : y)
  }
  const r = Math.max(1, raioEmPixels(LOCAL.neblina.raio, bloco))
  const canal = minimo(escuro, w, h, r)
  const omega = LOCAL.neblina.omega * q
  for (let i = 0; i < n; i++) canal[i] = 1 - omega * canal[i]
  const t = filtroGuiado(guia, canal, w, h, r * 4, 1e-3)
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const ti = 1 / (t[i] > LOCAL.neblina.tMin ? (t[i] < 1 ? t[i] : 1) : LOCAL.neblina.tMin)
    dados[o] = (dados[o] - A[0]) * ti + A[0]
    dados[o + 1] = (dados[o + 1] - A[1]) * ti + A[1]
    dados[o + 2] = (dados[o + 2] - A[2]) * ti + A[2]
  }
  return bloco
}

// ─────────── ruído ───────────

/**
 * Ruído de uma imagem sem modelo (JPEG, PNG): mede o desvio no domínio da raiz quadrada (onde ruído proporcional ao
 * sinal fica constante) pelo desvio absoluto mediano da diferença de cada pixel para a média dos dois vizinhos da
 * linha, e devolve o modelo equivalente { a, b } (var = a·Y + b) com `origem: 'estimado'`.
 */
export function estimarRuido(imagem) {
  const { largura: w, altura: h, dados } = imagem
  const passo = Math.max(1, Math.floor(h / 256))
  const difs = []
  const t = (o) => 2 * Math.sqrt(Math.max(0, Y2020[0] * dados[o] + Y2020[1] * dados[o + 1] + Y2020[2] * dados[o + 2]))
  for (let y = 0; y < h; y += passo) {
    for (let x = 1; x < w - 1; x += 2) {
      const o = (y * w + x) * 3
      difs.push(Math.abs(t(o) - 0.5 * (t(o - 3) + t(o + 3))))
    }
  }
  if (difs.length < 16) return null
  difs.sort((p, q) => p - q)
  // var(d) = 1,5·σ² para ruído branco; 1,4826 leva o desvio absoluto mediano ao desvio padrão de uma gaussiana
  const sigma = (1.4826 * difs[difs.length >> 1]) / Math.sqrt(1.5)
  return { a: Math.max(sigma * sigma, 1e-8), b: 1e-10, origem: 'estimado' }
}

/**
 * Redução de ruído guiada pelo modelo do arquivo (`ruido`: var = a·Y + b na imagem de trabalho). Roda na BASE, antes
 * dos ajustes, porque é lá que o modelo vale.
 *
 * 1. Estabiliza a variância: t(v) = (2/a)·√(a·v + 3a²/8 + b) — depois disso o ruído tem desvio 1 em qualquer tom.
 * 2. Luz: filtro guiado de t(Y) por ele mesmo, com eps = (2,5·luz/100)²: o que varia menos que o ruído vira média, a
 *    borda fica.
 * 3. Cor: as diferenças t(R) − t(Y) e t(B) − t(Y) passam por filtro guiado pela luz já limpa, com raio maior e
 *    eps = (4·cor/100)²: mancha de cor some, a cor só muda onde a luz tem borda.
 * 4. Volta: v = (a/4)·t² − 3a/8 − b/a.
 */
export function reduzirRuido(bloco, { luz = 0, cor = 0, ruido = null } = {}) {
  if ((!luz && !cor) || !ruido) return bloco
  const { largura: w, altura: h, dados } = bloco
  const n = w * h
  const a = Math.max(ruido.a, 1e-12)
  const b = Math.max(ruido.b, 0)
  const c0 = (3 * a * a) / 8 + b
  const ida = (v) => (2 / a) * Math.sqrt(Math.max(a * v + c0, 0))
  const volta = (t) => (a / 4) * t * t - (3 * a) / 8 - b / a
  const tY = new Float32Array(n)
  const u = new Float32Array(n)
  const v = new Float32Array(n)
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const y = Y2020[0] * dados[o] + Y2020[1] * dados[o + 1] + Y2020[2] * dados[o + 2]
    tY[i] = ida(y)
    u[i] = ida(dados[o]) - tY[i]
    v[i] = ida(dados[o + 2]) - tY[i]
  }
  let limpo = tY
  if (luz) {
    const r = Math.max(1, raioEmPixels(LOCAL.ruido.raioLuz, bloco))
    const k = (LOCAL.ruido.limiarLuz * luz) / 100
    limpo = filtroGuiado(tY, tY, w, h, r, k * k)
  }
  let u2 = u
  let v2 = v
  if (cor) {
    const r = Math.max(1, raioEmPixels(LOCAL.ruido.raioCor, bloco))
    const k = (LOCAL.ruido.limiarCor * cor) / 100
    u2 = filtroGuiado(limpo, u, w, h, r, k * k)
    v2 = filtroGuiado(limpo, v, w, h, r, k * k)
  }
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const y = volta(limpo[i])
    const r = volta(limpo[i] + u2[i])
    const bl = volta(limpo[i] + v2[i])
    dados[o] = r
    dados[o + 1] = (y - Y2020[0] * r - Y2020[2] * bl) / Y2020[1]
    dados[o + 2] = bl
  }
  return bloco
}

// ─────────── nitidez ───────────

/** O ganho (k) e o limite de desvio (EV) que a nitidez usa: o halo numa borda nunca passa de k·limite EV. */
export function limitesDaNitidez({ nitidez = 0, detalhe = 25 } = {}) {
  const N = LOCAL.nitidez
  return { ganho: (nitidez / 150) * N.ganho, limite: N.limiteMin + (N.limiteMax - N.limiteMin) * (detalhe / 100) }
}

/**
 * Máscara de nitidez no log2 da norma: D = L − gauss(L, raio); L' = L + k·m·lim·tanh(D/lim).
 * `detalhe` abre o limite do desvio (pouco detalhe = só o fino, sem halo; muito = borda mais dura); `mascara` deixa a
 * nitidez só onde há borda (m = suave(0,5·e; 1,5·e; maior |D| da vizinhança), e = mascara/100 · 0,25 EV).
 */
export function nitidez(bloco, { nitidez: quantidade = 0, raio = 1, detalhe = 25, mascara = 0 } = {}) {
  if (!quantidade) return bloco
  const sigma = raio * bloco.escala
  if (sigma < 0.25) return bloco // menor que um quarto de pixel nesta escala: não se vê
  const { largura: w, altura: h, dados } = bloco
  const n = w * h
  const { ganho, limite } = limitesDaNitidez({ nitidez: quantidade, detalhe })
  const L = planoDeLuz(dados, n)
  const borrado = gaussiano(L, w, h, sigma)
  const novo = new Float32Array(n)
  let m = null
  if (mascara > 0) {
    // força da borda: o maior |D| da vizinhança (o mínimo de −|D|), para a borda inteira entrar e a textura não
    const forca = new Float32Array(n)
    for (let i = 0; i < n; i++) forca[i] = -Math.abs(L[i] - borrado[i])
    const maior = minimo(forca, w, h, Math.max(1, Math.round(2 * sigma)))
    const e = (mascara / 100) * LOCAL.nitidez.mascaraEv
    m = new Float32Array(n)
    for (let i = 0; i < n; i++) m[i] = suave(0.5 * e, 1.5 * e, -maior[i])
  }
  for (let i = 0; i < n; i++) {
    const d = limite * Math.tanh((L[i] - borrado[i]) / limite)
    novo[i] = L[i] + ganho * (m ? m[i] : 1) * d
  }
  aplicarGanhoEv(dados, n, L, novo)
  return bloco
}

// ─────────── grão ───────────

function hash(x, y, semente) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(semente, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return (h ^ (h >>> 15)) >>> 0
}

// valor da grade: quase gaussiano (soma de quatro uniformes de 8 bits), média 0, desvio 1
function daGrade(x, y, semente) {
  const h = hash(x, y, semente)
  return (((h & 255) + ((h >>> 8) & 255) + ((h >>> 16) & 255) + (h >>> 24)) / 255 - 2) * Math.sqrt(3)
}

/**
 * Campo de grão no ponto (X, Y) do quadro cheio (em pixels da imagem cheia): ruído de valor numa grade de célula
 * `celula`, interpolado em bilinear e normalizado para desvio 1, mais uma oitava três vezes mais larga
 * pesada pela aspereza. Só depende de (X, Y, semente): mesma foto, mesmo grão, em qualquer bloco e escala.
 */
export function campoDeGrao(X, Y, celula, aspereza, semente) {
  let soma = 0
  let peso = 0
  for (let oitava = 0; oitava < 2; oitava++) {
    const p = oitava ? aspereza : 1
    if (!p) continue
    const c = oitava ? celula * 3 : celula
    const fx = X / c
    const fy = Y / c
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const s = semente + oitava * 7919
    const v = (daGrade(ix, iy, s) * (1 - tx) + daGrade(ix + 1, iy, s) * tx) * (1 - ty) + (daGrade(ix, iy + 1, s) * (1 - tx) + daGrade(ix + 1, iy + 1, s) * tx) * ty
    // a soma ponderada de valores independentes tem variância Σ peso²: dividir pela raiz devolve o desvio 1 em
    // qualquer ponto da célula
    soma += (p * v) / Math.sqrt(((1 - tx) * (1 - tx) + tx * tx) * ((1 - ty) * (1 - ty) + ty * ty))
    peso += p * p
  }
  return soma / Math.sqrt(peso)
}

/**
 * Grão: v' = v·2^(q·z), com z o campo de grão e q = grao/100 · 0,3 EV. Multiplicativo na cena, como a granulação do
 * filme: aparece nos meios-tons e some no branco, que o mapa de tons comprime. `tamanho` e `aspereza` de 0 a 100.
 * Na prévia reduzida a célula encolhe junto e o desvio cai como cairia na média de vários grãos por pixel.
 */
export function grao(bloco, { grao: quantidade = 0, tamanho = 25, aspereza = 50, semente = 1 } = {}) {
  if (!quantidade) return bloco
  const { largura: w, altura: h, dados, x0 = 0, y0 = 0, escala } = bloco
  const G = LOCAL.grao
  // célula em pixels da imagem cheia: proporcional ao lado maior, nunca menor que um pixel dela
  const celulaCheia = Math.max(1, (G.celulaMin + (G.celulaMax - G.celulaMin) * (tamanho / 100)) * (ladoCheio(bloco) / G.ladoRef))
  // na prévia cada pixel é a média de f×f pixels da foto cheia (f = 1/escala): o desvio do grão cai. Para grão de um
  // pixel a queda é 1/f; para célula bem maior que f não há queda. 1/√(1 + 0,8·(f² − 1)/célula²) acompanha a média
  // de verdade a menos de 10% nos dois extremos e no meio (medido no teste).
  const f = 1 / escala
  const q = ((quantidade / 100) * G.ev) / Math.sqrt(1 + (0.8 * (f * f - 1)) / (celulaCheia * celulaCheia))
  const celula = Math.max(celulaCheia, f)
  for (let y = 0; y < h; y++) {
    // coordenada do centro do pixel em pixels da foto cheia, com o pixel i da foto cheia em i (não em i + 0,5): com
    // célula de um pixel cada pixel cai em cima de um nó da grade e o grão é independente de pixel para pixel
    const Y = (y0 + y + 0.5) * f - 0.5
    for (let x = 0; x < w; x++) {
      const g = 2 ** (q * campoDeGrao((x0 + x + 0.5) * f - 0.5, Y, celula, aspereza / 100, semente))
      const o = (y * w + x) * 3
      dados[o] *= g
      dados[o + 1] *= g
      dados[o + 2] *= g
    }
  }
  return bloco
}

// ─────────── vinheta ───────────

/**
 * Vinheta pós-corte: ganho de 2^(q·2 EV·suave(r0; r1; r)), com r a distância ao centro do QUADRO (0 no centro, 1 no
 * canto) e q = vinheta/100 (negativo escurece). `meio` empurra o começo (r0 = 0,8·meio/100) e `suavidade` alonga a
 * transição (r1 = r0 + 0,2 + 0,8·suavidade/100).
 */
export function vinheta(bloco, { vinheta: quantidade = 0, meio = 50, suavidade = 50 } = {}) {
  if (!quantidade) return bloco
  const { largura: w, altura: h, dados, x0 = 0, y0 = 0, quadro } = bloco
  const ev = (quantidade / 100) * LOCAL.vinheta.ev
  const r0 = 0.8 * (meio / 100)
  const r1 = r0 + 0.2 + 0.8 * (suavidade / 100)
  const cx = quadro.largura / 2
  const cy = quadro.altura / 2
  for (let y = 0; y < h; y++) {
    const dy = (y0 + y + 0.5 - cy) / cy
    for (let x = 0; x < w; x++) {
      const dx = (x0 + x + 0.5 - cx) / cx
      const r = Math.sqrt((dx * dx + dy * dy) / 2)
      const g = 2 ** (ev * suave(r0, r1, r))
      const o = (y * w + x) * 3
      dados[o] *= g
      dados[o + 1] *= g
      dados[o + 2] *= g
    }
  }
  return bloco
}

// ─────────── o conjunto ───────────

/** True quando algum ajuste de vizinhança (depois da cena) está ligado. */
export function temLocal(ajustes) {
  const p = ajustes.presenca
  const d = ajustes.detalhe
  const e = ajustes.efeitos
  return !!(p.textura || p.clareza || p.neblina || d.nitidez || e.grao || e.vinheta)
}

/** True quando a redução de ruído está ligada. */
export const temRuido = (ajustes) => !!(ajustes.detalhe.ruidoLuz || ajustes.detalhe.ruidoCor)

/**
 * Quantos pixels de vizinhança um bloco precisa ter além do miolo para o resultado ser o da foto inteira: o alcance
 * dos filtros ligados (o filtro guiado alcança 2 raios; a neblina, mínimo + guiado de 4 raios).
 */
export function margemLocal(ajustes, quadro, escala) {
  const lado = Math.max(quadro.largura, quadro.altura)
  const px = (fracao) => Math.round(fracao * lado)
  let m = 0
  const p = ajustes.presenca
  const d = ajustes.detalhe
  if (p.neblina > 0) m += Math.max(1, px(LOCAL.neblina.raio)) * 9
  let c = 0
  if (p.textura) c = Math.max(c, 2 * px(LOCAL.textura.raio))
  if (p.clareza) c = Math.max(c, 2 * px(LOCAL.clareza.raio))
  m += c
  if (d.nitidez) {
    const sigma = d.raio * escala
    if (sigma >= 0.25) m += Math.ceil(sigma * 3) + (d.mascara ? Math.max(1, Math.round(2 * sigma)) : 0)
  }
  let r = 0
  if (d.ruidoLuz) r += 2 * Math.max(1, px(LOCAL.ruido.raioLuz))
  if (d.ruidoCor) r += 2 * Math.max(1, px(LOCAL.ruido.raioCor))
  return m + r
}

/**
 * Os passos de vizinhança que vêm depois da cena, na ordem: neblina → clareza e textura → nitidez → grão → vinheta.
 * `contexto`: { ar (luz do ar medida na foto inteira), semente (do grão) }.
 */
export function aplicarLocal(bloco, ajustes, contexto = {}) {
  const p = ajustes.presenca
  const d = ajustes.detalhe
  const e = ajustes.efeitos
  tirarNeblina(bloco, { quantidade: p.neblina, ar: contexto.ar })
  contrasteLocal(bloco, { textura: p.textura, clareza: p.clareza })
  nitidez(bloco, { nitidez: d.nitidez, raio: d.raio, detalhe: d.detalhe, mascara: d.mascara })
  grao(bloco, { grao: e.grao, tamanho: e.graoTamanho, aspereza: e.graoAspereza, semente: contexto.semente ?? 1 })
  vinheta(bloco, { vinheta: e.vinheta, meio: e.vinhetaMeio, suavidade: e.vinhetaSuavidade })
  return bloco
}

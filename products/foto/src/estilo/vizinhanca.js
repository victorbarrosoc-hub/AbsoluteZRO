// Textura, clareza, neblina e nitidez de uma referência, na língua dos NOSSOS controles (src/motor/local.js). Cada
// medida usa o mesmo filtro, o mesmo raio e o mesmo limiar que o controle usa, e é comparada entre a referência e o
// alvo revelado pelo nosso motor: o valor estimado é o que faz a medida da revelação bater com a da referência.
//
// AS MEDIDAS (todas no log2 da norma da tela, 75% luminância + 25% maior canal, a mesma norma do motor):
//
//   textura   na foto em tamanho de medida (recortes; o raio da textura é 0,0006 do lado, ~4 px numa foto de 6000):
//             log(rms(L − G_f) ÷ rms(G_f − G_4f)), G_f o filtro guiado da textura (raio r_f, ε = 0,2²) e o peso
//             (1 − a_f)² do próprio motor (a textura poupa a borda). O denominador é a banda logo acima: a clareza, a
//             neblina e o tom multiplicam as duas bandas juntas, e a razão não muda (medido: ≤ 0,01 com clareza ±50,
//             neblina +40 e contraste +40, contra 0,19 da textura de 0 a 100).
//   nitidez   log(rms(L − g_σ) ÷ rms(g_σ − g_4σ)) fora das bordas e o mesmo NAS bordas (os 4% de maior banda média): é
//             o halo, que a nitidez cria e a textura não (a textura poupa a borda). σ = raio da nitidez × escala. A
//             banda fina tem o piso de ruído tirado (desvio absoluto mediano dos 25% de pixels mais lisos; Donoho e
//             Johnstone, 1994): ruído de outra câmera ou de outro ISO não vira nitidez.
//   clareza   na foto reduzida a 320 px: log(rms(g_c/3 − G_c) ÷ rms(G_c − G_4c)) com o peso (1 − a_c)², G_c o filtro
//             guiado da clareza (raio 0,012 do lado, ε = 0,5²). A banda vai de r_c/3 a r_c: abaixo disso ficaria a
//             sobra da nitidez e da textura da foto cheia (medido: nitidez 80 mexia 0,035 na medida com a banda toda,
//             0,000 nesta). Variação entre cenas parecidas: 0,006 (≈ 5 de clareza; a medida anterior variava 0,05).
//   neblina   canal escuro (He, Sun e Tang, 2011): média de mín_janela(mín_canais(I/A)), A a luz do ar medida como o
//             motor mede (luzDoAr), janela de 0,006 do lado; e o croma Oklab médio onde o canal escuro é alto (onde a
//             névoa mora) ÷ onde é baixo: tirar névoa satura justamente onde ela estava.
//
// A ESTIMATIVA: Levenberg–Marquardt com diferenças finitas, em dois blocos que não se enxergam (medido acima): {textura,
// nitidez} nos recortes e {clareza, neblina} na foto reduzida, com os ajustes de ponto já extraídos aplicados na
// revelação do alvo. Os resíduos são divididos pelo erro de medida de cada um (a dispersão entre recortes ou quadrantes)
// e há uma penalidade que puxa para zero (desvio a priori de 60). Um controle só sai se (1) a medida responde a ele no
// alvo (de −50 a +50 a medida anda mais que 4 erros de medida), e (2) o valor é maior que 2 incertezas (incerteza = erro
// de medida ÷ inclinação) e que 5. A confiança é alta com 4 incertezas, média com 2.
//
// LIMITES: sem par (outra cena), a medida também muda com o conteúdo; a incerteza inclui isso só no que a dispersão
// entre recortes enxerga. Textura só se mede com a foto a partir de ~840 px de lado (abaixo, o raio do motor é menor que
// um pixel e o controle não age); nitidez, quando o raio na escala de medida passa de ¼ de pixel. Neblina negativa (o
// véu uniforme) é quase igual a desbotar + contraste e é absorvida pelo tom.

import { neutro } from '../motor/ajustes.js'
import { baseDeImagem } from '../motor/base.js'
import { curvaDe, luminancia } from '../motor/cor/espacos.js'
import { criarOklab } from '../motor/cor/oklab.js'
import { aplicarLocal, caixa, estimarRuido, filtroGuiado, gaussiano, LOCAL, luzDoAr, mapasLargos, minimo } from '../motor/local.js'
import { criarPonto } from '../motor/ponto.js'
import { contextoDe, revelar } from '../motor/revelar.js'
import { telaDe } from '../motor/tela.js'

export const VIZINHANCA = {
  ladoLargo: 320, // a foto inteira reduzida para clareza e neblina
  recorte: 96, // lado do recorte na escala de medida (textura e nitidez)
  recortes: 12, // a grade 4×3 inteira, menos as células estouradas ou escuras: mais conteúdo na média, menos variação
  limiteLado: 2048, // escala de medida máxima dos recortes (acima disto os recortes saem de uma média)
  priori: 60, // desvio a priori dos controles (a penalidade que puxa para zero)
  minimo: 5, // valor mínimo para sair
  sigmas: { sai: 3, alta: 5 }, // valor ÷ incerteza para sair e para confiança alta
  confiavel: 0.6, // fração mínima do recorte com relevo acima do piso de quantização e ruído
  responde: 4, // a medida tem de andar mais que isto × o erro de medida de −50 a +50
  // erro de medida de cada medida: pareado (por recorte ou quadrante, o piso do que não é o controle) e sem par (o que
  // a medida varia de uma cena para outra parecida; calibrado nas cenas sintéticas, ver o teste)
  erroPar: { textura: 0.01, nitidez: 0.01, halo: 0.02, clareza: 0.005, escuro: 0.003, croma: 0.01 },
  // erroCena: o desvio-padrão de cada medida entre cenas diferentes, todas no neutro: o quanto o conteúdo sozinho mexe
  // nela. É o maior entre dois tipos de cena sintética (test/apoio-estilo.js): paisagem de textura natural (cenaNatural,
  // seis sementes, 1024 e 2560 px) e manchas de uma mesma sessão (cenaDeSessao, seis sementes, 360 e 1024 px).
  erroCena: { textura: 0.06, nitidez: 0.055, halo: 0.11, clareza: 0.053, escuro: 0.072, croma: 0.097 },
}
const V = VIZINHANCA

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)
const curvaSrgb = curvaDe('srgb')

// ─────────── imagens ───────────

const tabelas = new Map()
function tabelaLinear(niveis) {
  if (!tabelas.has(niveis)) tabelas.set(niveis, Float32Array.from({ length: niveis + 1 }, (_, i) => curvaSrgb.decodificar(i / niveis)))
  return tabelas.get(niveis)
}

/**
 * Um recorte de uma imagem de entrada ({ largura, altura, dados de 8 ou 16 bits, canais }) em RGB linear da tela, na
 * escala de medida: o pixel (x, y) da saída é a média dos pixels da origem que ele cobre, com k pixels da origem por
 * pixel da saída (k ≥ 1). (x0, y0) estão na escala de medida; o que cai fora da origem repete a borda.
 */
export function recorteLinear(img, x0, y0, w, h, k = 1) {
  const { largura, altura, dados } = img
  const canais = img.canais ?? 4
  const t = tabelaLinear(dados instanceof Uint16Array ? 65535 : 255)
  const saida = new Float32Array(w * h * 3)
  const xs = new Int32Array(w + 1)
  for (let x = 0; x <= w; x++) xs[x] = limitar(Math.floor((x0 + x) * k), 0, largura)
  for (let y = 0; y < h; y++) {
    const ya = limitar(Math.floor((y0 + y) * k), 0, altura - 1)
    const yb = limitar(Math.max(ya + 1, Math.floor((y0 + y + 1) * k)), ya + 1, altura)
    for (let x = 0; x < w; x++) {
      const xa = Math.min(xs[x], largura - 1)
      const xb = Math.max(xa + 1, Math.min(xs[x + 1], largura))
      let r = 0
      let g = 0
      let b = 0
      for (let yy = ya; yy < yb; yy++) {
        let i = (yy * largura + xa) * canais
        for (let xx = xa; xx < xb; xx++, i += canais) {
          r += t[dados[i]]
          g += t[dados[i + 1]]
          b += t[dados[i + 2]]
        }
      }
      const inv = 1 / ((yb - ya) * (xb - xa))
      const o = (y * w + x) * 3
      saida[o] = r * inv
      saida[o + 1] = g * inv
      saida[o + 2] = b * inv
    }
  }
  return saida
}

function codigos16(lin) {
  const s = new Uint16Array(lin.length)
  for (let i = 0; i < lin.length; i++) s[i] = Math.round(limitar(curvaSrgb.codificar(limitar(lin[i], 0, 1)), 0, 1) * 65535)
  return s
}

// código da tela → linear, por tabela de 4096 trechos com interpolação linear (erro < 3e-8, como em referencia.js)
const DECODIFICAR = Float64Array.from({ length: 4098 }, (_, i) => curvaSrgb.decodificar(Math.min(1, i / 4096)))
function linearDeCodigo(codigo) {
  const lin = new Float32Array(codigo.length)
  for (let i = 0; i < codigo.length; i++) {
    const x = limitar(codigo[i], 0, 1) * 4096
    const k = x | 0
    lin[i] = DECODIFICAR[k] + (DECODIFICAR[k + 1] - DECODIFICAR[k]) * (x - k)
  }
  return lin
}

// (dlog2Y/dc)² da curva sRGB em função de log2 Y, de −12 a 0 em passos de 1/64 (é o que leva o degrau do código ao
// log2 no piso de `medidasFinas`): 2,4/((c + 0,055)·ln 2), com o trecho reto (c = 12,92·Y) abaixo de 0,0031308
const INCLINACAO_LOG = Float64Array.from({ length: 12 * 64 + 2 }, (_, i) => {
  const Y = 2 ** (-12 + i / 64)
  const d = Y <= 0.0031308 ? 1 / (Y * Math.LN2) : 2.4 / ((curvaSrgb.codificar(Math.min(1, Y)) + 0.055) * Math.LN2)
  return d * d
})

/** log2 da norma da tela (75% luminância + 25% maior canal, a norma do motor) de RGB linear da tela. */
export function planoLog(lin, espaco) {
  const [y0, y1, y2] = luminancia(espaco)
  const n = lin.length / 3
  const L = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = lin[i * 3]
    const g = lin[i * 3 + 1]
    const b = lin[i * 3 + 2]
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b
    const v = 0.75 * (y0 * r + y1 * g + y2 * b) + 0.25 * mx
    L[i] = Math.log2(v > 1 / 4096 ? v : 1 / 4096)
  }
  return L
}

// ─────────── o nosso motor nos recortes ───────────

/** A base do motor de um recorte (a inversa da tela, pixel a pixel): calculada uma vez e reaproveitada. */
export const baseDoRecorte = (lin, w, h, espaco) => baseDeImagem({ largura: w, altura: h, dados: codigos16(lin), canais: 3, espaco })

// só a textura e a nitidez (e nada do que é da foto inteira): é o que os recortes medem
// textura e nitidez; clareza e neblina só quando vêm os mapas largos da foto inteira (`mapasDoAlvo`)
function soFinos(ajustes, comLargos) {
  const a = neutro()
  a.presenca.textura = ajustes.presenca.textura
  if (comLargos) {
    a.presenca.clareza = ajustes.presenca.clareza
    a.presenca.neblina = ajustes.presenca.neblina
  }
  Object.assign(a.detalhe, ajustes.detalhe, { ruidoLuz: 0, ruidoCor: 0 })
  return a
}

/**
 * Os mapas largos (base da clareza, transmissão da neblina) do alvo inteiro, para os recortes: o mesmo caminho de
 * `revelar` (mapasDaFoto), que calcula o filtro guiado largo uma vez na foto reduzida com a cadeia de ponto e o lê no
 * tamanho cheio (He e Sun, 2015). `base`: o alvo reduzido; `quadro`: a foto na escala de medida. A luz do ar é medida
 * nessa mesma foto reduzida (o motor usa uma de 256 px). null quando não há clareza nem neblina.
 */
export function mapasDoAlvo(base, ajustes, quadro) {
  const p = ajustes.presenca
  if (!p.clareza && !p.neblina) return null
  const { largura: w, altura: h } = base.imagem
  const dados = Float32Array.from(base.imagem.dados)
  criarPonto(ajustes, contextoDe(base, ajustes)).aplicarEm(dados, w * h)
  const ar = luzDoAr({ largura: w, altura: h, dados })
  const k = quadro.largura / w
  const bloco = { largura: w, altura: h, dados, x0: 0, y0: 0, quadro: { largura: w, altura: h }, escala: 1 / k }
  return { mapas: mapasLargos(bloco, ajustes, { k, quadro, ar }), ar }
}

/**
 * Revela um recorte do alvo (RGB linear da tela, w×h, com margem) pelo motor como um pedaço da foto inteira: a cadeia
 * de ponto com os ajustes dados e, da vizinhança, textura e nitidez (e clareza e neblina, com `largos` de
 * `mapasDoAlvo`). `quadro` é a foto inteira na escala de medida,
 * (x0, y0) onde o recorte fica nela, `escala` = escala de medida ÷ escala da foto (o raio da nitidez é em pixels da foto
 * cheia). É o mesmo código de `revelar` (ponto.js, local.js, tela.js), sem montar a foto inteira.
 */
export function revelarRecorte(lin, w, h, ajustes, { espaco, quadro, x0, y0, escala, base = null, largos = null }) {
  base ??= baseDoRecorte(lin, w, h, espaco)
  const dados = Float32Array.from(base.imagem.dados)
  criarPonto(ajustes, contextoDe(base, ajustes)).aplicarEm(dados, w * h)
  const contexto = { semente: 1, mapas: largos?.mapas ?? null, ar: largos?.ar ?? null }
  aplicarLocal({ largura: w, altura: h, dados, x0, y0, quadro, escala }, soFinos(ajustes, !!largos), contexto)
  const saida = new Float32Array(w * h * 3)
  telaDe(espaco, ajustes, base).aplicarEm(dados, saida, w * h, 0, 0)
  return saida
}

// ─────────── medidas ───────────

function rmsPesado(v, p) {
  let s = 0
  let q = 0
  for (let i = 0; i < v.length; i++) {
    s += p[i] * v[i] * v[i]
    q += p[i]
  }
  return q > 0 ? Math.sqrt(s / q) : 0
}

// Gaussiana larga aproximada por três caixas seguidas (Wells, 1986, "Efficient synthesis of Gaussian filters by
// cascaded uniform filters", IEEE TPAMI 8(2)): largura w com 3(w² − 1)/12 = σ². É medida (a mesma conta na referência
// e no alvo), não o motor; custa O(n) em qualquer raio.
function quaseGaussiano(origem, w, h, sigma) {
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2))
  return caixa(caixa(caixa(origem, w, h, r), w, h, r), w, h, r)
}

function media01(v, dentro) {
  let s = 0
  let q = 0
  for (let i = 0; i < v.length; i++) {
    if (!dentro[i]) continue
    s += v[i]
    q++
  }
  return q ? s / q : 0
}

// percentil por ordenação de uma amostra (no máximo ~4000 valores, passo fixo): basta para um corte de peso
function percentil(valores, p) {
  if (!valores.length) return 0
  const passo = Math.max(1, Math.floor(valores.length / 4000))
  const o = new Float32Array(Math.ceil(valores.length / passo))
  for (let i = 0, j = 0; i < valores.length; i += passo, j++) o[j] = valores[i]
  o.sort()
  return o[Math.min(o.length - 1, Math.floor(p * o.length))]
}

// Quanto da variância de um ruído branco passa pela banda L − g_σ (núcleo do `gaussiano` do motor): Σ(δ − G)² =
// 1 − 2·G(0, 0) + ΣG², com G = k ⊗ k separável.
function passaNaBandaFina(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)))
  const s = k.reduce((a, b) => a + b, 0)
  const q = k.reduce((a, b) => a + (b / s) ** 2, 0)
  return 1 - 2 * (k[r] / s) ** 2 + q * q
}

/**
 * As medidas finas de um recorte (plano log `L`, w×h; a margem `m` fica fora da conta): { textura?, nitidez?, halo?,
 * ruido? }. `rf`: raio da textura na escala de medida (sem textura abaixo de 1); `sigma`: o da nitidez (sem nitidez
 * abaixo de ¼). `ruidoA` (opcional): o ruído da imagem, var(Y) = a·Y na luz linear da tela; `ruido` devolve a parte da
 * banda fina que ele explica (variância no log2), para comparar fotos de ruídos diferentes.
 */
export function medidasFinas(L, w, h, m, { rf, sigma, ruidoA = 0, passo = 1 / 255 }) {
  const n = w * h
  const dentro = new Uint8Array(n)
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) dentro[y * w + x] = 1
  const saida = {}
  // O piso de cada pixel no log2: o degrau do código da foto de onde ele veio (passo²/12, levado ao log2 pela inclinação
  // da curva sRGB: dlog2Y/dc = 2,4/((c + 0,055)·ln 2)). A nitidez e a textura do motor amplificam esse degrau no alvo de
  // 8 bits, e na referência ele veio depois do tratamento: onde o relevo da banda média não passa de 3 pisos, o pixel
  // pesa pouco (peso s²/(s² + 9·piso²)). Sem isto, um céu liso de 8 bits dobrava a medida (medido: resíduo 13171 →
  // 44 no valor verdadeiro). O ruído medido NÃO entra aqui: o estimador do motor confunde textura fina com ruído e
  // jogava fora recortes bons; ele só entra como incerteza (ver `ruido` abaixo).
  const piso = new Float32Array(n)
  const degrau = (passo * passo) / 12
  for (let i = 0; i < n; i++) {
    const x = (limitar(L[i], -12, 0) + 12) * 64
    const k = x | 0
    const d2 = INCLINACAO_LOG[k] + (INCLINACAO_LOG[k + 1] - INCLINACAO_LOG[k]) * (x - k)
    piso[i] = degrau * d2
  }
  const confiavel = (banda, raio) => {
    const e = new Float32Array(n)
    for (let i = 0; i < n; i++) e[i] = banda[i] * banda[i]
    const s2 = caixa(e, w, h, Math.max(1, Math.round(raio)))
    for (let i = 0; i < n; i++) e[i] = s2[i] / (s2[i] + 9 * piso[i])
    return e
  }
  // onde a textura age: (1 − a)², a do filtro guiado da textura (perto de 1 na borda e no relevo forte)
  let aTextura = null
  if (rf >= 1) {
    const eps = LOCAL.textura.limiarEv ** 2
    aTextura = new Float32Array(n)
    const g1 = filtroGuiado(L, L, w, h, rf, eps, aTextura)
    const g4 = filtroGuiado(g1, g1, w, h, 4 * rf, eps)
    const fino = new Float32Array(n)
    const medio = new Float32Array(n)
    const p = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      fino[i] = L[i] - g1[i]
      medio[i] = g1[i] - g4[i]
    }
    const c = confiavel(medio, 2 * rf)
    saida.confiavel = media01(c, dentro)
    for (let i = 0; i < n; i++) {
      const liso = 1 - aTextura[i]
      p[i] = dentro[i] * liso * liso * c[i]
    }
    saida.textura = Math.log(Math.max(1e-6, rmsPesado(fino, p)) / Math.max(1e-6, rmsPesado(medio, p)))
  }
  if (sigma >= 0.25) {
    const b1 = gaussiano(L, w, h, sigma)
    const b4 = quaseGaussiano(b1, w, h, Math.sqrt(15) * sigma)
    const fina = new Float32Array(n)
    const media = new Float32Array(n)
    const mags = []
    for (let i = 0; i < n; i++) {
      fina[i] = L[i] - b1[i]
      media[i] = b1[i] - b4[i]
      if (dentro[i]) mags.push(Math.abs(media[i]))
    }
    const corteBorda = percentil(mags, 0.96)
    const c = confiavel(media, 2 * sigma)
    saida.confiavel = Math.min(saida.confiavel ?? 1, media01(c, dentro))
    const borda = new Float32Array(n)
    const resto = new Float32Array(n)
    let ruido = 0
    let pesoRuido = 0
    const passa = passaNaBandaFina(sigma)
    for (let i = 0; i < n; i++) {
      if (!dentro[i]) continue
      if (Math.abs(media[i]) >= corteBorda) borda[i] = c[i]
      else {
        // fora da borda, a nitidez pesa onde a textura NÃO age (a²): é o que separa uma da outra quando os raios se
        // encostam (foto de ~2000 px: textura com 1 px, nitidez com 1 px)
        resto[i] = (aTextura ? aTextura[i] * aTextura[i] : 1) * c[i]
        // ruído no log2: var(log2 Y) ≈ a/(Y·ln²2) para var(Y) = a·Y
        if (ruidoA > 0) {
          ruido += resto[i] * ((passa * ruidoA) / (2 ** L[i] * Math.LN2 * Math.LN2))
          pesoRuido += resto[i]
        }
      }
    }
    const e = rmsPesado(fina, resto)
    saida.nitidez = Math.log(Math.max(1e-6, e) / Math.max(1e-6, rmsPesado(media, resto)))
    saida.halo = Math.log(Math.max(1e-6, rmsPesado(fina, borda)) / Math.max(1e-6, rmsPesado(media, borda)))
    // a fração da energia fina que o ruído explica (0 a 1)
    saida.ruido = pesoRuido ? Math.min(1, ruido / pesoRuido / Math.max(1e-12, e * e)) : 0
  }
  return saida
}

/**
 * As medidas largas (foto inteira reduzida, RGB linear da tela, w×h): { clareza, escuro, croma }. `ar`: a luz do ar
 * já medida (nos quadrantes, a da foto inteira).
 */
export function medidasLargas(lin, w, h, espaco, ar = null) {
  const n = w * h
  const L = planoLog(lin, espaco)
  const lado = Math.max(w, h)
  const rc = Math.max(1, Math.round(LOCAL.clareza.raio * lado))
  const eps = LOCAL.clareza.limiarEv ** 2
  const borda = new Float32Array(n)
  const g1 = filtroGuiado(L, L, w, h, rc, eps, borda)
  const g4 = filtroGuiado(g1, g1, w, h, 4 * rc, eps)
  const gs = gaussiano(L, w, h, Math.max(0.7, rc / 3))
  const medio = new Float32Array(n)
  const largo = new Float32Array(n)
  const p = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    medio[i] = gs[i] - g1[i]
    largo[i] = g1[i] - g4[i]
    const liso = 1 - borda[i]
    p[i] = liso * liso
  }
  const clareza = Math.log(Math.max(1e-6, rmsPesado(medio, p)) / Math.max(1e-6, rmsPesado(largo, p)))
  // canal escuro relativo à luz do ar, medida como o motor mede
  const A = ar ?? luzDoAr({ largura: w, altura: h, dados: lin })
  const escuro = new Float32Array(n)
  for (let i = 0; i < n; i++) escuro[i] = Math.min(lin[i * 3] / A[0], lin[i * 3 + 1] / A[1], lin[i * 3 + 2] / A[2])
  const dc = minimo(escuro, w, h, Math.max(1, Math.round(LOCAL.neblina.raio * lado)))
  const p30 = percentil(dc, 0.3)
  const p70 = percentil(dc, 0.7)
  const ok = criarOklab(espaco)
  const lab = [0, 0, 0]
  let somaDc = 0
  let cAlto = 0
  let nAlto = 0
  let cBaixo = 0
  let nBaixo = 0
  for (let i = 0; i < n; i++) {
    somaDc += limitar(dc[i], 0, 1)
    if (dc[i] < p70 && dc[i] > p30) continue
    ok.paraOklab(Math.max(0, lin[i * 3]), Math.max(0, lin[i * 3 + 1]), Math.max(0, lin[i * 3 + 2]), lab)
    const c = Math.hypot(lab[1], lab[2])
    if (dc[i] >= p70) {
      cAlto += c
      nAlto++
    } else {
      cBaixo += c
      nBaixo++
    }
  }
  return {
    clareza,
    escuro: somaDc / n,
    croma: Math.log(Math.max(1e-3, cAlto / Math.max(1, nAlto)) / Math.max(1e-3, cBaixo / Math.max(1, nBaixo))),
  }
}

// ─────────── onde medir ───────────

/**
 * O ruído de uma foto, var(Y) = a·Y na luz linear da tela, na escala de medida (`q`: { k, largura, altura }): o
 * estimador do motor (estimarRuido, desvio absoluto mediano da diferença para os vizinhos) em 64 linhas espalhadas.
 */
function ruidoDaImagem(img, q) {
  const linhas = Math.min(64, q.altura)
  const dados = new Float32Array(q.largura * linhas * 3)
  for (let j = 0; j < linhas; j++) {
    const y = Math.floor(((j + 0.5) * q.altura) / linhas)
    dados.set(recorteLinear(img, 0, y, q.largura, 1, q.k), j * q.largura * 3)
  }
  return estimarRuido({ largura: q.largura, altura: linhas, dados })?.a ?? null
}

/** Tamanho reduzido (≤ `lado`) de uma imagem: { w, h, k } com k = pixels da origem por pixel reduzido. */
export function reduzido(img, lado) {
  const k = Math.max(1, Math.max(img.largura, img.altura) / lado)
  return { w: Math.max(8, Math.floor(img.largura / k)), h: Math.max(8, Math.floor(img.altura / k)), k }
}

/**
 * Os centros (proporcionais) dos recortes: numa grade 4×3, os `quantos` de mais relevo na banda média da foto
 * reduzida, fora de pixel estourado ou muito escuro. Sem relevo nenhum, a grade inteira.
 */
export function escolherRecortes(lin, w, h, espaco, quantos) {
  const L = planoLog(lin, espaco)
  const b = gaussiano(L, w, h, 1)
  const b4 = gaussiano(L, w, h, 4)
  const candidatos = []
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const u = (gx + 0.5) / 4
      const v = (gy + 0.5) / 3
      let soma = 0
      let conta = 0
      let ruins = 0
      const x0 = Math.floor((gx * w) / 4)
      const x1 = Math.floor(((gx + 1) * w) / 4)
      const y0 = Math.floor((gy * h) / 3)
      const y1 = Math.floor(((gy + 1) * h) / 3)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x
          if (L[i] > -0.02 || L[i] < -9) ruins++
          soma += (b[i] - b4[i]) ** 2
          conta++
        }
      }
      candidatos.push({ u, v, nota: ruins > 0.3 * conta ? -1 : soma / Math.max(1, conta) })
    }
  }
  return candidatos.sort((a, c) => c.nota - a.nota).slice(0, quantos)
}

// ─────────── ajuste ───────────

// Resolve M x = b (M pequena e simétrica) por eliminação de Gauss com pivô parcial.
function resolver(M, b) {
  const n = b.length
  const a = M.map((linha, i) => [...linha, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i
    if (Math.abs(a[p][c]) < 1e-18) continue
    ;[a[c], a[p]] = [a[p], a[c]]
    for (let i = 0; i < n; i++) {
      if (i === c) continue
      const f = a[i][c] / a[c][c]
      for (let j = c; j <= n; j++) a[i][j] -= f * a[c][j]
    }
  }
  return a.map((linha, i) => (Math.abs(linha[i]) < 1e-18 ? 0 : linha[n] / linha[i]))
}

const inversa = (M) => M.map((_, j) => resolver(M, M.map((__, i) => (i === j ? 1 : 0))))
const produto = (J) => J.map((a) => J.map((b) => a.reduce((s, x, k) => s + x * b[k], 0)))

// Jacobiano por diferenças finitas (uma coluna por parâmetro) em `v`, a partir do resíduo `r0` já medido ali.
function jacobiano(params, residuos, v, r0) {
  return params.map((p, j) => {
    const h = v[j] + p.h <= p.max ? p.h : -p.h
    const w = v.slice()
    w[j] += h
    return residuos(w).map((x, k) => (x - r0[k]) / h)
  })
}

// Levenberg–Marquardt com caixa e diferenças finitas (Marquardt, 1963, J. SIAM 11(2)), partindo de zero. `J0`: o
// jacobiano em zero, se já foi medido. Devolve { valores, residuos, J } (J no ponto final).
function ajustar(params, residuos, { iteracoes = 5, r0 = null, J0 = null } = {}) {
  const v = params.map(() => 0)
  let r = r0 ?? residuos(v)
  let J = J0 ?? jacobiano(params, residuos, v, r)
  let custo = r.reduce((s, x) => s + x * x, 0)
  let mu = 1e-2
  for (let it = 0; it < iteracoes; it++) {
    const antes = v.slice()
    const rAntes = r
    const JtJ = produto(J)
    const Jtr = J.map((col) => col.reduce((s, x, k) => s + x * r[k], 0))
    let melhorou = false
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const passo = resolver(
        JtJ.map((linha, a) => linha.map((x, b) => (a === b ? x * (1 + mu) + 1e-12 : x))),
        Jtr.map((x) => -x),
      )
      const novo = v.map((x, j) => limitar(x + passo[j], params[j].min, params[j].max))
      const rn = residuos(novo)
      if (process.env.DEPURAR) console.log("LM", novo.map(Math.round), rn.reduce((s, x) => s + x * x, 0).toFixed(1), custo.toFixed(1))
      const c = rn.reduce((s, x) => s + x * x, 0)
      if (c < custo) {
        const pequeno = novo.every((x, j) => Math.abs(x - v[j]) < 1)
        novo.forEach((x, j) => (v[j] = x))
        r = rn
        custo = c
        mu = Math.max(1e-4, mu / 3)
        melhorou = true
        if (pequeno) it = iteracoes
        break
      }
      mu *= 8
    }
    if (!melhorou) break
    // o jacobiano anda pela atualização de Broyden (1965, "A class of methods for solving nonlinear simultaneous
    // equations", Math. Comp. 19): J += (Δr − J·Δv)·Δvᵀ/|Δv|², sem revelar de novo a cada passo
    const dv = v.map((x, j) => x - antes[j])
    const n2 = dv.reduce((s, x) => s + x * x, 0)
    if (n2 > 1e-9) {
      for (let k = 0; k < r.length; k++) {
        let previsto = 0
        for (let j = 0; j < v.length; j++) previsto += J[j][k] * dv[j]
        const erro = r[k] - rAntes[k] - previsto
        for (let j = 0; j < v.length; j++) J[j][k] += (erro * dv[j]) / n2
      }
    }
  }
  // J é o do último ponto aceito (ou o de antes dele): a incerteza só pede a curvatura perto da solução
  return { valores: v, residuos: r, J }
}

/**
 * Estima um bloco de controles que mexem nas mesmas medidas.
 *
 * `params`: [{ nome, caminho, min, max, h, medidas }]; `ref`: as medidas da referência, uma por pedaço ([{ medida:
 * valor }]); `medirAlvo(ajustes)`: as do alvo revelado, nos mesmos pedaços; `escalas`: o erro de medida de cada
 * medida (o resíduo é dividido por ele).
 */
function estimarBloco(params, ref, medirAlvo, ajustes, escalas, { pareado, controles, saida, contar }) {
  const nomes = [...new Set(params.flatMap((p) => p.medidas))].filter((m) => ref[0][m] != null)
  if (!params.length || !nomes.length) return
  const com = (valores, lista = params) => {
    const a = structuredClone(ajustes)
    lista.forEach((p, j) => {
      const [g, c] = p.caminho.split('.')
      a[g][c] = valores[j]
    })
    return a
  }
  const nDados = ref.length * nomes.length
  const residuosDe = (lista) => (valores) => {
    contar()
    const med = medirAlvo(com(valores, lista))
    const r = []
    for (let k = 0; k < ref.length; k++) for (const nome of nomes) r.push((med[k][nome] - ref[k][nome]) / escalas[nome])
    lista.forEach((p, j) => r.push(valores[j] / V.priori))
    return r
  }
  // a medida responde? A inclinação em zero vezes 100 (o caminho de −50 a +50), em erros de medida
  const todos = residuosDe(params)
  const r0 = todos(params.map(() => 0))
  const J0 = jacobiano(params, todos, params.map(() => 0), r0)
  const ativos = []
  params.forEach((p, j) => {
    // em erros de medida do par (o ruído da própria medida), não do conteúdo: responder é coisa da foto e do controle
    const anda = 100 * Math.sqrt(J0[j].slice(0, nDados).reduce((s, x, k) => s + (x * escalas[nomes[k % nomes.length]] / V.erroPar[nomes[k % nomes.length]]) ** 2, 0) / ref.length)
    if (anda >= V.responde) ativos.push(j)
    else controles[p.nome] = { valor: 0, incerteza: null, confianca: 'baixa', sai: false, razao: 'a medida não responde a este controle nesta foto' }
  })
  if (!ativos.length) return
  const sub = ativos.map((j) => params[j])
  if (process.env.DEPURAR && sub.length === 2 && sub[1].nome === "nitidez") { const rr = residuosDe(sub)([0, 60]); console.log("em (0,60)", rr.reduce((s, x) => s + x * x, 0).toFixed(1), rr.map((x) => x.toFixed(0)).join(" ")) }
  const { valores, residuos, J } = ajustar(sub, residuosDe(sub), { r0, J0: ativos.map((j) => J0[j]) })
  // incerteza: a da curvatura (Jᵀ J)⁻¹, inflada pelo resíduo que sobrou quando há mais dados que parâmetros (pareado)
  const dados = residuos.slice(0, nDados)
  const livres = nDados - sub.length
  const sobra = pareado && livres > 0 ? Math.max(1, dados.reduce((s, x) => s + x * x, 0) / livres) : 1
  const cov = inversa(produto(J))
  sub.forEach((p, j) => {
    const valor = Math.round(valores[j])
    const incerteza = Math.sqrt(Math.max(cov[j][j], 0) * sobra)
    const z = Math.abs(valor) / Math.max(incerteza, 1e-9)
    // no limite da faixa = a diferença não se explica por este controle (o ajuste foi até onde pôde): não sai
    const noLimite = valores[j] <= p.min + 0.5 || valores[j] >= p.max - 0.5
    const sai = Math.abs(valor) >= V.minimo && z >= V.sigmas.sai && !noLimite
    controles[p.nome] = {
      valor,
      incerteza: Math.round(incerteza * 10) / 10,
      confianca: !sai ? 'baixa' : z >= V.sigmas.alta && pareado ? 'alta' : 'media',
      sai,
      razao: sai
        ? 'medido'
        : Math.abs(valor) < V.minimo
          ? 'perto de zero'
          : noLimite
            ? 'foi ao limite da faixa: a diferença não é deste controle'
            : 'incerteza grande demais para o valor',
    }
    if (sai) {
      const [g, c] = p.caminho.split('.')
      saida[g][c] = valor
    }
  })
}

const media = (lista) => {
  const saida = {}
  for (const k of Object.keys(lista[0])) saida[k] = lista.reduce((s, m) => s + m[k], 0) / lista.length
  return saida
}

/**
 * Estima textura, clareza, neblina e nitidez.
 *
 * `refs`: as referências como chegaram ({ largura, altura, dados de 8 ou 16 bits, canais, espaco }); `alvo`: a foto da
 * pessoa, idem; `ajustes`: os de ponto já extraídos (entram na revelação do alvo); `pareado`: a referência é a mesma
 * cena do alvo (então cada recorte e cada quadrante é comparado com o seu par, e a incerteza sai do que sobrou).
 *
 * Devolve { presenca: { textura?, clareza?, neblina? }, detalhe: { nitidez? }, controles: { [nome]: { valor,
 * incerteza, confianca, sai, razao } }, renders, tempo }.
 */
export function estimarVizinhanca(refs, alvo, ajustes, { pareado = false, tela = 'srgb' } = {}) {
  const inicio = performance.now()
  let renders = 0
  const contar = () => renders++
  const controles = {}
  const saida = { presenca: {}, detalhe: {} }
  const contexto = { pareado, controles, saida, contar }
  const pedacos = (lista) => (pareado ? lista : [media(lista)])

  // ── largas: clareza e neblina, na foto inteira reduzida a 320 px ──
  const rA = reduzido(alvo, V.ladoLargo)
  const linAlvo = recorteLinear(alvo, 0, 0, rA.w, rA.h, rA.k)
  const baseLarga = baseDeImagem({ largura: rA.w, altura: rA.h, dados: codigos16(linAlvo), canais: 3, espaco: alvo.espaco })
  // pareado: os quatro quadrantes (cada um com o seu par); sem par: a foto inteira
  const largas = (lin, w, h) => {
    if (!pareado) return [medidasLargas(lin, w, h, tela)]
    const ar = luzDoAr({ largura: w, altura: h, dados: lin })
    const hw = Math.floor(w / 2)
    const hh = Math.floor(h / 2)
    return [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([qx, qy]) => {
      const q = new Float32Array(hw * hh * 3)
      for (let y = 0; y < hh; y++) q.set(lin.subarray(((qy * hh + y) * w + qx * hw) * 3, ((qy * hh + y) * w + qx * hw + hw) * 3), y * hw * 3)
      return medidasLargas(q, hw, hh, tela, ar)
    })
  }
  const largasRef = refs.map((img) => {
    const r = reduzido(img, V.ladoLargo)
    return largas(recorteLinear(img, 0, 0, r.w, r.h, r.k), r.w, r.h)
  })
  const refLarga = pareado ? largasRef[0] : [media(largasRef.map((l) => l[0]))]
  const semFinos = (a) => {
    const b = structuredClone(a)
    b.presenca.textura = 0
    b.detalhe.nitidez = 0
    b.efeitos.grao = 0
    return b
  }
  estimarBloco(
    [
      { nome: 'clareza', caminho: 'presenca.clareza', min: -100, max: 100, h: 8, medidas: ['clareza'] },
      { nome: 'neblina', caminho: 'presenca.neblina', min: -50, max: 100, h: 8, medidas: ['escuro', 'croma'] },
    ],
    refLarga,
    (a) => {
      const img = revelar(baseLarga, semFinos(a), { tela, semente: 7 })
      return largas(linearDeCodigo(img.dados), img.largura, img.altura)
    },
    ajustes,
    pareado ? V.erroPar : V.erroCena,
    contexto,
  )

  // ── finas: textura e nitidez, em recortes na escala de medida ──
  const ladoAlvo = Math.max(alvo.largura, alvo.altura)
  const ladoRef = Math.min(...refs.map((r) => Math.max(r.largura, r.altura)))
  const M = Math.min(ladoAlvo, ladoRef, V.limiteLado)
  const escala = M / ladoAlvo
  const rf = Math.round(LOCAL.textura.raio * M)
  const sigma = ajustes.detalhe.raio * escala
  const finos = []
  if (rf >= 1) finos.push({ nome: 'textura', caminho: 'presenca.textura', min: -100, max: 100, h: 8, medidas: ['textura', 'halo'] })
  else controles.textura = { valor: 0, incerteza: null, confianca: 'baixa', sai: false, razao: 'foto pequena: o raio da textura é menor que um pixel' }
  if (sigma >= 0.25) finos.push({ nome: 'nitidez', caminho: 'detalhe.nitidez', min: 0, max: 150, h: 8, medidas: ['nitidez', 'halo'] })
  else controles.nitidez = { valor: 0, incerteza: null, confianca: 'baixa', sai: false, razao: 'foto pequena: o raio da nitidez é menor que ¼ de pixel' }
  if (finos.length) {
    const T = V.recorte
    const margemRender = 2 * Math.max(rf, 1) + Math.ceil(3 * Math.max(sigma, 1)) + 1
    // as medidas alcançam 12σ (gaussiana de 4σ) e 10·r_f (guiado de r_f e depois de 4·r_f, cada um com 2 raios): a
    // margem da medida cobre isso além da margem da revelação, para a borda do recorte não entrar na conta
    const margemMedida = margemRender + Math.max(Math.ceil(12 * Math.max(sigma, 0.25)), 10 * rf)
    const lado = T + 2 * margemMedida
    const quadroDe = (img) => {
      const k = Math.max(img.largura, img.altura) / M
      return { k, largura: Math.floor(img.largura / k), altura: Math.floor(img.altura / k) }
    }
    const qA = quadroDe(alvo)
    const posicoes = (img, lin, w, h) => {
      const q = quadroDe(img)
      // foto pequena: os recortes não passam de 60% da área (senão se sobrepõem e só custam tempo)
      const quantos = limitar(Math.floor((0.6 * q.largura * q.altura) / (lado * lado)), 3, V.recortes)
      return escolherRecortes(lin, w, h, tela, quantos).map(({ u, v }) => ({
        x0: limitar(Math.round(u * q.largura - lado / 2), 0, Math.max(0, q.largura - lado)),
        y0: limitar(Math.round(v * q.altura - lado / 2), 0, Math.max(0, q.altura - lado)),
      }))
    }
    const recortesAlvo = posicoes(alvo, linAlvo, rA.w, rA.h)
    // sem par, o ruído de cada foto entra na conta (outra câmera, outro ISO): medido na foto inteira, em linhas
    const ruidoDe = (img, q) => (pareado || sigma < 0.25 ? 0 : (ruidoDaImagem(img, q) ?? 0))
    const passoDe = (img) => 1 / (img.dados instanceof Uint16Array ? 65535 : 255)
    const medir = (lin, ruidoA, passo) => medidasFinas(planoLog(lin, tela), lado, lado, margemMedida, { rf, sigma, ruidoA, passo })
    const finasRef = refs.map((img) => {
      const q = quadroDe(img)
      let pos
      if (pareado) pos = recortesAlvo.map(({ x0, y0 }) => ({ x0: Math.round((x0 * q.largura) / qA.largura), y0: Math.round((y0 * q.altura) / qA.altura) }))
      else {
        const r = reduzido(img, V.ladoLargo)
        pos = posicoes(img, recorteLinear(img, 0, 0, r.w, r.h, r.k), r.w, r.h)
      }
      const a = ruidoDe(img, q)
      return pos.map(({ x0, y0 }) => medir(recorteLinear(img, x0, y0, lado, lado, q.k), a, passoDe(img)))
    })
    const ruidoAlvo = ruidoDe(alvo, qA)
    let crus = recortesAlvo.map(({ x0, y0 }) => {
      const lin = recorteLinear(alvo, x0, y0, lado, lado, qA.k)
      return { x0, y0, lin, base: baseDoRecorte(lin, lado, lado, alvo.espaco) }
    })
    const quadro = { largura: qA.largura, altura: qA.altura }
    // a clareza e a neblina que acabaram de sair entram nos recortes do alvo (pelos mapas largos, como em `revelar`):
    // a referência as tem, e elas mexem um pouco na banda fina (medido: clareza −30 virava textura −13 sem isto)
    const ajustesFinos = structuredClone(ajustes)
    Object.assign(ajustesFinos.presenca, saida.presenca)
    const largos = mapasDoAlvo(baseLarga, ajustesFinos, quadro)
    const medirCrus = (lista, a) =>
      lista.map(({ x0, y0, lin, base }) =>
        medir(linearDeCodigo(revelarRecorte(lin, lado, lado, a, { espaco: tela, quadro, x0, y0, escala, base, largos })), ruidoAlvo, passoDe(alvo)),
      )
    // recorte sem relevo acima do piso (céu liso de 8 bits, parede lisa) não diz nada: fica fora, no alvo e no par dele
    const bons = medirCrus(crus, ajustesFinos).map((m, k) => (m.confiavel >= V.confiavel ? k : -1)).filter((k) => k >= 0)
    crus = bons.map((k) => crus[k])
    if (pareado) finasRef[0] = bons.map((k) => finasRef[0][k])
    else for (let i = 0; i < finasRef.length; i++) finasRef[i] = finasRef[i].filter((m) => m.confiavel >= V.confiavel)
    const medirAlvo = (a) => pedacos(medirCrus(crus, a))
    let escalas = pareado ? V.erroPar : V.erroCena
    const poucos = crus.length < 3 || finasRef.some((l) => l.length < 3)
    const refFina = poucos ? null : pareado ? finasRef[0] : [media(finasRef.map(media))]
    if (poucos) {
      for (const p of finos) controles[p.nome] = { valor: 0, incerteza: null, confianca: 'baixa', sai: false, razao: 'pouco relevo fino para medir' }
      finos.length = 0
    } else if (!pareado && sigma >= 0.25) {
      // a parte da banda fina que é ruído difere entre as fotos: isso vira incerteza da nitidez e do halo, não valor.
      // d log(e) = ½ · Δ(fração de ruído): é o quanto a medida andaria só pela diferença de ruído
      const diferenca = 0.5 * Math.abs(refFina[0].ruido - medirAlvo(ajustesFinos)[0].ruido)
      escalas = { ...escalas, nitidez: Math.hypot(escalas.nitidez, diferenca), halo: Math.hypot(escalas.halo, diferenca) }
    }
    if (finos.length) estimarBloco(finos, refFina, medirAlvo, ajustesFinos, escalas, contexto)
  }
  return { ...saida, controles, renders, tempo: performance.now() - inicio }
}

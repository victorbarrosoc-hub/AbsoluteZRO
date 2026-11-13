// revelar: junta o motor Latitude. Da base (cena linear) até a imagem de tela, na ordem do contrato:
//
//   geometria (orientação, giro, espelho, ângulo, corte) → ruído (na base, onde o modelo de ruído vale) → cena
//   (ponto.js) → vizinhança (local.js) → tela (tela.js)
//
// Trabalha em faixas de linhas, cada uma com a margem que os filtros de vizinhança pedem: a memória de trabalho é a
// de uma faixa, não a da foto, e o resultado de um pedaço (`regiao`) é o mesmo da foto inteira. `revelarEmBytes`
// entrega os bytes direto, sem nunca montar a imagem de tela em ponto flutuante (é o caminho de 60 MP).

import { normalizar } from './ajustes.js'
import { autoBranco } from './auto.js'
import { aplicarLocal, estimarRuido, luzDoAr, margemLocal, reduzirRuido, temLocal, temRuido } from './local.js'
import { criarPonto } from './ponto.js'
import { paraBytes, telaDe } from './tela.js'

// Linhas por faixa. Com margem de vizinhança a faixa é mais alta e a foto é cortada também em colunas: o que se
// processa a mais (a margem em volta de cada ladrilho) fica perto de metade do ladrilho, e a memória, limitada.
const FAIXA = 128
const FAIXA_COM_MARGEM = 512
const LADRILHO = 2048

// ─────────── geometria ───────────

// Mapa afim da saída para a base, em coordenadas contínuas (o centro do pixel i fica em i + 0,5):
//   x = a·u + b·v + c;  y = d·u + e·v + f
// Cada operação recebe o mapa da vista anterior e devolve o da nova vista (a nova vista lê a anterior).
const OPERACOES = {
  girar90: (m, w, h) => ({ m: compor(m, [0, 1, 0, -1, 0, h]), w: h, h: w }), // horário
  girar180: (m, w, h) => ({ m: compor(m, [-1, 0, w, 0, -1, h]), w, h }),
  girar270: (m, w, h) => ({ m: compor(m, [0, -1, w, 1, 0, 0]), w: h, h: w }),
  espelharH: (m, w, h) => ({ m: compor(m, [-1, 0, w, 0, 1, 0]), w, h }),
  espelharV: (m, w, h) => ({ m: compor(m, [1, 0, 0, 0, -1, h]), w, h }),
  transpor: (m, w, h) => ({ m: compor(m, [0, 1, 0, 1, 0, 0]), w: h, h: w }),
  transverso: (m, w, h) => ({ m: compor(m, [0, -1, w, -1, 0, h]), w: h, h: w }),
}
// orientação do EXIF (1 a 8) → operação que põe a foto em pé
const DO_EXIF = [null, null, 'espelharH', 'girar180', 'espelharV', 'transpor', 'girar90', 'transverso', 'girar270']

// m ∘ n: primeiro n (da nova vista para a anterior), depois m (da anterior para a base)
function compor(m, n) {
  return [
    m[0] * n[0] + m[1] * n[3],
    m[0] * n[1] + m[1] * n[4],
    m[0] * n[2] + m[1] * n[5] + m[2],
    m[3] * n[0] + m[4] * n[3],
    m[3] * n[1] + m[4] * n[4],
    m[3] * n[2] + m[4] * n[5] + m[5],
  ]
}

/**
 * A geometria de saída para estes ajustes: { largura, altura, mapa: [a, b, c, d, e, f], exata }.
 * Ordem: orientação do EXIF → giro (90° horário por passo) → espelhos → ângulo → corte.
 * O ângulo (positivo = a foto gira no sentido horário) endireita a foto e fica com o maior retângulo de mesma
 * proporção que cabe dentro dela, sem escala (um pixel da saída é um pixel da base). `exata` = sem reamostrar.
 */
export function geometria(base, ajustes) {
  const g = ajustes.geometria
  let estado = { m: [1, 0, 0, 0, 1, 0], w: base.imagem.largura, h: base.imagem.altura }
  const aplicar = (nome) => {
    if (nome) estado = OPERACOES[nome](estado.m, estado.w, estado.h)
  }
  aplicar(DO_EXIF[base.orientacao ?? 1])
  aplicar(g.giro === 90 ? 'girar90' : g.giro === 180 ? 'girar180' : g.giro === 270 ? 'girar270' : null)
  if (g.espelhoH) aplicar('espelharH')
  if (g.espelhoV) aplicar('espelharV')
  let { m, w, h } = estado
  let exata = true
  if (g.angulo) {
    const t = (g.angulo * Math.PI) / 180
    const c = Math.cos(t)
    const s = Math.sin(t)
    const prop = Math.max(w / h, h / w)
    const fator = 1 / (Math.abs(c) + prop * Math.abs(s))
    const nw = Math.max(1, Math.floor(w * fator))
    const nh = Math.max(1, Math.floor(h * fator))
    // ponto da vista = centro + R(−ângulo)·(ponto do quadro − centro do quadro)
    m = compor(m, [c, s, w / 2 - (c * nw) / 2 - (s * nh) / 2, -s, c, h / 2 + (s * nw) / 2 - (c * nh) / 2])
    w = nw
    h = nh
    exata = false
  }
  if (g.corte) {
    const x0 = Math.min(w - 1, Math.round(g.corte.x * w))
    const y0 = Math.min(h - 1, Math.round(g.corte.y * h))
    const nw = Math.max(1, Math.min(w - x0, Math.round(g.corte.l * w)))
    const nh = Math.max(1, Math.min(h - y0, Math.round(g.corte.a * h)))
    m = compor(m, [1, 0, x0, 0, 1, y0])
    w = nw
    h = nh
  }
  return { largura: w, altura: h, mapa: m, exata }
}

// Copia (ou reamostra) o retângulo [x0, x0 + w) × [y0, y0 + h) do quadro de saída para `destino`.
function amostrar(base, geo, x0, y0, w, h, destino) {
  const { largura: bw, altura: bh, dados } = base.imagem
  const [a, b, c, d, e, f] = geo.mapa
  if (geo.exata) {
    // sem reamostrar: cada linha da saída é uma linha (ou coluna) da base, andando de pixel em pixel
    const onde = (px, py) =>
      Math.min(bh - 1, Math.max(0, Math.floor(d * px + e * py + f))) * bw + Math.min(bw - 1, Math.max(0, Math.floor(a * px + b * py + c)))
    for (let v = 0; v < h; v++) {
      const py = y0 + v + 0.5
      let i = onde(x0 + 0.5, py) * 3
      const passo = w > 1 ? (onde(x0 + 1.5, py) - onde(x0 + 0.5, py)) * 3 : 0
      const o = v * w * 3
      if (passo === 3) destino.set(dados.subarray(i, i + w * 3), o)
      else {
        for (let u = 0, k = o; u < w; u++, k += 3, i += passo) {
          destino[k] = dados[i]
          destino[k + 1] = dados[i + 1]
          destino[k + 2] = dados[i + 2]
        }
      }
    }
    return
  }
  // Bicúbica de Catmull-Rom (Keys, 1981, "Cubic convolution interpolation for digital image processing"), com o
  // resultado preso entre o menor e o maior dos quatro vizinhos mais próximos: na luz da cena, sem teto, o lóbulo
  // negativo da cúbica faria um anel escuro em volta de cada alta luz.
  const peso = (t, k) => {
    const t2 = t * t
    const t3 = t2 * t
    k[0] = -0.5 * t3 + t2 - 0.5 * t
    k[1] = 1.5 * t3 - 2.5 * t2 + 1
    k[2] = -1.5 * t3 + 2 * t2 + 0.5 * t
    k[3] = 0.5 * t3 - 0.5 * t2
  }
  const kx = [0, 0, 0, 0]
  const ky = [0, 0, 0, 0]
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const px = x0 + u + 0.5
      const py = y0 + v + 0.5
      const fx = a * px + b * py + c - 0.5
      const fy = d * px + e * py + f - 0.5
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      peso(fx - ix, kx)
      peso(fy - iy, ky)
      const o = (v * w + u) * 3
      for (let ch = 0; ch < 3; ch++) {
        let soma = 0
        let lo = Infinity
        let hi = -Infinity
        for (let j = 0; j < 4; j++) {
          const yy = Math.min(bh - 1, Math.max(0, iy - 1 + j))
          let linha = 0
          for (let i = 0; i < 4; i++) {
            const xx = Math.min(bw - 1, Math.max(0, ix - 1 + i))
            const val = dados[(yy * bw + xx) * 3 + ch]
            linha += kx[i] * val
            if ((i === 1 || i === 2) && (j === 1 || j === 2)) {
              if (val < lo) lo = val
              if (val > hi) hi = val
            }
          }
          soma += ky[j] * linha
        }
        destino[o + ch] = soma < lo ? lo : soma > hi ? hi : soma
      }
    }
  }
}

// ─────────── o que se mede uma vez por base ───────────

const guardado = new WeakMap()
function daBase(base) {
  if (!guardado.has(base)) guardado.set(base, {})
  return guardado.get(base)
}

/** O contexto da cadeia de ponto para uma base (branco da foto, exposição base e, no modo 'auto', o branco medido). */
export function contextoDe(base, ajustes) {
  const contexto = { branco: base.branco, exposicaoBase: base.exposicaoBase ?? 0, origem: base.origem }
  if (ajustes.branco.modo === 'auto') {
    const g = daBase(base)
    g.brancoAuto ??= autoBranco(base)
    contexto.brancoAuto = { kelvin: g.brancoAuto.temperatura, tinta: g.brancoAuto.tinta }
  }
  return contexto
}

// A luz do ar (neblina) medida na foto inteira, depois da cena, numa cópia reduzida a no máximo 256 px de lado.
function luzDoArDaBase(base, ponto) {
  const { largura, altura, dados } = base.imagem
  const k = Math.max(1, Math.ceil(Math.max(largura, altura) / 256))
  const w = Math.floor(largura / k)
  const h = Math.floor(altura / k)
  const reduzida = new Float32Array(w * h * 3)
  const inv = 1 / (k * k)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let dy = 0; dy < k; dy++) {
        let i = ((y * k + dy) * largura + x * k) * 3
        for (let dx = 0; dx < k; dx++, i += 3) {
          r += dados[i]
          g += dados[i + 1]
          b += dados[i + 2]
        }
      }
      const o = (y * w + x) * 3
      reduzida[o] = r * inv
      reduzida[o + 1] = g * inv
      reduzida[o + 2] = b * inv
    }
  }
  ponto.aplicarEm(reduzida, w * h)
  return luzDoAr({ largura: w, altura: h, dados: reduzida })
}

// ─────────── o laço ───────────

// Processa a região pedida em faixas e entrega cada faixa pronta (código da tela, Float32, 3 por pixel).
function processar(base, ajustesCrus, opcoes, entregar) {
  const ajustes = normalizar(ajustesCrus)
  const idTela = opcoes.tela ?? 'srgb'
  const geo = geometria(base, ajustes)
  const regiao = opcoes.regiao ?? { x: 0, y: 0, largura: geo.largura, altura: geo.altura }
  if (
    regiao.x < 0 ||
    regiao.y < 0 ||
    regiao.x + regiao.largura > geo.largura ||
    regiao.y + regiao.altura > geo.altura ||
    regiao.largura < 1 ||
    regiao.altura < 1
  ) {
    throw new Error('revelar: região fora do quadro')
  }
  const ponto = criarPonto(ajustes, contextoDe(base, ajustes))
  const tela = telaDe(idTela, ajustes, base)
  const escala = 1 / (base.reduzir ?? 1)
  const quadro = { largura: geo.largura, altura: geo.altura }
  const local = !opcoes.semLocal && temLocal(ajustes)
  const ruido = !opcoes.semLocal && temRuido(ajustes)
  let modeloDeRuido = null
  if (ruido) {
    modeloDeRuido = base.ruido
    if (!modeloDeRuido) {
      const g = daBase(base)
      if (g.ruido === undefined) g.ruido = estimarRuido(base.imagem)
      modeloDeRuido = g.ruido
    }
  }
  const contextoLocal = { semente: opcoes.semente ?? 1, ar: null }
  if (local && ajustes.presenca.neblina > 0) contextoLocal.ar = luzDoArDaBase(base, ponto)
  const margem = local || ruido ? margemLocal(ajustes, quadro, escala) : 0
  const faixa = Math.max(opcoes.faixa ?? (margem ? FAIXA_COM_MARGEM : FAIXA), 2 * margem)
  const look = opcoes.look && ajustes.look.id ? opcoes.look : null
  const quantoLook = ajustes.look.quantidade / 100
  const cor = [0, 0, 0]

  // Faixas de linhas; com vizinhança ligada, cada faixa ainda é cortada em ladrilhos de colunas, para a memória de
  // trabalho dos filtros (vários planos em float64) não depender da largura da foto. Cada ladrilho leva a sua margem.
  const ladrilho = margem ? Math.max(opcoes.ladrilho ?? LADRILHO, 2 * margem) : regiao.largura
  const fimX = regiao.x + regiao.largura
  for (let y = regiao.y; y < regiao.y + regiao.altura; y += faixa) {
    const linhas = Math.min(faixa, regiao.y + regiao.altura - y)
    const by0 = Math.max(0, y - margem)
    const by1 = Math.min(geo.altura, y + linhas + margem)
    const bh = by1 - by0
    const pronta = new Float32Array(regiao.largura * linhas * 3)
    for (let x = regiao.x; x < fimX; x += ladrilho) {
      const colunas = Math.min(ladrilho, fimX - x)
      const bx0 = Math.max(0, x - margem)
      const bx1 = Math.min(geo.largura, x + colunas + margem)
      const bw = bx1 - bx0
      const dados = new Float32Array(bw * bh * 3)
      amostrar(base, geo, bx0, by0, bw, bh, dados)
      const bloco = { largura: bw, altura: bh, dados, x0: bx0, y0: by0, quadro, escala }
      if (ruido && modeloDeRuido) reduzirRuido(bloco, { luz: ajustes.detalhe.ruidoLuz, cor: ajustes.detalhe.ruidoCor, ruido: modeloDeRuido })
      ponto.aplicarEm(dados, bw * bh)
      if (local) aplicarLocal(bloco, ajustes, contextoLocal)
      for (let v = 0; v < linhas; v++) {
        tela.aplicarEm(dados, pronta, colunas, ((y + v - by0) * bw + (x - bx0)) * 3, (v * regiao.largura + (x - regiao.x)) * 3)
      }
    }
    if (look) {
      for (let i = 0; i < pronta.length; i += 3) {
        look(pronta[i], pronta[i + 1], pronta[i + 2], cor)
        for (let c = 0; c < 3; c++) {
          const valor = pronta[i + c] + (cor[c] - pronta[i + c]) * quantoLook
          pronta[i + c] = valor < 0 ? 0 : valor > 1 ? 1 : valor
        }
      }
    }
    entregar(pronta, y - regiao.y, linhas)
  }
  return { largura: regiao.largura, altura: regiao.altura, espaco: idTela, quadro, tela, ajustes }
}

/**
 * Base + ajustes → imagem de TELA: { largura, altura, dados: Float32Array (RGB 0..1, já com a curva da tela), espaco,
 * quadro: { largura, altura } (a foto inteira depois da geometria) }.
 *
 * `opcoes`:
 *   tela       'srgb' | 'p3' | 'rec2020' (padrão 'srgb')
 *   regiao     { x, y, largura, altura } dentro do quadro de saída: só esse pedaço (é como a exportação anda em blocos)
 *   semLocal   pula os passos de vizinhança (prévia durante o arrasto)
 *   semente    do grão (mesma foto, mesmo grão: passe algo estável da foto)
 *   faixa, ladrilho   linhas e colunas por bloco de trabalho (só para medir e testar; o resultado não muda)
 *   look       (r, g, b, saida) → cor, aplicada sobre o código da tela quando `ajustes.look.id` existe, na quantidade
 *              de `ajustes.look.quantidade` (a LUT em si mora em src/estilo/look.js)
 */
export function revelar(base, ajustes, opcoes = {}) {
  const regiao = regiaoDe(base, ajustes, opcoes)
  const dados = new Float32Array(regiao.largura * regiao.altura * 3)
  const info = processar(base, ajustes, opcoes, (faixa, linha) => dados.set(faixa, linha * regiao.largura * 3))
  return { largura: info.largura, altura: info.altura, dados, espaco: info.espaco, quadro: info.quadro }
}

function regiaoDe(base, ajustes, opcoes) {
  if (opcoes.regiao) return opcoes.regiao
  const geo = geometria(base, normalizar(ajustes))
  return { largura: geo.largura, altura: geo.altura }
}

/**
 * O mesmo que `revelar` seguido de `paraBytes`, faixa a faixa: nunca existe a imagem de tela inteira em ponto
 * flutuante. `bits` 8 → Uint8ClampedArray RGBA; 16 → Uint16Array RGB. Devolve { largura, altura, dados, espaco, quadro }.
 * O pontilhado (`pontilhado: true`, só em 8 bits) é determinístico para a mesma região.
 */
export function revelarEmBytes(base, ajustes, opcoes = {}) {
  const bits = opcoes.bits ?? 8
  const canais = bits === 8 ? 4 : 3
  const regiao = regiaoDe(base, ajustes, opcoes)
  const dados = bits === 8 ? new Uint8ClampedArray(regiao.largura * regiao.altura * 4) : new Uint16Array(regiao.largura * regiao.altura * 3)
  const info = processar(base, ajustes, opcoes, (faixa, linha, linhas) => {
    const bytes = paraBytes(
      { largura: regiao.largura, altura: linhas, dados: faixa },
      { bits, pontilhado: opcoes.pontilhado, deslocamento: linha * regiao.largura },
    )
    dados.set(bytes, linha * regiao.largura * canais)
  })
  return { largura: info.largura, altura: info.altura, dados, espaco: info.espaco, quadro: info.quadro }
}

export { paraBytes }

// Automáticos do motor: exposição e branco. Conservadores e explicáveis — cada um devolve o número e o porquê, em
// frases curtas que a tela pode mostrar. Nenhum empurra a foto para fora do que o arquivo tem: os limites saem da
// Latitude (src/raw/latitude.js) quando ela existe.
//
// Os dois só leem a base (uma amostra em grade); quem aplica é a pessoa ou o lote (src/estilo/por-foto.js).

import { CAT16 } from './cor/adaptacao.js'
import { temperaturaDeXy, xyDeTemperatura, KELVIN_MAX, KELVIN_MIN } from './cor/branco.js'
import { XYZParaXy, luminancia, rgbParaXyz, xyParaXYZ } from './cor/espacos.js'
import { inversa, mulV } from './cor/matriz.js'
import { criarOklab } from './cor/oklab.js'
import { CINZA, MARGENS, PESO_MAXIMO } from './tela.js'

const AMOSTRAS = 60000

// Exposição: a média em log da cena vai em direção ao cinza médio (a "chave" 0,18 de Reinhard, Stark, Shirley e
// Ferwerda, 2002), mas só parte do caminho — cena escura de propósito continua escura.
export const AUTO_EXPOSICAO = { clarear: 0.6, escurecer: 0.4, folga: 0.15, min: -1.5, max: 2 }

// Branco: tons quase neutros (croma relativa abaixo de 0,10) entre −4 e +2,5 EV; anda 80% do caminho, no máximo 60
// mired e 30 de tinta; com menos de 2% da foto em tons neutros não mexe.
export const AUTO_BRANCO = { croma: 0.1, evMin: -4, evMax: 2.5, parte: 0.8, mired: 60, tinta: 30, minimo: 0.02 }

const numero = (v, casas = 1) => v.toFixed(casas).replace('.', ',').replace(/^-/, '−')
const comSinal = (v, casas = 1) => (v >= 0 ? '+' : '') + numero(v, casas)

function passoDaGrade(imagem) {
  return Math.max(1, Math.floor(Math.sqrt((imagem.largura * imagem.altura) / AMOSTRAS)))
}

/**
 * Exposição automática. Devolve { exposicao (EV, já na faixa do controle), porque: [frases], medidas: { media, p1,
 * p99 (EV em torno do cinza, com a exposição base) }, limites: { min, max } }.
 */
export function autoExposicao(base) {
  const { largura, altura, dados } = base.imagem
  const Y = luminancia('rec2020')
  const passo = passoDaGrade(base.imagem)
  const evs = []
  for (let y = (passo / 2) | 0; y < altura; y += passo) {
    for (let x = (passo / 2) | 0; x < largura; x += passo) {
      const o = (y * largura + x) * 3
      const n = (1 - PESO_MAXIMO) * (Y[0] * dados[o] + Y[1] * dados[o + 1] + Y[2] * dados[o + 2]) + PESO_MAXIMO * Math.max(dados[o], dados[o + 1], dados[o + 2])
      // abaixo de −12 EV é ruído: entra no piso, para não puxar a média
      evs.push(Math.max(-12, Math.log2(Math.max(n, 1e-9) / CINZA) + (base.exposicaoBase ?? 0)))
    }
  }
  evs.sort((a, b) => a - b)
  const media = evs.reduce((s, v) => s + v, 0) / evs.length
  const p1 = evs[Math.floor(evs.length * 0.01)]
  const p99 = evs[Math.floor(evs.length * 0.99)]
  const porque = []
  const limites = { min: AUTO_EXPOSICAO.min, max: AUTO_EXPOSICAO.max }
  const m = base.latitude?.margem
  if (Number.isFinite(m?.abaixoDoCinza)) limites.max = Math.min(limites.max, Math.max(0, m.abaixoDoCinza - MARGENS.sombras.piso))
  if (Number.isFinite(m?.acimaDoCinza)) limites.min = Math.max(limites.min, Math.min(0, MARGENS.altas.piso - (m.acimaDoCinza + (base.folgaAltas ?? 0))))
  let ev = 0
  if (Math.abs(media) <= AUTO_EXPOSICAO.folga) {
    porque.push(`A foto já está no cinza médio (${comSinal(media)} EV).`)
  } else if (media < 0) {
    ev = -media * AUTO_EXPOSICAO.clarear
    porque.push(`A foto está ${numero(-media)} EV abaixo do cinza médio; subi ${Math.round(AUTO_EXPOSICAO.clarear * 100)}% do caminho.`)
  } else {
    ev = -media * AUTO_EXPOSICAO.escurecer
    porque.push(`A foto está ${numero(media)} EV acima do cinza médio; desci ${Math.round(AUTO_EXPOSICAO.escurecer * 100)}% do caminho.`)
  }
  if (ev > limites.max) {
    ev = limites.max
    if (limites.max < AUTO_EXPOSICAO.max) porque.push(`Parei em ${comSinal(ev)} EV: acima disso o ruído do arquivo chega perto demais do cinza.`)
    else porque.push(`Parei em ${comSinal(ev)} EV, o teto do automático.`)
  } else if (ev < limites.min) {
    ev = limites.min
    if (limites.min > AUTO_EXPOSICAO.min) porque.push(`Parei em ${comSinal(ev)} EV: abaixo disso o branco do arquivo vira cinza.`)
    else porque.push(`Parei em ${comSinal(ev)} EV, o piso do automático.`)
  }
  ev = Math.round(ev * 100) / 100
  return { exposicao: ev, porque, medidas: { media, p1, p99 }, limites }
}

/**
 * Branco automático. Devolve { temperatura, tinta, mudou, porque: [frases], confianca: 'alta' | 'media' | 'baixa',
 * usados (fração da amostra que entrou na conta) }. Quando não há tons neutros bastantes, devolve o branco da foto.
 */
export function autoBranco(base) {
  const { largura, altura, dados } = base.imagem
  const oklab = criarOklab('rec2020')
  const Y = luminancia('rec2020')
  const passo = passoDaGrade(base.imagem)
  const original = { kelvin: base.branco?.kelvin ?? 6500, tinta: base.branco?.tinta ?? 0 }
  const lab = [0, 0, 0]
  const ganhoBase = 2 ** (base.exposicaoBase ?? 0)
  // duas passadas: a segunda escolhe os neutros já com a correção da primeira
  let ganhos = [1, 1, 1]
  let usados = 0
  for (let passada = 0; passada < 2; passada++) {
    const soma = [0, 0, 0]
    let conta = 0
    let total = 0
    for (let y = (passo / 2) | 0; y < altura; y += passo) {
      for (let x = (passo / 2) | 0; x < largura; x += passo) {
        const o = (y * largura + x) * 3
        const r = dados[o] * ganhos[0]
        const g = dados[o + 1] * ganhos[1]
        const b = dados[o + 2] * ganhos[2]
        total++
        const lum = Y[0] * r + Y[1] * g + Y[2] * b
        if (!(lum > 0)) continue
        const ev = Math.log2((lum * ganhoBase) / CINZA)
        if (ev < AUTO_BRANCO.evMin || ev > AUTO_BRANCO.evMax) continue
        oklab.paraOklab(r, g, b, lab)
        if (!(lab[0] > 0) || Math.hypot(lab[1], lab[2]) / lab[0] > AUTO_BRANCO.croma) continue
        soma[0] += dados[o] / lum
        soma[1] += dados[o + 1] / lum
        soma[2] += dados[o + 2] / lum
        conta++
      }
    }
    usados = conta / Math.max(1, total)
    if (usados < AUTO_BRANCO.minimo) break
    const media = soma.map((v) => v / conta)
    const lum = Y[0] * media[0] + Y[1] * media[1] + Y[2] * media[2]
    ganhos = media.map((v) => lum / v)
  }
  if (usados < AUTO_BRANCO.minimo) {
    return {
      temperatura: original.kelvin,
      tinta: original.tinta,
      mudou: false,
      porque: ['Quase não há tons neutros na foto: mantive o branco como fotografado.'],
      confianca: 'baixa',
      usados,
    }
  }
  // a cor média dos neutros, vista sob o branco da foto, é a luz que faltou descontar
  const cor = mulV(rgbParaXyz('rec2020'), [1 / ganhos[0], 1 / ganhos[1], 1 / ganhos[2]])
  const d65 = mulV(CAT16, mulV(rgbParaXyz('rec2020'), [1, 1, 1]))
  const antigo = mulV(CAT16, xyParaXYZ(xyDeTemperatura(original.kelvin, original.tinta)))
  const cones = mulV(CAT16, cor)
  const luz = mulV(inversa(CAT16), [(cones[0] * antigo[0]) / d65[0], (cones[1] * antigo[1]) / d65[1], (cones[2] * antigo[2]) / d65[2]])
  const medido = temperaturaDeXy(XYZParaXy(luz))
  const mired0 = 1e6 / original.kelvin
  let dm = (1e6 / medido.kelvin - mired0) * AUTO_BRANCO.parte
  let dt = (medido.tinta - original.tinta) * AUTO_BRANCO.parte
  const porque = []
  const limitado = Math.abs(dm) > AUTO_BRANCO.mired || Math.abs(dt) > AUTO_BRANCO.tinta
  dm = Math.max(-AUTO_BRANCO.mired, Math.min(AUTO_BRANCO.mired, dm))
  dt = Math.max(-AUTO_BRANCO.tinta, Math.min(AUTO_BRANCO.tinta, dt))
  const temperatura = Math.round(Math.max(KELVIN_MIN, Math.min(KELVIN_MAX, 1e6 / (mired0 + dm))) / 10) * 10
  const tinta = Math.round(Math.max(-150, Math.min(150, original.tinta + dt)))
  const mudou = Math.abs(temperatura - original.kelvin) >= 50 || Math.abs(tinta - original.tinta) >= 2
  if (!mudou) porque.push('Os tons neutros da foto já estão neutros: mantive o branco.')
  else {
    const lado = temperatura > original.kelvin ? 'mais quente' : temperatura < original.kelvin ? 'mais fria' : 'com outra tinta'
    porque.push(`Os tons neutros (${Math.round(usados * 100)}% da foto) puxavam para uma cor; deixei a foto ${lado}: ${temperatura} K, tinta ${comSinal(tinta, 0)}.`)
    if (limitado) porque.push('Andei só até o limite do automático: daqui em diante a cor pode ser da cena, não da luz.')
  }
  return { temperatura, tinta, mudou, porque, confianca: limitado ? 'baixa' : usados > 0.15 ? 'alta' : 'media', usados }
}

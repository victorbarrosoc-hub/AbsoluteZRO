// Controle de qualidade de uma predefinição, numérico e com o motor de verdade: uma cena de medida (rampa de cinza e
// cartela de 24 cores em cinco exposições) passa por `revelar` com o estilo e o resultado é medido em Oklab. Os estilos
// da casa TÊM de passar (teste); o importado recebe o relatório, para a tela dizer o que pode dar errado antes de a
// pessoa aplicar em 800 fotos.
//
// O que se mede (a ideia vem do qc da Revela, products/finishing/src/cor/qc.js: neutro, monotonia, degrau, pele, gamut):
//
//   monotonia  a rampa de cinza (−8 a +3,5 EV em torno do cinza médio, a faixa da tela neutra) nunca desce
//   degrau     o maior salto entre dois passos vizinhos da rampa (curva com quina vira faixa visível em céu e parede)
//   neutro     o cinza (−4 a +2,5 EV) fica cinza: croma Oklab abaixo do limite. Estilo TONALIZADO (tonalização, curva
//              por canal, tinta das sombras, look) tem limite próprio, mais largo
//   pele       as duas peles da cartela, de −2 a +2 EV: matiz dentro da faixa de pele e pouco espalhado entre as
//              exposições (pele que muda de cor da sombra para a luz é o defeito mais visto em preset)
//   pretos e brancos   a separação entre −5 e −3 EV (sombra) e entre +1,5 e +3 EV (alta luz) não cai abaixo de uma
//              fração da separação da revelação neutra: o estilo pode fechar o preto, não esmagar
//   faixa      nada fora de 0..1 e nenhum valor que não seja número
//
// Os passos de vizinhança (clareza, grão, vinheta…) ficam fora: a cena de medida é uma tira sem vizinhança real, e o
// que eles fazem não muda cor nem tom médios.

import { mexidos, normalizar } from '../motor/ajustes.js'
import { CURVAS, matrizEntre } from '../motor/cor/espacos.js'
import { mulV } from '../motor/cor/matriz.js'
import { criarOklab } from '../motor/cor/oklab.js'
import { revelar } from '../motor/revelar.js'
import { CINZA } from '../motor/tela.js'
import { ajustesDe, TIPO } from './predefinicao.js'
import { lookDaPredefinicao } from './look.js'

// ColorChecker clássico: valores sRGB de 8 bits publicados pela X-Rite (cartela anterior a novembro de 2014).
// As duas primeiras são as peles ("dark skin" e "light skin").
export const CARTELA = [
  ['pele escura', 115, 82, 68],
  ['pele clara', 194, 150, 130],
  ['céu azul', 98, 122, 157],
  ['folhagem', 87, 108, 67],
  ['flor azul', 133, 128, 177],
  ['verde azulado', 103, 189, 170],
  ['laranja', 214, 126, 44],
  ['azul arroxeado', 80, 91, 166],
  ['vermelho moderado', 193, 90, 99],
  ['roxo', 94, 60, 108],
  ['verde amarelado', 157, 188, 64],
  ['amarelo alaranjado', 224, 163, 46],
  ['azul', 56, 61, 150],
  ['verde', 70, 148, 73],
  ['vermelho', 175, 54, 60],
  ['amarelo', 231, 199, 31],
  ['magenta', 187, 86, 149],
  ['ciano', 8, 133, 161],
  ['branco', 243, 243, 242],
  ['neutro 8', 200, 200, 200],
  ['neutro 6,5', 160, 160, 160],
  ['neutro 5', 122, 122, 121],
  ['neutro 3,5', 85, 85, 85],
  ['preto', 52, 52, 52],
]

// Os limites. A revelação neutra mede: croma do cinza 0; pele em 44° a 46° de matiz Oklab, espalhamento abaixo de 2°;
// separação de 17/255 na sombra e 48/255 na alta luz; degrau máximo de 0,011 em L.
export const LIMITES_QC = {
  monotonia: 2e-4, // quanto L pode descer entre dois passos (ruído de conta)
  degrau: 0.03, // salto máximo de L entre passos de 0,045 EV (quase o triplo do neutro)
  croma: 0.02, // cinza de estilo não tonalizado (0,02 de ΔE Oklab já se vê lado a lado)
  cromaTonalizado: 0.08,
  peleFaixa: [15, 80], // graus de matiz Oklab: do rosado ao amarelado; fora disso a pele é magenta ou verde
  peleEspalhamento: 14, // graus entre a exposição mais escura e a mais clara da mesma pele
  peleEspalhamentoTonalizado: 30,
  peleCromaMinima: 0.015, // abaixo disto o matiz não é medida (pele quase branca ou quase preta)
  separacao: 0.25, // fração da separação do neutro que tem de sobrar na sombra e na alta luz
}

const PASSOS = 257
const EV_MIN = -8
const EV_MAX = 3.5
const EVS_PELE = [-2, -1, 0, 1, 2]

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const SRGB_PARA_2020 = matrizEntre('srgb', 'rec2020')
const oklab = criarOklab('srgb')

let cenaPronta = null
// A cena de medida: [rampa de cinza | 24 cores × 5 exposições], uma linha só.
function cenaDeMedida() {
  if (cenaPronta) return cenaPronta
  const largura = PASSOS + CARTELA.length * EVS_PELE.length
  const dados = new Float32Array(largura * 3)
  for (let i = 0; i < PASSOS; i++) dados.fill(CINZA * 2 ** (EV_MIN + ((EV_MAX - EV_MIN) * i) / (PASSOS - 1)), i * 3, i * 3 + 3)
  let o = PASSOS * 3
  for (const [, r, g, b] of CARTELA) {
    const cor = mulV(SRGB_PARA_2020, [linear(r / 255), linear(g / 255), linear(b / 255)])
    for (const ev of EVS_PELE) {
      const k = 2 ** ev
      dados[o++] = cor[0] * k
      dados[o++] = cor[1] * k
      dados[o++] = cor[2] * k
    }
  }
  cenaPronta = {
    imagem: { largura, altura: 1, dados },
    latitude: null,
    branco: { kelvin: 6504, tinta: 0 },
    origem: 'imagem',
    exposicaoBase: 0,
    orientacao: 1,
    reduzir: 1,
  }
  return cenaPronta
}

const indiceDoEv = (ev) => Math.round(((ev - EV_MIN) / (EV_MAX - EV_MIN)) * (PASSOS - 1))

// código de tela sRGB → [L, C, h em graus]
function lch(dados, i) {
  const lab = oklab.paraOklab(CURVAS.srgb.decodificar(dados[i]), CURVAS.srgb.decodificar(dados[i + 1]), CURVAS.srgb.decodificar(dados[i + 2]), [0, 0, 0])
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
  return [lab[0], Math.hypot(lab[1], lab[2]), h < 0 ? h + 360 : h]
}

let separacaoNeutra = null

function medir(ajustes, look) {
  const imagem = revelar(cenaDeMedida(), ajustes, { tela: 'srgb', semLocal: true, look })
  const d = imagem.dados
  let foraDaFaixa = 0
  for (let i = 0; i < d.length; i++) if (!(d[i] >= 0 && d[i] <= 1)) foraDaFaixa++
  const L = new Float64Array(PASSOS)
  let desce = 0
  let degrau = 0
  let croma = 0
  for (let i = 0; i < PASSOS; i++) {
    const c = lch(d, i * 3)
    L[i] = c[0]
    if (i) {
      desce = Math.max(desce, L[i - 1] - L[i])
      degrau = Math.max(degrau, L[i] - L[i - 1])
    }
    if (i >= indiceDoEv(-4) && i <= indiceDoEv(2.5)) croma = Math.max(croma, c[1])
  }
  const peles = []
  let cromaDaCartela = 0
  CARTELA.forEach(([nome], k) => {
    const matizes = []
    for (let e = 0; e < EVS_PELE.length; e++) {
      const c = lch(d, (PASSOS + k * EVS_PELE.length + e) * 3)
      cromaDaCartela = Math.max(cromaDaCartela, c[1])
      if (k < 2 && c[1] >= LIMITES_QC.peleCromaMinima) matizes.push(c[2])
    }
    if (k < 2) {
      // a pele mora perto de 45°: longe do corte 0/360, mas o estilo pode girá-la; mede em torno de 180° de folga
      const m = matizes.map((h) => (h > 225 ? h - 360 : h))
      peles.push({ nome, min: m.length ? Math.min(...m) : null, max: m.length ? Math.max(...m) : null, medidas: m.length })
    }
  })
  return {
    foraDaFaixa,
    monotonia: desce,
    degrau,
    croma,
    cromaDaCartela,
    peles,
    sombras: L[indiceDoEv(-3)] - L[indiceDoEv(-5)],
    altas: L[indiceDoEv(3)] - L[indiceDoEv(1.5)],
  }
}

/** True quando o estilo colore o cinza de propósito: tonalização, curva por canal, tinta das sombras ou look. */
export function eTonalizado(entrada) {
  const p = entrada?.zro === TIPO ? entrada : null
  const m = mexidos(p ? p.ajustes : entrada)
  return !!p?.look || m.some((c) => c.startsWith('tonalizacao.') || /^curva\.pontos\.[rgb]$/.test(c) || c === 'calibracao.sombrasTinta' || c === 'look')
}

const numero = (v, casas = 2) => v.toFixed(casas).replace('.', ',')

/**
 * Mede a predefinição (ou um objeto de ajustes) e devolve
 * { aprovado, tonalizado, pb, medidas: { monotonia, degrau, croma, cromaDaCartela, peles, sombras, altas, foraDaFaixa },
 *   problemas: [{ codigo, texto, valor, limite }] }.
 * `tonalizado` (opcional) força a marca; sem ele, vale `eTonalizado`.
 */
export function qc(entrada, opcoes = {}) {
  const predefinicao = entrada?.zro === TIPO ? entrada : null
  const ajustes = predefinicao ? ajustesDe(predefinicao) : normalizar(entrada)
  // a medida é do estilo: o que é da foto fica neutro
  ajustes.luz.exposicao = 0
  ajustes.branco = { modo: 'original', temperatura: 6500, tinta: 0 }
  const look = predefinicao ? lookDaPredefinicao(predefinicao) : (opcoes.look ?? null)
  if (look && !ajustes.look.id) ajustes.look.id = 'qc'
  const tonalizado = opcoes.tonalizado ?? eTonalizado(entrada)
  const pb = ajustes.pb.ativo
  separacaoNeutra ??= medir(normalizar({}), null)
  const m = medir(ajustes, look)
  const L = LIMITES_QC
  const problemas = []
  const por = (codigo, texto, valor, limite) => problemas.push({ codigo, texto, valor, limite })
  if (m.foraDaFaixa) por('faixa', 'O estilo gera valores fora da faixa da tela.', m.foraDaFaixa, 0)
  if (m.monotonia > L.monotonia) por('monotonia', 'A curva de tons desce em algum trecho: tons mais claros saem mais escuros.', m.monotonia, L.monotonia)
  if (m.degrau > L.degrau) por('degrau', 'A curva de tons tem um salto: pode aparecer faixa em céu e parede lisa.', m.degrau, L.degrau)
  const limiteCroma = tonalizado ? L.cromaTonalizado : L.croma
  if (m.croma > limiteCroma) {
    por('neutro', tonalizado ? 'A tonalização colore demais o cinza.' : 'O cinza sai colorido (o estilo não é marcado como tonalizado).', m.croma, limiteCroma)
  }
  if (pb && !tonalizado && m.cromaDaCartela > L.croma) por('pb', 'O preto e branco deixa cor passar.', m.cromaDaCartela, L.croma)
  if (!pb) {
    const espalha = tonalizado ? L.peleEspalhamentoTonalizado : L.peleEspalhamento
    for (const pele of m.peles) {
      if (!pele.medidas) continue
      if (pele.min < L.peleFaixa[0] || pele.max > L.peleFaixa[1]) {
        por('pele-matiz', `A ${pele.nome} sai da faixa de cor de pele (${numero(pele.min, 0)}° a ${numero(pele.max, 0)}°).`, pele.min < L.peleFaixa[0] ? pele.min : pele.max, L.peleFaixa)
      }
      if (pele.max - pele.min > espalha) {
        por('pele-espalhamento', `A ${pele.nome} muda de cor entre a sombra e a luz (${numero(pele.max - pele.min, 0)}°).`, pele.max - pele.min, espalha)
      }
    }
  }
  const minimoSombras = separacaoNeutra.sombras * L.separacao
  const minimoAltas = separacaoNeutra.altas * L.separacao
  if (m.sombras < minimoSombras) por('pretos', 'O estilo esmaga as sombras: o detalhe abaixo de −3 EV some no preto.', m.sombras, minimoSombras)
  if (m.altas < minimoAltas) por('brancos', 'O estilo esmaga as altas luzes: o detalhe acima de +1,5 EV some no branco.', m.altas, minimoAltas)
  return { aprovado: problemas.length === 0, tonalizado, pb, medidas: m, problemas }
}

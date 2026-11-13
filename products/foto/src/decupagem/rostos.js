// Magnitude · rostos: funções puras sobre as detecções que o worker de visão entrega (MediaPipe: detector de rostos,
// malha de 478 pontos e 52 blendshapes). Nada aqui roda modelo, e nada identifica ninguém: só se mede se o olho está
// aberto, se o rosto está em foco, de que tamanho ele é e se foi cortado.
//
// Detecção (uma por rosto), como o worker entrega:
//   {
//     caixa: { x, y, largura, altura }     em px da prévia (a mesma que foi medida)
//     confianca?                           0..1, do detector
//     olhos?: [{ x, y }, { x, y }]         centros dos olhos em px da prévia (os dois primeiros pontos do detector)
//     malha?: [{ x, y }] com 478 pontos    em qualquer unidade ISOTRÓPICA (px do recorte quadrado da malha serve;
//                                          coordenada normalizada de um quadro não quadrado NÃO serve)
//     blendshapes?: { nome: valor }        os do MediaPipe (categoryName → score): eyeBlinkLeft, eyeSquintLeft…
//   }
// Rosto pequeno demais para a malha (menos de uns 48 px na prévia) chega sem `malha`: o estado dos olhos sai null.
// Não se inventa olho aberto.
//
// Rosto devolvido por analisarRostos:
//   { caixa, confianca, olhos: 'abertos' | 'parcial' | 'fechados' | 'sorrindo' | null, ear, earPorOlho, olhoUsado,
//     piscada, aperto, sorriso, guinada, nitidezOlhos, nitidezRosto, sOlhos, sRosto, sFundo, razaoFundo, focoErrado,
//     tamanho, peso, chave, principal, cortado }

import { mapaDeNitidez, percentil, qDaRegiao, reduzir } from './medidas.js'

// Índices da malha do MediaPipe Face Mesh, na ordem p1..p6 do EAR (p1 e p4 são os cantos do olho).
export const OLHO_DIREITO = [33, 160, 158, 133, 153, 144]
export const OLHO_ESQUERDO = [362, 385, 387, 263, 373, 380]
const NARIZ = 1
const FACE_DIREITA = 234 // borda do rosto do lado direito DA PESSOA
const FACE_ESQUERDA = 454

/**
 * Limiares dos olhos e do foco no rosto. Vêm de uma amostra pequena (4 rostos de olhos fechados, 3 sorrindo, 26
 * neutros, 3 retratos com desfoque aplicado): acertam todos ali, e precisam de fotos reais de evento para firmar.
 */
export const LIMIARES_ROSTO = Object.freeze({
  earFechado: 0.15, // abaixo disto o olho está fechado, diga o blendshape o que disser
  earDuvida: 0.2, // abaixo disto, fechado só se o blendshape de piscada concordar
  piscadaFechado: 0.5,
  earAberto: 0.22,
  piscadaAberto: 0.35,
  sorriso: 0.6, // mouthSmile a partir do qual o olho apertado é riso, não piscada
  aperto: 0.5, // eyeSquint
  // riso forte: o olho espremido pela bochecha fica com EAR de olho fechado (0,09 a 0,14 nas fotos reais de evento,
  // com mouthSmile 0,81 a 0,94); olho fechado de verdade (beijo, oração, dormindo) veio com sorriso até 0,19
  risoForte: 0.8,
  guinada: 25, // graus: acima disto o olho de trás aparece achatado e não é lido
  chave: 0.5, // rosto com peso de pelo menos metade do maior é pessoa-chave
  razaoFundo: 0.6, // rosto com menos de 60% do contraste de borda do fundo: o foco caiu atrás
  blocosMinimos: 6, // rosto (blocos de 16 px) com menos blocos que isto não dá medida de nitidez
  blocosMinimosOlhos: 8, // idem para a faixa dos olhos (blocos de 8 px): com menos, o percentil 90 é quase sorteio
  margemDeCorte: 0.02, // fração do lado do rosto: caixa a menos disto da borda conta como cortada
  pesoDoCentro: 0.5, // quanto a distância do centro tira do peso (0 = posição não conta)
})

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const media = (a, b) => (a + b) / 2
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Eye Aspect Ratio (Soukupová e Čech, CVWW 2016): EAR = (‖p2 − p6‖ + ‖p3 − p5‖) / (2 · ‖p1 − p4‖).
 * Perto de 0,3 com o olho aberto, perto de 0,1 fechado. Devolve null se faltar ponto ou o olho não tiver largura.
 */
export function ear(malha, indices) {
  const p = indices.map((i) => malha?.[i])
  if (p.some((q) => !q || numero(q.x) == null || numero(q.y) == null)) return null
  const largura = dist(p[0], p[3])
  if (!(largura > 0)) return null
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * largura)
}

/**
 * Giro do rosto para os lados, em graus, pela posição do nariz entre as duas bordas do rosto. Com a cabeça
 * aproximada por um cilindro, a fração do caminho t entre as bordas vale (1 − sen θ) / 2, logo θ = asen(1 − 2t).
 * Positivo: o nariz se aproxima da borda direita DA PESSOA (o olho direito dela passa a ser o de trás).
 * É estimativa de geometria simples: serve para decidir qual olho ler, não para medir pose.
 */
export function guinadaDaMalha(malha) {
  const a = malha?.[FACE_DIREITA]
  const b = malha?.[FACE_ESQUERDA]
  const n = malha?.[NARIZ]
  if (!a || !b || !n) return null
  const ux = b.x - a.x
  const uy = b.y - a.y
  const u2 = ux * ux + uy * uy
  if (!(u2 > 0)) return null
  const t = ((n.x - a.x) * ux + (n.y - a.y) * uy) / u2
  return (Math.asin(Math.max(-1, Math.min(1, 1 - 2 * t))) * 180) / Math.PI
}

/**
 * Estado dos olhos em quatro classes, pela regra medida (EAR + blendshapes; médias dos dois olhos):
 *   fechados  EAR < 0,15, ou piscada ≥ 0,5 com EAR < 0,20, a não ser no riso forte (mouthSmile ≥ 0,8): aí é 'sorrindo'
 *   abertos   EAR ≥ 0,22 e piscada < 0,35
 *   no meio   'sorrindo' se mouthSmile ≥ 0,6 e eyeSquint ≥ 0,5 (olho apertado de riso: aprovado); 'abertos' se
 *             eyeSquint ≥ 0,5 sem piscada (< 0,35: apertado de sol); senão 'parcial'
 * O blendshape de piscada sozinho não basta em foto parada (olho fechado de verdade deu 0,36 a 0,67), por isso o
 * EAR manda. Com o rosto virado mais de 25°, só o olho da frente é lido. Sem blendshapes vale só o EAR (e o meio
 * vira 'parcial', porque não dá para saber se é riso). Sem malha: { olhos: null }.
 */
export function estadoDosOlhos({ malha, blendshapes } = {}) {
  const vazio = { olhos: null, ear: null, earPorOlho: [null, null], olhoUsado: null, piscada: null, aperto: null, sorriso: null, guinada: null }
  if (!Array.isArray(malha) || malha.length < 468) return vazio
  const d = ear(malha, OLHO_DIREITO)
  const e = ear(malha, OLHO_ESQUERDO)
  if (d == null || e == null) return vazio
  const guinada = guinadaDaMalha(malha)
  const L = LIMIARES_ROSTO
  const usado = guinada != null && guinada > L.guinada ? 'esquerdo' : guinada != null && guinada < -L.guinada ? 'direito' : 'ambos'
  const escolher = (dir, esq) => {
    if (dir == null || esq == null) return dir ?? esq
    return usado === 'direito' ? dir : usado === 'esquerdo' ? esq : media(dir, esq)
  }
  const bs = blendshapes && typeof blendshapes === 'object' ? blendshapes : null
  const ler = (nome) => (bs ? numero(bs[nome]) : null)
  const valor = escolher(d, e)
  const piscada = escolher(ler('eyeBlinkRight'), ler('eyeBlinkLeft'))
  const aperto = escolher(ler('eyeSquintRight'), ler('eyeSquintLeft'))
  const dirS = ler('mouthSmileRight')
  const esqS = ler('mouthSmileLeft')
  const sorriso = dirS == null || esqS == null ? (dirS ?? esqS) : media(dirS, esqS)
  const riso = sorriso != null && sorriso >= L.risoForte
  let olhos
  const fechadoPeloEar = valor < L.earFechado || (piscada != null && piscada >= L.piscadaFechado && valor < L.earDuvida)
  if (fechadoPeloEar) olhos = riso ? 'sorrindo' : 'fechados' // no riso forte, é o olho espremido pela bochecha
  else if (valor >= L.earAberto && (piscada == null || piscada < L.piscadaAberto)) olhos = 'abertos'
  else if (sorriso != null && aperto != null && sorriso >= L.sorriso && aperto >= L.aperto) olhos = 'sorrindo'
  // apertado sem piscada (sol de frente, olhar concentrado): a pálpebra não desceu, o olho está aberto
  else if (aperto != null && piscada != null && aperto >= L.aperto && piscada < L.piscadaAberto) olhos = 'abertos'
  else olhos = 'parcial'
  return { olhos, ear: valor, earPorOlho: [d, e], olhoUsado: usado, piscada, aperto, sorriso, guinada }
}

/**
 * Tamanho e peso de um rosto no quadro. `tamanho` = raiz da fração da área (cresce como o lado do rosto, que é
 * como a importância cresce para quem olha); `peso` = tamanho, descontado pela distância ao centro do quadro.
 */
export function pesoDoRosto(caixa, quadro) {
  const tamanho = Math.sqrt(Math.max(0, caixa.largura * caixa.altura) / (quadro.largura * quadro.altura))
  const dx = caixa.x + caixa.largura / 2 - quadro.largura / 2
  const dy = caixa.y + caixa.altura / 2 - quadro.altura / 2
  const longe = Math.min(1, Math.hypot(dx, dy) / (Math.hypot(quadro.largura, quadro.altura) / 2))
  return { tamanho, peso: tamanho * (1 - LIMIARES_ROSTO.pesoDoCentro * longe) }
}

/** True se a caixa do rosto encosta na borda do quadro ou passa dela: o rosto foi cortado. */
export function rostoCortado(caixa, quadro) {
  const m = LIMIARES_ROSTO.margemDeCorte * Math.max(caixa.largura, caixa.altura)
  return caixa.x < m || caixa.y < m || caixa.x + caixa.largura > quadro.largura - m || caixa.y + caixa.altura > quadro.altura - m
}

/** A faixa dos olhos: de um olho ao outro, mais metade da distância para cada lado e um terço para cima e para baixo. */
export function faixaDosOlhos(olhos) {
  if (!Array.isArray(olhos) || olhos.length < 2) return null
  const [a, b] = olhos
  if (!a || !b || numero(a.x) == null || numero(b.x) == null) return null
  const d = dist(a, b)
  if (!(d > 0)) return null
  const x = Math.min(a.x, b.x) - d / 2
  const y = Math.min(a.y, b.y) - d / 3
  return { x, y, largura: Math.max(a.x, b.x) + d / 2 - x, altura: Math.max(a.y, b.y) + d / 3 - y }
}

// Percentil 90 do contraste de borda dos blocos que não tocam nenhum rosto: o que há de mais nítido no fundo.
function nitidezDoFundo(mapa, caixas) {
  const fora = []
  const { colunas, linhas, bloco, valores } = mapa
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      const x0 = 1 + c * bloco
      const y0 = 1 + l * bloco
      const toca = caixas.some((k) => x0 < k.x + k.largura && x0 + bloco > k.x && y0 < k.y + k.altura && y0 + bloco > k.y)
      if (!toca) fora.push(valores[l * colunas + c])
    }
  }
  return fora.length >= LIMIARES_ROSTO.blocosMinimos ? percentil(Float32Array.from(fora), 90) : null
}

/**
 * Junta tudo por rosto. `luma` é a luma da prévia (lumaDe); `opcoes.medidas` (o que medir() devolveu) poupa refazer a
 * nitidez do quadro inteiro. A ordem de saída é a de entrada; um deles sai com `principal: true` (o de maior peso).
 *
 * Nitidez: `nitidezOlhos` e `nitidezRosto` são o mesmo q = S0 / S1 da prévia inteira, medido só na faixa dos olhos
 * (blocos de 8 px) e na caixa do rosto (blocos de 16 px). `razaoFundo` = contraste de borda do rosto sobre o do
 * fundo; `focoErrado` = o rosto tem menos de 60% do contraste do fundo e o quadro tem parte nítida (o foco caiu
 * atrás). O que a região não comporta (rosto pequeno demais) sai null.
 */
export function analisarRostos(deteccoes, luma, opcoes = {}) {
  const lista = Array.isArray(deteccoes) ? deteccoes.filter((d) => d && d.caixa && d.caixa.largura > 0 && d.caixa.altura > 0) : []
  if (!lista.length) return []
  const quadro = { largura: luma.largura, altura: luma.altura }
  const metade = reduzir(luma)
  const mapa = mapaDeNitidez(luma, 16)
  const sFundo = nitidezDoFundo(
    mapa,
    lista.map((d) => d.caixa),
  )
  const qQuadro = opcoes.medidas?.nitidez?.qLocal ?? opcoes.medidas?.nitidez?.q ?? qDaRegiao(luma, metade, { x: 0, y: 0, ...quadro }, 32)?.q ?? null
  const L = LIMIARES_ROSTO
  const rostos = lista.map((d) => {
    const olhos = estadoDosOlhos(d)
    const noRosto = qDaRegiao(luma, metade, d.caixa, 16)
    const faixa = faixaDosOlhos(d.olhos)
    const nosOlhos = faixa ? qDaRegiao(luma, metade, faixa, 8) : null
    const rosto = noRosto && noRosto.blocos >= L.blocosMinimos ? noRosto : null
    const olho = nosOlhos && nosOlhos.blocos >= L.blocosMinimosOlhos ? nosOlhos : null
    const razaoFundo = rosto && sFundo > 0 ? rosto.s0 / sFundo : null
    return {
      caixa: { x: d.caixa.x, y: d.caixa.y, largura: d.caixa.largura, altura: d.caixa.altura },
      confianca: numero(d.confianca),
      ...olhos,
      nitidezOlhos: olho ? olho.q : null,
      nitidezRosto: rosto ? rosto.q : null,
      sOlhos: olho ? olho.s0 : null,
      sRosto: rosto ? rosto.s0 : null,
      sFundo,
      razaoFundo,
      focoErrado: razaoFundo != null && qQuadro != null ? razaoFundo < L.razaoFundo && qQuadro >= 0.7 : null,
      ...pesoDoRosto(d.caixa, quadro),
      chave: false,
      principal: false,
      cortado: rostoCortado(d.caixa, quadro),
    }
  })
  let maior = 0
  for (let i = 1; i < rostos.length; i++) if (rostos[i].peso > rostos[maior].peso) maior = i
  rostos[maior].principal = true
  for (const r of rostos) r.chave = r.peso >= L.chave * rostos[maior].peso
  return rostos
}

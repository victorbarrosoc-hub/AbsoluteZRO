// Worker de visão da decupagem: MediaPipe Tasks Vision vendorizado (/vendor/mediapipe), só WASM (CPU), tudo servido
// da própria origem. Um worker só, de propósito: as tarefas do MediaPipe dividem um canvas e um módulo WASM.
// Nada aqui identifica ninguém: acha rostos, lê a malha (olhos abertos ou fechados, sorriso), objetos e rótulos de cena.
//
// Camadas (cada uma liga sozinha; o modelo só carrega se /modelos.json disser que veio no build, com o sha256 conferido):
//   'rostos'   blaze_face_full_range (acha, inclusive rosto pequeno) + face_landmarker (malha de 478 pontos e 52 blendshapes)
//   'objetos'  efficientdet_lite0 int8 (COCO: pessoa, bicho, comida…)
//   'rotulos'  efficientnet_lite0 int8 (ImageNet, com o índice: src/decupagem/cena.js traduz em cena)
// Camada sem modelo, ou que falhou ao carregar, fica 'indisponivel' com o motivo. Nunca se finge leitura.
//
// As três armadilhas do MediaPipe (docs/estudo/visao-no-aparelho.md, 3.1), e o conserto de cada uma:
//   1. worker de módulo só cria a primeira tarefa ("ModuleFactory not set."): a fábrica do WASM é guardada e reposta em
//      self.ModuleFactory antes de cada createFromOptions;
//   2. com muitas tarefas, as mais antigas passam a devolver zero, sem erro: todas dividem o MESMO OffscreenCanvas;
//   3. o Face Landmarker usa por dentro o detector de curto alcance (perde rosto pequeno, confunde bicho com gente):
//      aqui quem acha é o detector full-range na prévia; para cada rosto, um recorte 1,9× girado pela linha dos olhos,
//      tirado da maior imagem disponível, vai para o Face Landmarker (numFaces 1). Sem rosto de pé, tenta 90/−90/180.
//
// Tarefas (protocolo de app/trabalho/servir.js):
//   preparar { camadas }  → { camadas: { rostos, objetos, rotulos: 'pronta' | 'indisponivel' | 'parada' }, motivos, mediapipe, tempos }
//   analisar { previa: Blob | { largura, altura, rgba }, original?: { arquivo: File, par?: File, tipo }, camadas,
//              medidas?, cru? }
//            → { rostos?, deteccoes?, objetos?, rotulos?, giro, quadro: { largura, altura }, camadas: [as que rodaram],
//                falhas?, tempos: { abrir, rostos, giros, grande, malhas, leitura, objetos, rotulos, total } (ms) }
//     rostos     o que analisarRostos devolveu, enxuto (app/decupagem/compacto.js). Camada que não rodou: undefined.
//     deteccoes  (só com cru: true) as detecções no formato do cabeçalho de src/decupagem/rostos.js:
//                { caixa, confianca, olhos: [{x,y},{x,y}], malha?: 478 × {x,y}, blendshapes? }, tudo em px da prévia
//     objetos    [{ classe, confianca, caixa }]      rotulos  [{ nome, confianca, indice }]

import { servir } from '../trabalho/servir.js'
import { lumaDe } from '../../src/decupagem/medidas.js'
import { analisarRostos, pesoDoRosto } from '../../src/decupagem/rostos.js'
import { lerExif } from '../../src/raw/exif.js'
import { extrairPreviaDe } from '../../src/raw/previa.js'
import { resumirRosto } from './compacto.js'

const VENDOR = new URL('../../vendor/mediapipe/', import.meta.url)
const NA_RAIZ = (caminho) => new URL(caminho, self.location.origin).href

/** Os arquivos de cada camada (nomes de /modelos.json). Faltou um, a camada inteira fica indisponível. */
export const MODELOS = Object.freeze({
  rostos: ['blaze_face_full_range.tflite', 'face_landmarker.task'],
  objetos: ['efficientdet_lite0_int8.tflite'],
  rotulos: ['efficientnet_lite0_int8.tflite'],
})
const CAMADAS = Object.keys(MODELOS)

/** Os números da leitura, num lugar só. */
export const AJUSTES = Object.freeze({
  confiancaDoRosto: 0.5, // do detector full-range
  folgaDoRecorte: 1.9, // o recorte da malha tem 1,9× o lado da caixa do rosto
  ladoDoRecorte: 256, // px: é onde os limiares de olho foram medidos
  giros: [90, -90, 180], // sem rosto de pé, a prévia é tentada deitada
  // rosto com menos px que isto na melhor imagem disponível não dá malha: fica sem leitura de olhos (não se inventa)
  rostoMinimo: 36,
  // a malha só é lida para quem pode ser pessoa-chave (peso de pelo menos 35% do maior; a nota usa 50%) e, no máximo, 12
  pesoMinimo: 0.35,
  maximoDeMalhas: 12,
  // a imagem maior só é aberta quando o recorte tirado da prévia seria ampliado e ela tem pelo menos 1,25× a prévia
  ganhoMinimo: 1.25,
  // a malha vale se caiu no meio do recorte e tem o tamanho esperado (senão é o rosto do vizinho)
  desvioMaximo: 0.22,
  larguraDaMalha: [0.28, 0.9],
  objeto: 0.35,
  maximoDeObjetos: 10,
  maximoDeRotulos: 5,
})

const agora = () => performance.now()
const ms = (v) => Math.round(v * 10) / 10
const mensagem = (e) => String(e?.message ?? e).slice(0, 200)

// ───────────────────────────── carregar ─────────────────────────────

const camadas = Object.fromEntries(CAMADAS.map((c) => [c, 'parada']))
const motivos = {}
const temposDeCarga = {}
const tarefas = { detector: null, malha: null, objetos: null, rotulos: null }
let ficha = null
let base = null
let fila = Promise.resolve()

/** /modelos.json: o que veio no build. Lido uma vez (fora do cache imutável: o navegador confere com o servidor). */
function lerFicha() {
  ficha ??= fetch(NA_RAIZ('/modelos.json'), { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`modelos.json: ${r.status}`))))
    .then((j) => ({ mediapipe: j?.mediapipe ?? null, modelos: new Map((Array.isArray(j?.modelos) ? j.modelos : []).map((m) => [m.arquivo, m])) }))
  return ficha
}

/** O MediaPipe, o WASM e o canvas único. Uma vez; se falhar, todas as camadas ficam indisponíveis com o motivo. */
function carregarBase() {
  base ??= (async () => {
    const t = agora()
    const visao = await import(new URL('vision_bundle.mjs', VENDOR).href)
    const fileset = await visao.FilesetResolver.forVisionTasks(new URL('wasm', VENDOR).href, true)
    // armadilha 1: a fábrica do WASM de módulo, para repor antes de cada tarefa
    const fabrica = (await import(fileset.wasmLoaderPath)).default
    if (typeof fabrica !== 'function') throw new Error('o WASM do MediaPipe não trouxe a fábrica do módulo')
    temposDeCarga.base = ms(agora() - t)
    // armadilha 2: um canvas só para todas as tarefas
    return { visao, fileset, fabrica, tela: new OffscreenCanvas(1, 1) }
  })()
  return base
}

const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')

/** Os bytes de um modelo, conferidos com o tamanho e o sha256 de /modelos.json. */
async function baixarModelo(m) {
  const r = await fetch(NA_RAIZ(`/modelos/${m.arquivo}`))
  if (!r.ok) throw new Error(`${m.arquivo}: resposta ${r.status}`)
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (m.tamanho && bytes.length !== m.tamanho) throw new Error(`${m.arquivo}: tamanho diferente do esperado`)
  if (m.sha256 && globalThis.crypto?.subtle) {
    if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== m.sha256) throw new Error(`${m.arquivo}: não confere com o sha256`)
  }
  return bytes
}

async function criar(Classe, modelo, opcoes) {
  const b = await carregarBase()
  self.ModuleFactory = b.fabrica // armadilha 1
  return Classe.createFromOptions(b.fileset, { canvas: b.tela, baseOptions: { modelAssetBuffer: modelo, delegate: 'CPU' }, runningMode: 'IMAGE', ...opcoes })
}

const CRIAR = {
  async rostos(visao, [detector, malha]) {
    tarefas.detector = await criar(visao.FaceDetector, detector, { minDetectionConfidence: AJUSTES.confiancaDoRosto })
    tarefas.malha = await criar(visao.FaceLandmarker, malha, {
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.3,
      minFacePresenceConfidence: 0.3,
    })
  },
  async objetos(visao, [modelo]) {
    tarefas.objetos = await criar(visao.ObjectDetector, modelo, { scoreThreshold: AJUSTES.objeto, maxResults: AJUSTES.maximoDeObjetos })
  },
  async rotulos(visao, [modelo]) {
    tarefas.rotulos = await criar(visao.ImageClassifier, modelo, { maxResults: AJUSTES.maximoDeRotulos })
  },
}

async function carregarCamada(nome, progresso) {
  if (camadas[nome] === 'pronta' || camadas[nome] === 'indisponivel') return
  const indisponivel = (motivo) => {
    camadas[nome] = 'indisponivel'
    motivos[nome] = motivo
  }
  let f
  try {
    f = await lerFicha()
  } catch (e) {
    return indisponivel(`Sem a lista de modelos (${mensagem(e)})`)
  }
  if (!f.mediapipe) return indisponivel('A biblioteca de visão não veio nesta versão')
  const faltam = MODELOS[nome].filter((arquivo) => f.modelos.get(arquivo)?.pronto !== true)
  if (faltam.length) return indisponivel(`Modelo que não veio nesta versão: ${faltam.join(', ')}`)
  camadas[nome] = 'carregando'
  progresso?.({ camadas: { ...camadas } })
  const t = agora()
  try {
    const b = await carregarBase()
    const bytes = await Promise.all(MODELOS[nome].map((arquivo) => baixarModelo(f.modelos.get(arquivo))))
    await CRIAR[nome](b.visao, bytes)
    camadas[nome] = 'pronta'
    delete motivos[nome]
    temposDeCarga[nome] = ms(agora() - t)
  } catch (e) {
    indisponivel(`Não carregou (${mensagem(e)})`)
  }
}

/** Carrega as camadas pedidas, uma de cada vez (a fábrica do WASM é global: duas criações juntas se atropelam). */
function preparar(pedidas, progresso) {
  const lista = (Array.isArray(pedidas) ? pedidas : CAMADAS).filter((c) => CAMADAS.includes(c))
  fila = fila.then(async () => {
    for (const nome of lista) await carregarCamada(nome, progresso)
  })
  return fila.then(async () => ({
    camadas: { ...camadas },
    motivos: { ...motivos },
    mediapipe: (await lerFicha().catch(() => null))?.mediapipe ?? null,
    tempos: { ...temposDeCarga },
  }))
}

// ───────────────────────────── imagens ─────────────────────────────

const bytesDe = (arquivo, inicio, fim) =>
  arquivo
    .slice(inicio, fim)
    .arrayBuffer()
    .then((b) => new Uint8Array(b))

function orientacaoDe(dados, total) {
  try {
    return lerExif(dados, { total })?.orientacao || 1
  } catch {
    return 1
  }
}

/**
 * A maior imagem que há da foto, para o recorte do rosto ter mais pixels: o próprio arquivo (JPEG, PNG…) ou a maior
 * JPEG embutida do RAW (senão o JPEG da câmera ao lado). Devolve { bitmap, orientacao (o giro que AINDA falta) } ou
 * null. Só vale se tiver a mesma proporção da prévia e for de fato maior.
 */
async function abrirGrande(original, quadro) {
  if (!original?.arquivo) return null
  let bitmap = null
  let orientacao = 1
  try {
    if (original.tipo === 'raw') {
      let cabeca = null
      const ler = async (inicio, fim) => {
        const dados = await bytesDe(original.arquivo, inicio, fim)
        if (inicio === 0) cabeca = dados
        return dados
      }
      const previa = await extrairPreviaDe(ler, original.arquivo.size).catch(() => null)
      if (previa?.jpeg) {
        bitmap = await createImageBitmap(new Blob([previa.jpeg], { type: 'image/jpeg' }))
        // a JPEG embutida às vezes traz a própria orientação (o navegador já girou); senão, vale a do RAW
        const dela = orientacaoDe(previa.jpeg.subarray(0, 128 * 1024), previa.jpeg.length)
        cabeca ??= await bytesDe(original.arquivo, 0, Math.min(original.arquivo.size, 512 * 1024))
        orientacao = dela === 1 ? orientacaoDe(cabeca, original.arquivo.size) : 1
      } else if (original.par) bitmap = await createImageBitmap(original.par)
    } else bitmap = await createImageBitmap(original.arquivo) // o navegador aplica a orientação do EXIF
  } catch {
    bitmap = null
  }
  if (!bitmap) return null
  const deitada = orientacao >= 5
  const l = deitada ? bitmap.height : bitmap.width
  const a = deitada ? bitmap.width : bitmap.height
  const mesmaProporcao = Math.abs(l / a - quadro.largura / quadro.altura) <= 0.02 * (quadro.largura / quadro.altura)
  if (!mesmaProporcao || Math.max(l, a) < AJUSTES.ganhoMinimo * Math.max(quadro.largura, quadro.altura)) {
    bitmap.close()
    return null
  }
  return { bitmap, orientacao, ganho: Math.max(l, a) / Math.max(quadro.largura, quadro.altura) }
}

// As oito orientações do EXIF como matriz do canvas, para um destino de L × A (a mesma tabela do worker das miniaturas).
function matrizDaOrientacao(orientacao, L, A) {
  return (
    {
      1: [1, 0, 0, 1, 0, 0],
      2: [-1, 0, 0, 1, L, 0],
      3: [-1, 0, 0, -1, L, A],
      4: [1, 0, 0, -1, 0, A],
      5: [0, 1, 1, 0, 0, 0],
      6: [0, 1, -1, 0, L, 0],
      7: [0, -1, -1, 0, L, A],
      8: [0, -1, 1, 0, 0, A],
    }[orientacao] || [1, 0, 0, 1, 0, 0]
  )
}

let recorte = null
let pincel = null

/**
 * Desenha no recorte quadrado a região do rosto: centro (cx, cy), lado `lado` e ângulo `angulo` (radianos) em px da
 * prévia, com a linha dos olhos na horizontal. Os pixels vêm da imagem maior quando há (`grande`), desenhada no
 * espaço da prévia, senão da própria prévia.
 */
function recortar(previa, quadro, grande, { cx, cy, lado, angulo }) {
  const L = AJUSTES.ladoDoRecorte
  if (!recorte) {
    recorte = new OffscreenCanvas(L, L)
    pincel = recorte.getContext('2d', { willReadFrequently: true })
    pincel.imageSmoothingEnabled = true
    pincel.imageSmoothingQuality = 'high'
  }
  const escala = L / lado
  pincel.setTransform(1, 0, 0, 1, 0, 0)
  pincel.clearRect(0, 0, L, L)
  pincel.translate(L / 2, L / 2)
  pincel.rotate(-angulo)
  pincel.scale(escala, escala)
  pincel.translate(-cx, -cy)
  if (grande) {
    const deitada = grande.orientacao >= 5
    pincel.transform(...matrizDaOrientacao(grande.orientacao, quadro.largura, quadro.altura))
    pincel.drawImage(grande.bitmap, 0, 0, deitada ? quadro.altura : quadro.largura, deitada ? quadro.largura : quadro.altura)
  } else pincel.drawImage(previa, 0, 0)
  return recorte
}

// ───────────────────────────── rostos ─────────────────────────────

const MEIO_DOS_OLHOS = [
  [33, 133],
  [362, 263],
] // cantos de cada olho na malha: o meio é o centro do olho

/**
 * Lê a malha de um rosto no recorte e devolve os 478 pontos em px da PRÉVIA (rotação e escala uniforme: a unidade
 * continua isotrópica, como rostos.js pede) e os blendshapes. null se a malha não veio ou não é a deste rosto.
 */
function lerMalha(imagem, { cx, cy, lado, angulo }) {
  const L = AJUSTES.ladoDoRecorte
  const r = tarefas.malha.detect(imagem)
  const pontos = r.faceLandmarks?.[0]
  if (!pontos || pontos.length < 468) return { motivo: 'sem-malha' }
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const p of pontos) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  // o recorte tem o rosto no meio, com cerca de 1/1,9 da largura: malha longe disso é a do vizinho (ou não é rosto)
  const desvio = Math.hypot((x0 + x1) / 2 - 0.5, (y0 + y1) / 2 - 0.5)
  const largura = x1 - x0
  if (desvio > AJUSTES.desvioMaximo || largura < AJUSTES.larguraDaMalha[0] || largura > AJUSTES.larguraDaMalha[1]) return { motivo: 'outro-rosto' }
  const cos = Math.cos(angulo)
  const sen = Math.sin(angulo)
  const k = lado / L
  const malha = pontos.map((p) => {
    const u = (p.x * L - L / 2) * k
    const v = (p.y * L - L / 2) * k
    return { x: cx + u * cos - v * sen, y: cy + u * sen + v * cos }
  })
  const categorias = r.faceBlendshapes?.[0]?.categories
  const blendshapes = categorias ? Object.fromEntries(categorias.map((c) => [c.categoryName, c.score])) : undefined
  return { malha, blendshapes }
}

/** Acha os rostos na prévia (de pé; sem nenhum, deitada para cada lado e de cabeça para baixo). */
function acharRostos(previa, quadro, tempos) {
  let t = agora()
  let r = tarefas.detector.detect(previa)
  tempos.rostos = ms(agora() - t)
  let giro = 0
  if (!r.detections.length) {
    t = agora()
    for (const g of AJUSTES.giros) {
      const x = tarefas.detector.detect(previa, { rotationDegrees: g })
      if (x.detections.length) {
        r = x
        giro = g
        break
      }
    }
    tempos.giros = ms(agora() - t)
  }
  const { largura: W, altura: H } = quadro
  const deteccoes = r.detections
    .map((d) => {
      const b = d.boundingBox
      if (!b || !(b.width > 0) || !(b.height > 0)) return null
      // os dois primeiros pontos do detector são os olhos (direito e esquerdo da pessoa), normalizados no quadro
      const kp = d.keypoints || []
      const olhos = kp.length >= 2 ? [kp[0], kp[1]].map((p) => ({ x: p.x * W, y: p.y * H })) : null
      return { caixa: { x: b.originX, y: b.originY, largura: b.width, altura: b.height }, confianca: d.categories?.[0]?.score ?? null, olhos }
    })
    .filter(Boolean)
  return { deteccoes, giro }
}

/** Para cada rosto que pode ser pessoa-chave: recorte girado pela linha dos olhos → malha e blendshapes. */
async function lerMalhas(deteccoes, previa, quadro, original, giro, tempos) {
  const pesos = deteccoes.map((d) => pesoDoRosto(d.caixa, quadro).peso)
  const maior = Math.max(...pesos)
  const candidatos = deteccoes
    .map((d, i) => ({ d, peso: pesos[i] }))
    .filter((x) => x.peso >= AJUSTES.pesoMinimo * maior)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, AJUSTES.maximoDeMalhas)
  for (const d of deteccoes) if (!candidatos.some((c) => c.d === d)) d.semMalha = 'secundario'

  // a imagem maior só é aberta se algum recorte, tirado da prévia, precisaria ser ampliado
  const L = AJUSTES.ladoDoRecorte
  const ladoDe = (d) => Math.max(d.caixa.largura, d.caixa.altura) * AJUSTES.folgaDoRecorte
  let grande = null
  if (original && candidatos.some((c) => ladoDe(c.d) < L)) {
    const t = agora()
    grande = await abrirGrande(original, quadro)
    tempos.grande = ms(agora() - t)
  }
  const t = agora()
  try {
    for (const { d } of candidatos) {
      const lado = ladoDe(d)
      const usaGrande = grande && lado < L
      if (d.caixa.largura * (usaGrande ? grande.ganho : 1) < AJUSTES.rostoMinimo) {
        d.semMalha = 'pequeno'
        continue
      }
      // a inclinação da linha dos olhos; sem os pontos (ou com eles colados), vale o giro em que o rosto foi achado
      const [a, b] = d.olhos ?? []
      const temOlhos = a && b && Math.hypot(b.x - a.x, b.y - a.y) > 1
      const angulo = temOlhos ? Math.atan2(b.y - a.y, b.x - a.x) : (-giro * Math.PI) / 180
      const regiao = { cx: d.caixa.x + d.caixa.largura / 2, cy: d.caixa.y + d.caixa.altura / 2, lado, angulo }
      const lido = lerMalha(recortar(previa, quadro, usaGrande ? grande : null, regiao), regiao)
      if (!lido.malha) {
        d.semMalha = lido.motivo
        continue
      }
      d.malha = lido.malha
      if (lido.blendshapes) d.blendshapes = lido.blendshapes
      d.fonte = usaGrande ? 'grande' : 'previa'
      // o centro de cada olho pela malha é mais fiel que o ponto do detector: é onde a nitidez dos olhos é medida
      d.olhos = MEIO_DOS_OLHOS.map(([i, j]) => ({ x: (lido.malha[i].x + lido.malha[j].x) / 2, y: (lido.malha[i].y + lido.malha[j].y) / 2 }))
    }
  } finally {
    grande?.bitmap.close()
  }
  tempos.malhas = ms(agora() - t)
}

// ───────────────────────────── analisar ─────────────────────────────

async function analisar({ previa, original, camadas: pedidas, medidas, cru }, { cancelado }) {
  const inicio = agora()
  const tempos = {}
  const quer = (c) => (Array.isArray(pedidas) ? pedidas.includes(c) : true)
  await preparar(CAMADAS.filter(quer))
  const ativas = CAMADAS.filter((c) => quer(c) && camadas[c] === 'pronta')
  const saida = { giro: 0, camadas: [], tempos }
  if (!previa) throw new Error('analisar: falta a prévia')

  let t = agora()
  let rgba = null
  let bitmap
  if (previa instanceof Blob) bitmap = await createImageBitmap(previa)
  else {
    rgba = previa.rgba instanceof Uint8ClampedArray ? previa.rgba : new Uint8ClampedArray(previa.rgba.buffer, previa.rgba.byteOffset, previa.rgba.byteLength)
    bitmap = await createImageBitmap(new ImageData(rgba, previa.largura, previa.altura))
  }
  const quadro = { largura: bitmap.width, altura: bitmap.height }
  saida.quadro = quadro
  tempos.abrir = ms(agora() - t)
  const falhou = (camada, e) => ((saida.falhas ??= {})[camada] = mensagem(e))

  try {
    if (ativas.includes('rostos') && !cancelado()) {
      try {
        const { deteccoes, giro } = acharRostos(bitmap, quadro, tempos)
        saida.giro = giro
        if (deteccoes.length) {
          await lerMalhas(deteccoes, bitmap, quadro, original, giro, tempos)
          // a nitidez do rosto e dos olhos é medida na luma da prévia (a mesma que medir() viu)
          t = agora()
          if (!rgba) {
            const tela = new OffscreenCanvas(quadro.largura, quadro.altura)
            const c = tela.getContext('2d', { willReadFrequently: true })
            c.drawImage(bitmap, 0, 0)
            rgba = c.getImageData(0, 0, quadro.largura, quadro.altura).data
          }
          const lidos = analisarRostos(deteccoes, lumaDe({ ...quadro, rgba }), { medidas })
          saida.rostos = lidos.map((r, i) => resumirRosto({ ...r, giro }, deteccoes[i]))
          tempos.leitura = ms(agora() - t)
        } else saida.rostos = []
        if (cru) saida.deteccoes = deteccoes
        saida.camadas.push('rostos')
      } catch (e) {
        falhou('rostos', e)
      }
    }
    if (ativas.includes('objetos') && !cancelado()) {
      t = agora()
      try {
        const r = tarefas.objetos.detect(bitmap)
        saida.objetos = r.detections.map((d) => {
          const b = d.boundingBox
          return {
            classe: d.categories?.[0]?.categoryName ?? '',
            confianca: d.categories?.[0]?.score ?? 0,
            caixa: b ? { x: b.originX, y: b.originY, largura: b.width, altura: b.height } : null,
          }
        })
        saida.camadas.push('objetos')
      } catch (e) {
        falhou('objetos', e)
      }
      tempos.objetos = ms(agora() - t)
    }
    if (ativas.includes('rotulos') && !cancelado()) {
      t = agora()
      try {
        const r = tarefas.rotulos.classify(bitmap)
        saida.rotulos = (r.classifications?.[0]?.categories ?? []).map((c) => ({ nome: c.categoryName, confianca: c.score, indice: c.index }))
        saida.camadas.push('rotulos')
      } catch (e) {
        falhou('rotulos', e)
      }
      tempos.rotulos = ms(agora() - t)
    }
  } finally {
    bitmap.close()
  }
  saida.estado = { ...camadas }
  tempos.total = ms(agora() - inicio)
  return saida
}

servir({
  preparar: ({ camadas: pedidas } = {}, { progresso }) => preparar(pedidas, progresso),
  analisar,
  estado: async () => ({ camadas: { ...camadas }, motivos: { ...motivos }, tempos: { ...temposDeCarga } }),
})

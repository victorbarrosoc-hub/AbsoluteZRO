// O motor do rosto, dentro do worker (app/rosto/worker.js): ONNX Runtime Web só WASM, uma thread (sem COEP não há
// SharedArrayBuffer), com o YuNet de entrada livre e o SFace p8 (modelos.json, bloco `rosto`). Os dois lados usam o
// mesmo motor: o computador do fotógrafo nas fotos do evento e o celular do visitante na selfie.
//
// Tudo vem do próprio domínio (CSP 'self'): o runtime de /vendor/onnxruntime-<versão>/ e os modelos de /modelos/, com
// cache imutável de um ano (baixa uma vez). Endereços absolutos de propósito: o worker roda tanto em /app/rosto/ quanto
// em /e/<token>/app/rosto/ (a página do visitante).
//
// O download é contado em bytes (o tamanho de cada arquivo já descomprimido é conhecido): a página mostra o progresso
// uma vez só; da segunda em diante vem do cache e passa direto.

import { recortar, tensorDoDetector, tensorDoRosto } from '../../src/rosto/alinhar.js'
import { normalizar, quantizar } from '../../src/rosto/assinatura.js'
import { decodificar, invasao, passadas, passadaUnica, suprimir } from '../../src/rosto/detectar.js'
import { LIMIARES } from '../../src/rosto/decidir.js'
import { pose } from '../../src/rosto/qualidade.js'
import { sinaisDeTela } from '../../src/rosto/vida.js'

export const ORT = '/vendor/onnxruntime-1.31.1/'
export const ARQUIVOS = {
  runtime: { url: `${ORT}ort-wasm-simd-threaded.wasm`, tamanho: 14848852 },
  detector: { url: '/modelos/yunet_2023mar_dinamico.onnx', tamanho: 229657 },
  assinatura: { url: '/modelos/sface_2021dec_p8.onnx', tamanho: 9943427 },
}
export const TOTAL = Object.values(ARQUIVOS).reduce((s, a) => s + a.tamanho, 0)

export const LADO_DA_FOTO = 1616

/** A imagem girada pela orientação do EXIF (1, 3, 6, 8; os espelhados 2, 4, 5, 7 também) e reduzida a `lado`. */
export function girarEReduzir(bmp, orientacao = 1, lado = LADO_DA_FOTO) {
  const o = Number(orientacao) || 1
  const deitada = o >= 5 && o <= 8
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  const W = deitada ? h : w
  const H = deitada ? w : h
  const t = new OffscreenCanvas(W, H)
  const c = t.getContext('2d')
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  // as 8 orientações do EXIF (TIFF 6.0): a matriz que leva a foto gravada à foto vista
  const m = {
    1: [1, 0, 0, 1, 0, 0],
    2: [-1, 0, 0, 1, W, 0],
    3: [-1, 0, 0, -1, W, H],
    4: [1, 0, 0, -1, 0, H],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, W, 0],
    7: [0, -1, -1, 0, W, H],
    8: [0, -1, 1, 0, 0, H],
  }[o] ?? [1, 0, 0, 1, 0, 0]
  c.setTransform(...m)
  c.drawImage(bmp, 0, 0, w, h)
  return t
}

let pronto = null
let ort = null
let det = null
let sface = null

/** Baixa um arquivo contando os bytes; até 3 tentativas (vários workers baixando o mesmo arquivo ao mesmo tempo às
 * vezes perdem a conexão no meio). `conta(n)` recebe cada pedaço; numa tentativa nova, o que já foi contado sai. */
async function baixar(url, conta) {
  for (let tentativa = 1; ; tentativa++) {
    let parcial = 0
    try {
      return await baixarUmaVez(url, (n) => {
        parcial += n
        conta(n)
      })
    } catch (e) {
      conta(-parcial)
      if (tentativa >= 3 || e?.codigo === 'indisponivel') throw e
      await new Promise((ok) => setTimeout(ok, 300 * tentativa))
    }
  }
}

async function baixarUmaVez(url, conta) {
  const r = await fetch(url, { cache: 'default' })
  if (!r.ok) throw Object.assign(new Error(`indisponivel: ${url} (${r.status})`), { codigo: 'indisponivel' })
  if (!r.body?.getReader) {
    const b = new Uint8Array(await r.arrayBuffer())
    conta(b.length)
    return b
  }
  const leitor = r.body.getReader()
  const partes = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    partes.push(value)
    total += value.length
    conta(value.length)
  }
  const b = new Uint8Array(total)
  let o = 0
  for (const p of partes) {
    b.set(p, o)
    o += p.length
  }
  return b
}

/** Carrega o runtime e os dois modelos (uma vez por worker). `aoProgredir({ feito, total })`. */
export function preparar({ aoProgredir = () => {} } = {}) {
  pronto ??= (async () => {
    const t0 = performance.now()
    let feito = 0
    const conta = (n) => {
      feito += n
      aoProgredir({ feito: Math.min(feito, TOTAL), total: TOTAL })
    }
    const [modulo, wasm, bytesDet, bytesSface] = await Promise.all([
      import(`${ORT}ort.wasm.min.mjs`),
      baixar(ARQUIVOS.runtime.url, conta),
      baixar(ARQUIVOS.detector.url, conta),
      baixar(ARQUIVOS.assinatura.url, conta),
    ])
    ort = modulo
    ort.env.wasm.wasmPaths = ORT
    ort.env.wasm.wasmBinary = wasm.buffer
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    ort.env.logLevel = 'error'
    const opcoes = { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 }
    det = await ort.InferenceSession.create(bytesDet, opcoes)
    sface = await ort.InferenceSession.create(bytesSface, opcoes)
    return { ms: Math.round(performance.now() - t0) }
  })()
  pronto.catch(() => {
    pronto = null
  })
  return pronto
}

// ───────── detectar ─────────

let tela = null
let ctx = null
function telaDe(L, A) {
  if (!tela) {
    tela = new OffscreenCanvas(L, A)
    ctx = tela.getContext('2d', { willReadFrequently: true })
  }
  if (tela.width !== L || tela.height !== A) {
    tela.width = L
    tela.height = A
  }
  return ctx
}

async function rodarPassada(fonte, p, limiar) {
  const c = telaDe(p.L, p.A)
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.fillStyle = '#000'
  c.fillRect(0, 0, p.L, p.A)
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  c.drawImage(fonte, p.sx, p.sy, p.sw, p.sh, 0, 0, p.sw * p.k, p.sh * p.k)
  const px = c.getImageData(0, 0, p.L, p.A).data
  const r = await det.run({ input: new ort.Tensor('float32', tensorDoDetector(px, p.L, p.A), [1, 3, p.A, p.L]) })
  const saidas = {}
  for (const [k, v] of Object.entries(r)) saidas[k] = v.data
  return decodificar(saidas, p, { limiar })
}

/** Os pixels RGBA de uma fonte inteira (ImageBitmap ou OffscreenCanvas). */
function pixelsDe(fonte) {
  const t = new OffscreenCanvas(fonte.width, fonte.height)
  const c = t.getContext('2d', { willReadFrequently: true })
  c.drawImage(fonte, 0, 0)
  return { largura: fonte.width, altura: fonte.height, dados: c.getImageData(0, 0, fonte.width, fonte.height).data }
}

async function assinar(imagem, pontos, recorte = recortar(imagem, pontos)) {
  const r = await sface.run({ data: new ort.Tensor('float32', tensorDoRosto(recorte), [1, 3, 112, 112]) })
  return { recorte, vetor: normalizar(r.fc1.data) }
}

/**
 * Os rostos de uma foto do evento (a prévia de ~1616 px, já girada). Só os que valem para a busca: nota ≥ 0,75 e
 * largura ≥ 20 px. Cada um: { largura, nota, colado, perfil, v: Int8Array(128) }. Nada de caixa nem de imagem.
 */
export async function rostosDaFoto(fonte, { lado = 1616 } = {}) {
  await preparar()
  const achados = []
  for (const p of passadas(fonte.width, fonte.height, { lado })) achados.push(...(await rodarPassada(fonte, p, 0.6)))
  const todos = suprimir(achados)
  const validos = todos.filter((f) => f.nota >= LIMIARES.notaMinima && f.largura >= LIMIARES.larguraMinima)
  if (!validos.length) return []
  const imagem = pixelsDe(fonte)
  const saida = []
  for (const f of validos) {
    const { vetor } = await assinar(imagem, f.pontos)
    saida.push({
      largura: Math.round(f.largura),
      nota: Math.round(f.nota * 100) / 100,
      colado: invasao(f, todos) > 0.1,
      perfil: Math.abs(pose(f.pontos).guinada) >= LIMIARES.perfil,
      v: quantizar(vetor),
    })
  }
  return saida
}

/**
 * Um quadro da câmera (a selfie): detecta numa passada só (lado 320) e, se `assinarSe(rostos, recorte, lado)` disser que sim,
 * assina o rosto. Devolve { rostos: [{ nota, largura, pontos }], recorte?, vetor?, tela? } em px do quadro reduzido;
 * `tela` (com um rosto só): moiré e brilho em volta do nariz, na resolução da câmera (src/rosto/vida.js).
 */
export async function quadro(fonte, { lado = 320, assinarSe = () => false } = {}) {
  await preparar()
  const p = passadaUnica(fonte.width, fonte.height, { lado })
  const rostos = suprimir(await rodarPassada(fonte, p, 0.6)).map((f) => ({
    nota: f.nota,
    largura: f.largura * p.k,
    pontos: f.pontos.map(([x, y]) => [x * p.k, y * p.k]),
    _pontos: f.pontos,
  }))
  let recorte = null
  let vetor = null
  let tela = null
  const ladoDoQuadro = Math.max(fonte.width, fonte.height) * p.k
  if (rostos.length) {
    const imagem = pixelsDe(fonte)
    recorte = recortar(imagem, rostos[0]._pontos)
    if (rostos.length === 1) tela = sinaisDeTela(imagem, rostos[0]._pontos)
    if (assinarSe(rostos, recorte, ladoDoQuadro)) vetor = (await assinar(imagem, rostos[0]._pontos, recorte)).vetor
  }
  for (const r of rostos) delete r._pontos
  return { rostos, recorte, vetor, ladoDoQuadro, tela }
}

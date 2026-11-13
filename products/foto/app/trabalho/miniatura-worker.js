// Worker das miniaturas: identifica a foto (EXIF) e gera a miniatura e a prévia de análise sem revelar nada.
// Para RAW lê só o começo do arquivo (file.slice) e tira a JPEG que a câmera embutiu (src/raw/previa.js); o EXIF vem
// de src/raw/exif.js, em JS puro. É o truque que deixa mil RAW navegáveis em segundos.
//
// Tarefas:
//   identificar { arquivos: [File] }                → [{ exif }]            (só o começo de cada arquivo)
//   miniatura   { arquivo, par?, tipo, lados? }     → { mini, previa, proporcao, exif, origem } | { semPrevia: true, exif }
//   grande      { arquivo }                         → { blob, orientacao } | null   (a maior JPEG embutida, para o zoom)
//   pixels      { blob, lado? }                     → { largura, altura, rgba }     (para a decupagem medir)

import { comTransferencia, servir } from './servir.js'
import { lerExif } from '../../src/raw/exif.js'
import { extrairPreviaDe } from '../../src/raw/previa.js'

/** Quanto do começo do arquivo se lê para o EXIF que entra no id. Não mude: o id das fotos depende disso. */
const CABECA_DO_ID = 128 * 1024
const LADO_MINI = 400
const LADO_PREVIA = 1024

const bytes = (arquivo, inicio, fim) => arquivo.slice(inicio, fim).arrayBuffer().then((b) => new Uint8Array(b))

function exifSeguro(dados, total) {
  try {
    return lerExif(dados, { total }) || { orientacao: 1 }
  } catch {
    return { orientacao: 1 }
  }
}

/** A JPEG embutida do RAW e o EXIF, lendo o começo do arquivo uma vez só. `lado`: o tamanho que basta (ou a maior). */
async function embutida(arquivo, lado) {
  let cabeca = null
  const ler = async (inicio, fim) => {
    const dados = await bytes(arquivo, inicio, fim)
    if (inicio === 0) cabeca = dados
    return dados
  }
  let previa = null
  try {
    previa = await extrairPreviaDe(ler, arquivo.size, lado ? { lado } : {})
  } catch {
    previa = null
  }
  cabeca ??= await bytes(arquivo, 0, Math.min(arquivo.size, 512 * 1024))
  return { previa: previa?.jpeg ? previa : null, exif: exifSeguro(cabeca, arquivo.size) }
}

/**
 * Desenha a imagem no tamanho pedido, já na orientação certa. `orientacao` (EXIF, 1..8) é o giro que AINDA falta:
 * o navegador já aplica a orientação que a própria JPEG traz.
 */
function desenhar(fonte, largura, altura, lado, orientacao = 1) {
  const deitada = orientacao >= 5
  const l = deitada ? altura : largura
  const a = deitada ? largura : altura
  const k = Math.min(1, lado / Math.max(l, a))
  const tela = new OffscreenCanvas(Math.max(1, Math.round(l * k)), Math.max(1, Math.round(a * k)))
  const c = tela.getContext('2d', { alpha: false })
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  const L = tela.width
  const A = tela.height
  // as oito orientações do EXIF como matriz (a, b, c, d, e, f)
  const m = { 1: [1, 0, 0, 1, 0, 0], 2: [-1, 0, 0, 1, L, 0], 3: [-1, 0, 0, -1, L, A], 4: [1, 0, 0, -1, 0, A], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, L, 0], 7: [0, -1, -1, 0, L, A], 8: [0, -1, 1, 0, 0, A] }[orientacao] || [1, 0, 0, 1, 0, 0]
  c.setTransform(...m)
  c.drawImage(fonte, 0, 0, deitada ? A : L, deitada ? L : A)
  return tela
}

const jpeg = (tela, qualidade) => tela.convertToBlob({ type: 'image/jpeg', quality: qualidade })

servir({
  async identificar({ arquivos }) {
    const saida = []
    for (const arquivo of arquivos) {
      try {
        saida.push({ exif: exifSeguro(await bytes(arquivo, 0, Math.min(arquivo.size, CABECA_DO_ID)), arquivo.size) })
      } catch {
        // arquivo que não deu para ler (sumiu, sem permissão): entra sem data
        saida.push({ exif: { orientacao: 1 }, ilegivel: true })
      }
    }
    return saida
  },

  async miniatura({ arquivo, par, tipo, lados = {} }, { cancelado }) {
    const ladoMini = lados.mini || LADO_MINI
    const ladoPrevia = lados.previa || LADO_PREVIA
    let bitmap = null
    let falta = 1
    let origem = 'arquivo'
    let exif

    if (tipo === 'raw') {
      const r = await embutida(arquivo, ladoPrevia)
      exif = r.exif
      if (cancelado()) return null
      if (r.previa) {
        try {
          bitmap = await createImageBitmap(new Blob([r.previa.jpeg], { type: 'image/jpeg' }))
          origem = 'embutida'
          // a JPEG embutida às vezes traz a própria orientação (o navegador já girou); senão, vale a do RAW
          const dela = exifSeguro(r.previa.jpeg.subarray(0, 128 * 1024), r.previa.jpeg.length).orientacao || 1
          falta = dela === 1 ? exif.orientacao || 1 : 1
        } catch {
          bitmap = null
        }
      }
      // RAW sem prévia embutida mas com o JPEG da câmera ao lado: serve o par
      if (!bitmap && par) {
        try {
          bitmap = await createImageBitmap(par)
          origem = 'par'
        } catch {
          bitmap = null
        }
      }
    } else {
      exif = exifSeguro(await bytes(arquivo, 0, Math.min(arquivo.size, CABECA_DO_ID)), arquivo.size)
      try {
        bitmap = await createImageBitmap(arquivo) // o navegador aplica a orientação do EXIF
      } catch {
        // formato que este navegador não abre (HEIC fora do Safari, TIFF): tenta uma JPEG embutida
        const r = await embutida(arquivo, ladoPrevia).catch(() => null)
        if (r?.previa) {
          bitmap = await createImageBitmap(new Blob([r.previa.jpeg], { type: 'image/jpeg' })).catch(() => null)
          origem = 'embutida'
        }
      }
    }
    if (!bitmap) return { semPrevia: true, exif }
    if (cancelado()) {
      bitmap.close()
      return null
    }
    const previaTela = desenhar(bitmap, bitmap.width, bitmap.height, ladoPrevia, falta)
    bitmap.close()
    const miniTela = desenhar(previaTela, previaTela.width, previaTela.height, ladoMini)
    const [mini, previa] = await Promise.all([jpeg(miniTela, 0.8), jpeg(previaTela, 0.86)])
    return { mini, previa, proporcao: previaTela.width / previaTela.height, exif, origem }
  },

  async grande({ arquivo }) {
    const r = await embutida(arquivo, 0)
    if (!r.previa) return null
    const dela = exifSeguro(r.previa.jpeg.subarray(0, 128 * 1024), r.previa.jpeg.length).orientacao || 1
    // copia: a vista aponta para o pedaço lido do arquivo
    return { blob: new Blob([r.previa.jpeg.slice()], { type: 'image/jpeg' }), orientacao: dela === 1 ? r.exif.orientacao || 1 : 1, largura: r.previa.largura, altura: r.previa.altura }
  },

  async pixels({ blob, lado }) {
    const bitmap = await createImageBitmap(blob)
    const tela = desenhar(bitmap, bitmap.width, bitmap.height, lado || Math.max(bitmap.width, bitmap.height))
    bitmap.close()
    const c = tela.getContext('2d')
    const { data } = c.getImageData(0, 0, tela.width, tela.height)
    return comTransferencia({ largura: tela.width, altura: tela.height, rgba: data }, [data.buffer])
  },
})

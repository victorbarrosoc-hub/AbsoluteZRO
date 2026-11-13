// A máscara da marca-d'água, desenhada na hora num canvas: um texto (na Figtree da casa) ou uma imagem PNG. Sai o
// alfa de 0 a 1 que src/exportar/marca-dagua.js grava nos pixels; a cor é sempre branca (a marca de uma prova não
// precisa de cor, precisa aparecer em qualquer foto).
//
// PNG com transparência vale pelo alfa; PNG sem transparência vale pela luz (o branco aparece, o preto some).

const ALTURA_DO_TEXTO = 220

const tela = (l, a) => (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(l, a) : Object.assign(document.createElement('canvas'), { width: l, height: a }))

/** Texto → { largura, altura, dados: Float32Array }. */
export async function mascaraDeTexto(texto) {
  const t = String(texto || '').trim()
  if (!t) return null
  await document.fonts?.load?.(`600 ${ALTURA_DO_TEXTO}px "Figtree Variable"`).catch(() => {})
  const fonte = `600 ${ALTURA_DO_TEXTO}px "Figtree Variable", system-ui, sans-serif`
  const medir = tela(8, 8).getContext('2d')
  medir.font = fonte
  const m = medir.measureText(t)
  const margem = Math.round(ALTURA_DO_TEXTO * 0.12)
  const largura = Math.max(1, Math.ceil(m.width) + margem * 2)
  const altura = Math.round(ALTURA_DO_TEXTO * 1.3)
  const c = tela(largura, altura)
  const x = c.getContext('2d')
  x.font = fonte
  x.fillStyle = '#fff'
  x.textBaseline = 'middle'
  x.fillText(t, margem, altura / 2)
  return paraMascara(x.getImageData(0, 0, largura, altura), 'alfa')
}

/** Imagem (File/Blob PNG) → máscara. Lado maior limitado a 1600 px. */
export async function mascaraDeImagem(arquivo) {
  const bitmap = await createImageBitmap(arquivo)
  const k = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const largura = Math.max(1, Math.round(bitmap.width * k))
  const altura = Math.max(1, Math.round(bitmap.height * k))
  const c = tela(largura, altura)
  const x = c.getContext('2d')
  x.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()
  const dados = x.getImageData(0, 0, largura, altura)
  let opaca = true
  for (let i = 3; i < dados.data.length; i += 4) {
    if (dados.data[i] < 250) {
      opaca = false
      break
    }
  }
  return paraMascara(dados, opaca ? 'luz' : 'alfa')
}

function paraMascara({ width, height, data }, modo) {
  const dados = new Float32Array(width * height)
  for (let p = 0, i = 0; p < dados.length; p++, i += 4) {
    dados[p] = modo === 'alfa' ? data[i + 3] / 255 : (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
  }
  return { largura: width, altura: height, dados }
}

/** Impressão curta da máscara (entra na chave de idempotência: trocou a imagem, a saída é outra). */
export function impressao(mascara) {
  if (!mascara) return ''
  let h = 2166136261
  const passo = Math.max(1, Math.floor(mascara.dados.length / 4096))
  for (let i = 0; i < mascara.dados.length; i += passo) h = Math.imul(h ^ Math.round(mascara.dados[i] * 255), 16777619)
  return `${mascara.largura}x${mascara.altura}-${(h >>> 0).toString(36)}`
}

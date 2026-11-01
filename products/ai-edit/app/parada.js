// Uma imagem vira um clipe parado (MP4, sem som) para entrar na Mídia: a Mídia do editor é de vídeo e som, e assim a
// tela gerada com IA corta, apara, ganha zoom e sai no render como qualquer clipe. Tudo na máquina, pelo Mediabunny.

import { MB } from './midia.js'

const par = (n) => Math.max(2, Math.round(n / 2) * 2)

/** blob da imagem → File MP4 de `segundos` no tamanho da imagem (até 1920 no lado maior), no fps do projeto. */
export async function imagemParaClipe(blob, nome, { segundos = 5, fps = 30, maximo = 1920 } = {}) {
  const img = await createImageBitmap(blob)
  const k = Math.min(1, maximo / Math.max(img.width, img.height))
  const largura = par(img.width * k)
  const altura = par(img.height * k)
  const tela = new OffscreenCanvas(largura, altura)
  const ctx = tela.getContext('2d')
  ctx.drawImage(img, 0, 0, largura, altura)
  img.close?.()
  const codec = (await MB.canEncodeVideo('avc', { width: largura, height: altura }))
    ? 'avc'
    : (await MB.canEncodeVideo('vp9', { width: largura, height: altura }))
      ? 'vp9'
      : null
  if (!codec) throw new Error('este navegador não grava vídeo')
  const destino = new MB.BufferTarget()
  const saida = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: destino })
  const fonte = new MB.CanvasSource(tela, { codec, bitrate: MB.QUALITY_HIGH, keyFrameInterval: 1 })
  saida.addVideoTrack(fonte, { frameRate: fps })
  await saida.start()
  const n = Math.round(segundos * fps)
  for (let i = 0; i < n; i++) await fonte.add(i / fps, 1 / fps)
  await saida.finalize()
  return new File([destino.buffer], nome, { type: 'video/mp4' })
}

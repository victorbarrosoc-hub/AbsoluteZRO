// CAMZRO · a câmera e o microfone. Abre com o que a pessoa escolheu (lente, tamanho, cadência) e com o áudio CRU:
// sem cancelamento de eco, sem redução de ruído e sem ganho automático (o padrão do navegador é para chamada de
// vídeo e estraga o som de set). Lê de volta o que a câmera entregou de verdade e aplica os controles manuais que
// ela aceita (nucleo/controles.js).

import { lerCapacidades, restricoes, pontoDeInteresse } from '../nucleo/controles.js'

export const temCamera = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia)

/** Câmeras e microfones (os nomes só aparecem depois da permissão). */
export async function dispositivos() {
  const lista = await navigator.mediaDevices.enumerateDevices()
  return {
    cameras: lista.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, nome: d.label || `Câmera ${i + 1}` })),
    microfones: lista.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, nome: d.label || `Microfone ${i + 1}` })),
  }
}

/** Restrições de áudio de set: 48 kHz, estéreo quando houver, nada de processamento de chamada. */
export const audioCru = (microfone) => ({
  deviceId: microfone ? { exact: microfone } : undefined,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 24 },
  channelCount: { ideal: 2 },
  // Chrome antigo
  googEchoCancellation: false,
  googAutoGainControl: false,
  googNoiseSuppression: false,
  googHighpassFilter: false,
})

/**
 * Abre a câmera. pedido = { camera, voltada ('environment'|'user'), largura, altura, fps, microfone, comAudio }.
 * Devolve { stream, video, audio, ajustes, capacidades }. Se a câmera não tem o pedido, o navegador entrega o mais
 * perto (ideal); a tela mostra o que veio.
 */
export async function abrir(pedido) {
  const video = {
    width: { ideal: pedido.largura },
    height: { ideal: pedido.altura },
    frameRate: { ideal: pedido.fps, max: Math.max(pedido.fps, 30) },
    resizeMode: 'none',
  }
  if (pedido.camera) video.deviceId = { exact: pedido.camera }
  else video.facingMode = { ideal: pedido.voltada || 'environment' }
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video, audio: pedido.comAudio === false ? false : audioCru(pedido.microfone) })
  } catch (e) {
    // sem microfone (ou recusado): abre só a imagem, e a tela avisa
    if (pedido.comAudio !== false && /NotFound|NotAllowed|Overconstrained|NotReadable/.test(e?.name || '')) {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      stream.semAudio = e?.name || 'erro'
    } else throw e
  }
  const [faixaVideo] = stream.getVideoTracks()
  const [faixaAudio] = stream.getAudioTracks()
  try {
    faixaVideo.contentHint = 'detail'
  } catch {}
  return { stream, video: faixaVideo, audio: faixaAudio || null, ...ler(faixaVideo, faixaAudio) }
}

/** O que a câmera entregou e o que ela deixa controlar. */
export function ler(faixaVideo, faixaAudio) {
  const ajustes = faixaVideo.getSettings?.() || {}
  const caps = faixaVideo.getCapabilities?.() || {}
  const audio = faixaAudio?.getSettings?.() || null
  return {
    ajustes: {
      largura: ajustes.width,
      altura: ajustes.height,
      fps: ajustes.frameRate,
      camera: ajustes.deviceId,
      voltada: ajustes.facingMode || null,
      iso: ajustes.iso ?? null,
      tempo: Number.isFinite(ajustes.exposureTime) ? ajustes.exposureTime * 1e-4 : null,
      kelvin: ajustes.colorTemperature ?? null,
      foco: ajustes.focusDistance ?? null,
      zoom: ajustes.zoom ?? null,
      modoExposicao: ajustes.exposureMode || null,
      audio: audio ? { taxa: audio.sampleRate || null, canais: audio.channelCount || null, eco: audio.echoCancellation, ruido: audio.noiseSuppression, ganho: audio.autoGainControl } : null,
    },
    capacidades: lerCapacidades(caps, ajustes),
  }
}

/** Aplica os controles manuais (só o que a câmera aceita). Devolve o que ficou valendo. */
export async function aplicar(faixaVideo, capacidades, controles) {
  const r = restricoes(capacidades, controles)
  if (!Object.keys(r).length) return ler(faixaVideo).ajustes
  try {
    await faixaVideo.applyConstraints({ advanced: [r] })
  } catch {
    // alguma câmera recusa o pacote inteiro: tenta um por um
    for (const [k, v] of Object.entries(r)) {
      try {
        await faixaVideo.applyConstraints({ advanced: [{ [k]: v }] })
      } catch {}
    }
  }
  return ler(faixaVideo).ajustes
}

/** Toque para focar e expor no ponto (0–1). Só onde a câmera aceita pointsOfInterest (Android). */
export async function focarNoPonto(faixaVideo, capacidades, x, y) {
  if (!capacidades.pontos) return false
  const pedido = { pointsOfInterest: pontoDeInteresse(x, y) }
  if (capacidades.modoFoco.includes('single-shot')) pedido.focusMode = 'single-shot'
  else if (capacidades.modoFoco.includes('continuous')) pedido.focusMode = 'continuous'
  if (capacidades.modoExposicao.includes('continuous')) pedido.exposureMode = 'continuous'
  try {
    await faixaVideo.applyConstraints({ advanced: [pedido] })
    return true
  } catch {
    return false
  }
}

/** Fecha tudo (libera a câmera para outro app). */
export function fechar(stream) {
  for (const t of stream?.getTracks?.() || []) t.stop()
}

/** Mantém a tela acesa enquanto o app está aberto (Screen Wake Lock). Reacende quando a página volta. */
export function telaAcesa() {
  let trava = null
  const pedir = async () => {
    try {
      if (document.visibilityState === 'visible' && 'wakeLock' in navigator) trava = await navigator.wakeLock.request('screen')
    } catch {
      trava = null
    }
  }
  document.addEventListener('visibilitychange', pedir)
  pedir()
  return {
    ativa: () => Boolean(trava && !trava.released),
    soltar: () => {
      document.removeEventListener('visibilitychange', pedir)
      trava?.release?.()
    },
  }
}

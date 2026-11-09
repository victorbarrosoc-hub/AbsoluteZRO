// CAMZRO · gravação. Dois motores, o melhor que o navegador tiver:
//
// 1. WebCodecs (Mediabunny): codec, bitrate constante ou variável, quadro-chave (até só quadros-chave, para editar
//    leve), cadência CONSTANTE (o Mediabunny amostra a câmera no relógio da cadência: o editor não sofre com VFR) e
//    áudio PCM 24 bits a 48 kHz, como as câmeras de cinema. Grava em MP4 fragmentado direto no armazenamento (cada
//    ~1 s vira um fragmento que já abre sozinho: queda não leva o take) e, ao parar, fecha num MOV comum (sem
//    recompressão, só reempacota) para o DaVinci, Premiere e Final Cut.
// 2. MediaRecorder: o gravador simples do navegador (Safari antigo, Firefox). Bitrate pedido, sem controle de
//    quadro-chave nem cadência fixa. A ficha do clipe diz qual motor gravou.

import * as MB from '../vendor/mediabunny.min.mjs'
import { abrirParaGravar, escritorSimples, arquivo, apagar, salvarJson, FILA } from './armazem.js'

export const CODECS_VIDEO = [
  { id: 'hevc', rotulo: 'HEVC (H.265)', mime: 'hvc1' },
  { id: 'avc', rotulo: 'H.264', mime: 'avc1' },
  { id: 'av1', rotulo: 'AV1', mime: 'av01' },
  { id: 'vp9', rotulo: 'VP9', mime: 'vp09' },
]

/** O que este navegador grava neste tamanho e cadência. */
export async function oQueGrava({ largura, altura, fps, bitrate }) {
  const webcodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
  const codecs = {}
  if (webcodecs) {
    for (const c of CODECS_VIDEO) {
      try {
        codecs[c.id] = await MB.canEncodeVideo(c.id, { width: largura, height: altura, bitrate })
      } catch {
        codecs[c.id] = false
      }
    }
  }
  const audio = { 'pcm-s24': webcodecs, 'pcm-s16': webcodecs, aac: false, opus: false }
  if (webcodecs && typeof AudioEncoder !== 'undefined') {
    for (const a of ['aac', 'opus'])
      try {
        audio[a] = await MB.canEncodeAudio(a, { numberOfChannels: 2, sampleRate: 48000, bitrate: 256000 })
      } catch {
        audio[a] = false
      }
  }
  const mimes = typeof MediaRecorder === 'undefined' ? [] : ['video/mp4;codecs=hvc1,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].filter((m) => MediaRecorder.isTypeSupported(m))
  return { webcodecs: webcodecs && Object.values(codecs).some(Boolean), codecs, audio, mediaRecorder: mimes, fps }
}

/**
 * Começa a gravar. perfil = { motor, codec, bitrate, modoBitrate: 'constant'|'variable', quadroChave (s; 0 = só
 * quadros-chave), conteiner: 'mov'|'mp4', audio: 'pcm-s24'|'aac'|'opus'|null, fps }. aoMudar({ bytes, quadros,
 * perdidos, segundos }) a cada pacote (no máximo ~4 vezes por segundo).
 */
export async function gravar({ stream, nome, perfil, aoMudar = () => {}, aoErro = () => {} }) {
  const [video] = stream.getVideoTracks()
  const [som] = perfil.audio ? stream.getAudioTracks() : []
  if (!video) throw new Error('Sem câmera.')
  if (perfil.motor === 'mediarecorder' || !perfil.codec) return gravarComMediaRecorder({ stream, nome, perfil, aoMudar, aoErro })

  const arquivoGravando = `${nome}.gravando.mp4`
  const disco = await abrirParaGravar(arquivoGravando)
  try {
    return await iniciarWebCodecs({ video, som, perfil, aoMudar, aoErro, disco, arquivoGravando })
  } catch (e) {
    await disco.fechar().catch(() => {})
    await apagar(arquivoGravando)
    throw e
  }
}

async function iniciarWebCodecs({ video, som, perfil, aoMudar, aoErro, disco, arquivoGravando }) {
  const output = new MB.Output({
    format: new MB.Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
    target: new MB.StreamTarget(disco.writable),
  })
  const estado = { bytes: 0, quadros: 0, perdidos: 0, segundos: 0, inicio: 0, ultimoAviso: 0 }
  const quality = new MB.Quality({ bitrate: perfil.bitrate, bitrateMode: perfil.modoBitrate === 'constant' ? 'constant' : 'variable' })
  const fonteVideo = new MB.MediaStreamVideoTrackSource(
    video,
    {
      codec: perfil.codec,
      quality,
      keyFrameInterval: Math.max(0, perfil.quadroChave ?? 1),
      latencyMode: 'quality',
      onEncodedPacket: (p) => {
        estado.quadros++
        estado.bytes += p.byteLength
        estado.segundos = p.timestamp + p.duration
        const agora = performance.now()
        if (agora - estado.ultimoAviso > 250) {
          estado.ultimoAviso = agora
          // a cadência é constante: cada quadro tem o seu lugar na linha do tempo; buraco = quadro perdido
          estado.perdidos = Math.max(0, Math.round(estado.segundos * perfil.fps) - estado.quadros)
          aoMudar({ ...estado })
        }
      },
    },
    { frameRate: perfil.fps },
  )
  output.addVideoTrack(fonteVideo, { frameRate: perfil.fps })
  let fonteAudio = null
  if (som) {
    fonteAudio = new MB.MediaStreamAudioTrackSource(som, perfil.audio.startsWith('pcm') ? { codec: perfil.audio } : { codec: perfil.audio, quality: new MB.Quality({ bitrate: 256000 }) })
    output.addAudioTrack(fonteAudio)
  }
  output.setMetadataTags({ comment: 'CAMZRO', date: new Date() })
  const erros = [fonteVideo.errorPromise, fonteAudio?.errorPromise].filter(Boolean)
  Promise.race(erros).catch((e) => aoErro(e))
  await output.start()
  estado.inicio = performance.now()
  const inicioMs = Date.now()

  return {
    motor: 'webcodecs',
    protegido: disco.protegido,
    inicioMs,
    estado: () => ({ ...estado }),
    async parar() {
      // depois de um erro no meio do take, o fim do arquivo não fecha: cancela e fica com os fragmentos já gravados
      // (cada um abre sozinho). fecharTake() reempacota o que der.
      let completo = true
      try {
        await output.finalize()
      } catch {
        completo = false
        await output.cancel().catch(() => {})
      }
      const tamanho = await disco.fechar()
      estado.perdidos = Math.max(0, Math.round(estado.segundos * perfil.fps) - estado.quadros)
      return { arquivo: arquivoGravando, tamanho, quadros: estado.quadros, perdidos: estado.perdidos, segundos: estado.segundos, inicioMs, completo }
    },
    async cancelar() {
      try {
        await output.cancel()
      } catch {}
      try {
        await disco.fechar()
      } catch {}
    },
  }
}

async function gravarComMediaRecorder({ stream, nome, perfil, aoMudar, aoErro }) {
  const mime = perfil.mime || ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || ''
  const ext = /webm/.test(mime) ? 'webm' : 'mp4'
  const arquivoGravando = `${nome}.gravando.${ext}`
  const disco = await abrirParaGravar(arquivoGravando)
  try {
    return iniciarMediaRecorder({ stream, perfil, aoMudar, aoErro, disco, arquivoGravando, mime, ext })
  } catch (e) {
    await disco.fechar().catch(() => {})
    await apagar(arquivoGravando)
    throw e
  }
}

function iniciarMediaRecorder({ stream, perfil, aoMudar, aoErro, disco, arquivoGravando, mime, ext }) {
  const faixas = perfil.audio ? stream.getTracks() : stream.getVideoTracks()
  const rec = new MediaRecorder(new MediaStream(faixas), { mimeType: mime || undefined, videoBitsPerSecond: perfil.bitrate, audioBitsPerSecond: 256000 })
  const estado = { bytes: 0, quadros: 0, perdidos: 0, segundos: 0 }
  let fila = Promise.resolve()
  const inicio = performance.now()
  rec.ondataavailable = (e) => {
    if (!e.data?.size) return
    estado.bytes += e.data.size
    estado.segundos = (performance.now() - inicio) / 1000
    estado.quadros = Math.round(estado.segundos * perfil.fps)
    fila = fila.then(() => disco.anexar(e.data)).catch(aoErro)
    aoMudar({ ...estado })
  }
  rec.onerror = (e) => aoErro(e.error || new Error('O gravador do navegador parou.'))
  const parou = new Promise((r) => (rec.onstop = r))
  rec.start(1000)
  const inicioMs = Date.now()
  return {
    motor: 'mediarecorder',
    mime: rec.mimeType || mime,
    protegido: disco.protegido,
    inicioMs,
    estado: () => ({ ...estado }),
    async parar() {
      if (rec.state !== 'inactive') rec.stop()
      await parou
      await fila
      const tamanho = await disco.fechar()
      estado.segundos = (performance.now() - inicio) / 1000
      return { arquivo: arquivoGravando, tamanho, quadros: Math.round(estado.segundos * perfil.fps), perdidos: 0, segundos: estado.segundos, inicioMs, ext }
    },
    async cancelar() {
      try {
        rec.stop()
      } catch {}
      try {
        await disco.fechar()
      } catch {}
    },
  }
}

/**
 * Fecha o take: o MP4 fragmentado vira um MOV (ou MP4) comum, com o índice no começo do arquivo, sem recomprimir.
 * Só apaga o fragmentado depois de conferir que o novo tem a mesma duração (±1 quadro). Se faltar espaço ou der
 * erro, o fragmentado fica com o nome final (abre do mesmo jeito; o fechamento pode ser refeito depois).
 */
export async function fecharTake({ nome, arquivoGravando, conteiner = 'mov', fps, aoProgresso = () => {} }) {
  const destino = `${nome}.${conteiner}`
  const origem = await arquivo(arquivoGravando)
  const entrada = new MB.Input({ source: new MB.BlobSource(origem), formats: MB.ALL_FORMATS })
  let w = null
  try {
    const duracaoOrigem = await entrada.computeDuration()
    w = await escritorSimples(destino)
    const saida = new MB.Output({
      format: conteiner === 'mov' ? new MB.MovOutputFormat({ fastStart: false }) : new MB.Mp4OutputFormat({ fastStart: false }),
      target: new MB.StreamTarget(new WritableStream({ write: (c) => w.write({ type: 'write', position: c.position, data: c.data }) }, FILA)),
    })
    const conv = await MB.Conversion.init({ input: entrada, output: saida, showWarnings: false })
    if (!conv.isValid) throw new Error('Não deu para fechar este take sem recomprimir.')
    conv.onProgress = (p) => aoProgresso(p)
    await conv.execute()
    await w.close()
    w = null
    const conferir = new MB.Input({ source: new MB.BlobSource(await arquivo(destino)), formats: MB.ALL_FORMATS })
    const duracao = await conferir.computeDuration()
    if (Math.abs(duracao - duracaoOrigem) > 1.5 / fps) throw new Error('A duração do arquivo fechado não bate.')
    await apagar(arquivoGravando)
    return { arquivo: destino, duracao, fechado: true }
  } catch (e) {
    await w?.abort().catch(() => {})
    await apagar(destino)
    // sem fechar: renomeia o fragmentado (cópia + apagar; o OPFS não renomeia em todos os navegadores)
    const final = `${nome}.mp4`
    const w = await escritorSimples(final)
    await w.write(origem)
    await w.close()
    await apagar(arquivoGravando)
    let duracao = 0
    try {
      duracao = await new MB.Input({ source: new MB.BlobSource(await arquivo(final)), formats: MB.ALL_FORMATS }).computeDuration()
    } catch {}
    return { arquivo: final, duracao, fechado: false, erro: String(e?.message || e) }
  }
}

/** Grava o sidecar ao lado do clipe. */
export const gravarSidecar = (nome, s) => salvarJson(`${nome}.json`, s)

/** Lê duração, quadros e codecs de um arquivo (para a ficha e para recuperar takes). */
export async function ficha(file) {
  const entrada = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS })
  const v = await entrada.getPrimaryVideoTrack()
  const a = await entrada.getPrimaryAudioTrack()
  const duracao = await entrada.computeDuration()
  let fps = null
  if (v) {
    try {
      const st = await v.computePacketStats(240)
      fps = st.averagePacketRate
    } catch {}
  }
  return {
    duracao,
    video: v ? { codec: v.codec, largura: v.displayWidth, altura: v.displayHeight, fps } : null,
    audio: a ? { codec: a.codec, taxa: a.sampleRate, canais: a.numberOfChannels } : null,
  }
}

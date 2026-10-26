// Autoteste do app (teste de fumaça do instalador no CI e testes de tela): grava um vídeo de 6 s com fala sintética
// e pausas, lê de volta, acha os silêncios, aprova os cortes, exporta para os editores e renderiza o vídeo final com
// legenda. Tudo pelo mesmo código do app, sem internet (a transcrição real fica para os testes que podem baixar o modelo).

import { MB, lerInfo, extrairAudio } from './midia.js'
import { envelope } from '../src/analise/silencio.js'
import { proporCortes } from '../src/propostas.js'
import { prepararPreset } from '../src/preset.js'
import { aprovar, comPropostas, comTranscricao, novoProjeto, numeros, palavrasNaLinha } from '../src/projeto.js'
import { agrupar } from '../src/legenda.js'
import { pacote } from '../src/exportar/index.js'
import { renderizar, codecsDaMaquina } from './render.js'

/** Fala sintética: tom com envelope nos trechos de "palavra", quase silêncio nas pausas. */
const ROTEIRO = [
  [0.3, 0],
  [1.2, 1],
  [1.0, 0],
  [1.5, 1],
  [0.8, 0],
  [1.2, 1],
]

export async function videoDeTeste({ largura = 640, altura = 360, fps = 30 } = {}) {
  const codecs = await codecsDaMaquina(largura, altura)
  const tela = new OffscreenCanvas(largura, altura)
  const ctx = tela.getContext('2d')
  const saida = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.BufferTarget() })
  const v = new MB.CanvasSource(tela, { codec: codecs.video, bitrate: 1e6 })
  const a = new MB.AudioBufferSource({ codec: codecs.audio, bitrate: 96_000 })
  saida.addVideoTrack(v, { frameRate: fps })
  saida.addAudioTrack(a)
  await saida.start()
  const total = ROTEIRO.reduce((s, [d]) => s + d, 0)
  for (let k = 0; k < Math.round(total * fps); k++) {
    ctx.fillStyle = `hsl(${(k * 3) % 360} 40% 30%)`
    ctx.fillRect(0, 0, largura, altura)
    ctx.fillStyle = '#fff'
    ctx.font = '48px sans-serif'
    ctx.fillText(String(k), 40, 80)
    await v.add(k / fps, 1 / fps)
  }
  const taxa = 48000
  const buf = new AudioBuffer({ length: Math.round(total * taxa), numberOfChannels: 2, sampleRate: taxa })
  let t = 0
  const palavras = []
  for (const [d, fala] of ROTEIRO) {
    const i0 = Math.round(t * taxa)
    const n = Math.round(d * taxa)
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < n; i++) ch[i0 + i] = fala ? 0.3 * Math.sin((Math.PI * i) / n) ** 0.3 * Math.sin((2 * Math.PI * 220 * i) / taxa) : 0.001 * (Math.random() - 0.5)
    }
    if (fala) palavras.push({ texto: `palavra${palavras.length + 1}`, ini: t, fim: t + d })
    t += d
  }
  await a.add(buf)
  await saida.finalize()
  return { arquivo: new File([saida.target.buffer], 'teste.mp4', { type: 'video/mp4' }), palavras, total }
}

export async function autoteste() {
  const t0 = performance.now()
  const r = { desktop: Boolean(globalThis.aiEditDesktop?.isDesktop), isolado: globalThis.crossOriginIsolated === true }
  try {
    r.codecs = await codecsDaMaquina(640, 360)
    const { arquivo, palavras, total } = await videoDeTeste()
    const entrada = { arquivo, nome: arquivo.name }
    const info = await lerInfo(entrada)
    r.info = { duracao: Math.round(info.duracao * 100) / 100, video: info.temVideo, audio: info.temAudio, fps: info.fps }
    const { pcm, taxa, duracao } = await extrairAudio(entrada)
    const preset = prepararPreset(await fetch(new URL('../presets/fala.v1.json', import.meta.url)).then((x) => x.json()))
    const db = envelope(pcm, taxa)
    const cortes = proporCortes({ midia: 'm1', db, palavras, preset: preset.cortes, duracao })
    r.cortes = cortes.length
    let p = novoProjeto({ nome: 'Autoteste', midias: [{ id: 'm1', nome: 'teste.mp4', ...info }], preset })
    p = comTranscricao(p, 'm1', { modelo: 'autoteste', palavras })
    p = comPropostas(p, cortes, ['silencio', 'respiro'])
    p = aprovar(
      p,
      cortes.map((c) => c.id),
    )
    r.duracao = { original: total, final: Math.round(numeros(p).final * 100) / 100 }
    r.arquivos = pacote(p, preset.legenda).map((a) => a.name)
    const alvo = new MB.BufferTarget()
    const blocos = agrupar(palavrasNaLinha(p), preset.legenda)
    const rr = await renderizar(p, { entradas: new Map([['m1', entrada]]), destino: alvo, blocos, legenda: { ligada: true, estilo: 'destaque', posicaoY: 0.8 } })
    const volta = await lerInfo({ arquivo: new File([alvo.buffer], 'saida.mp4') })
    r.render = { segundos: Math.round(rr.segundos * 100) / 100, quadros: rr.quadros, duracao: Math.round(volta.duracao * 100) / 100, video: volta.temVideo, audio: volta.temAudio, codecs: rr.codecs }
    r.ok = r.cortes >= 2 && r.duracao.final < total - 1 && r.arquivos.length >= 5 && volta.temVideo && volta.temAudio && Math.abs(volta.duracao - r.duracao.final) < 0.2
  } catch (err) {
    r.erro = String(err?.stack || err)
    r.ok = false
  }
  r.ms = Math.round(performance.now() - t0)
  return r
}

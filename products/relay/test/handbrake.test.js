// Presets do HandBrake viram fichas do Relay, e o que fica de fora é dito (src/handbrake.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doHandBrake, ehHandBrake } from '../src/handbrake.js'
import { importar } from '../src/personalizado.js'

// recorte do que o HandBrake 1.8 exporta (Presets → Exportar)
const hb = (o = {}) => ({
  PresetName: 'Padrão Maior Tamanho 4K',
  FileFormat: 'av_mp4',
  VideoEncoder: 'x264',
  VideoQualityType: 2,
  VideoQualitySlider: 18,
  VideoAvgBitrate: 6000,
  VideoFramerate: '23.976',
  VideoFramerateMode: 'cfr',
  VideoPreset: 'slow',
  VideoTune: '',
  VideoProfile: 'auto',
  PictureWidth: 0,
  PictureHeight: 0,
  PictureKeepRatio: true,
  PictureCropMode: 2,
  PictureRotate: 'angle=0:hflip=0',
  PictureDeinterlaceFilter: 'off',
  PictureDenoiseFilter: 'off',
  PictureDenoisePreset: 'light',
  PictureSharpenFilter: 'off',
  PictureSharpenPreset: 'medium',
  PictureDeblockPreset: 'off',
  SubtitleTrackSelectionBehavior: 'none',
  ChapterMarkers: true,
  AudioList: [{ AudioEncoder: 'ca_aac', AudioBitrate: 320, AudioMixdown: 'stereo', AudioSamplerate: 'auto', AudioTrackGainSlider: 0, AudioTrackDRCSlider: 0 }],
  ...o,
})
const arquivo = (...p) => ({ PresetList: p, VersionMajor: 59 })

test('reconhece o arquivo do HandBrake', () => {
  assert.ok(ehHandBrake(arquivo(hb())))
  assert.ok(!ehHandBrake({ relay: 'presets', presets: [] }))
  assert.throws(() => doHandBrake({}), /HandBrake/)
})

test('RF, 23,976 exato, tamanho original, AAC 320 e x264 lento viram o preset do Relay', () => {
  const { fichas, deixados } = doHandBrake(arquivo(hb(), hb({ PresetName: 'Padrão Menor Tamanho 4K', VideoQualitySlider: 22 })))
  const { presets, recusados } = importar(fichas)
  assert.equal(recusados, 0)
  const [maior, menor] = presets
  assert.equal(maior.nome, 'Padrão Maior Tamanho 4K')
  assert.equal(maior.video.codec, 'avc')
  assert.equal(maior.video.rf, true)
  assert.equal(maior.video.crf, 18)
  assert.equal(menor.video.crf, 22)
  assert.equal(maior.video.fpsExato, 23.976)
  assert.equal(maior.video.ladoMenor, null)
  assert.deepEqual(maior.audio, { codec: 'aac', kbps: 320, taxa: 48000, canais: 2 })
  assert.equal(maior.computador, undefined) // lento = o padrão do Relay
  assert.match(maior.resumo, /H\.264 · Original · 23,976 fps · RF 18/)
  // nunca calado: capítulos e o RF no navegador
  assert.ok(deixados['Padrão Maior Tamanho 4K'].includes('marcadores de capítulo'))
  assert.ok(deixados['Padrão Maior Tamanho 4K'].some((d) => /RF 18 só no computador/.test(d)))
})

test('bitrate médio, HEVC, teto de 1080p, cadência no máximo, filtros e pastas', () => {
  const pasta = { Folder: true, ChildrenArray: [hb({ PresetName: 'Entrega', VideoEncoder: 'x265_10bit', VideoQualityType: 1, VideoAvgBitrate: 12000, PictureWidth: 1920, PictureHeight: 1080, VideoFramerate: '30', VideoFramerateMode: 'pfr', VideoPreset: 'veryslow', VideoTune: 'film', PictureDeinterlaceFilter: 'yadif', PictureDenoiseFilter: 'nlmeans', PictureDenoisePreset: 'medium', PictureRotate: 'angle=90:hflip=1', SubtitleTrackSelectionBehavior: 'first', AudioList: [] })] }
  const { fichas, deixados } = doHandBrake(arquivo(pasta))
  const [p] = importar(fichas).presets
  assert.equal(p.video.codec, 'hevc')
  assert.equal(p.video.bitrateFixo, 12000)
  assert.equal(p.video.ladoMenor, 1080)
  assert.equal(p.video.fpsMax, 30)
  assert.equal(p.video.fpsExato, undefined)
  assert.equal(p.video.giro, 90)
  assert.equal(p.video.espelhar, true)
  assert.equal(p.semAudio, true)
  assert.deepEqual(p.computador, { velocidade: 'veryslow', ajuste: 'film', perfil: null, desentrelacar: true, ruido: 2, nitidez: 0, loudness: null })
  assert.ok(deixados.Entrega.includes('sai em 8 bits'))
  assert.ok(deixados.Entrega.includes('legendas'))
})

test('MKV, cadência fora da lista e taxa diferente viram aviso', () => {
  const { fichas, deixados } = doHandBrake(arquivo(hb({ FileFormat: 'av_mkv', VideoFramerate: '15', AudioList: [{ AudioEncoder: 'av_aac', AudioBitrate: 200, AudioMixdown: '5point1', AudioSamplerate: '32' }] })))
  const [p] = importar(fichas).presets
  assert.equal(p.formato, 'mp4')
  assert.equal(p.video.fpsExato, 23.976)
  assert.equal(p.audio.kbps, 192)
  const d = deixados['Padrão Maior Tamanho 4K']
  assert.ok(d.some((x) => /MKV/.test(x)))
  assert.ok(d.some((x) => /15 fps virou 23,976/.test(x)))
  assert.ok(d.some((x) => /5point1/.test(x)))
})

// na tela: "Trazer" em Meus aceita o .json do HandBrake e diz o que ficou de fora
test('Trazer o arquivo do HandBrake em Meus', async () => {
  const { abrir, pasta } = await import('./apoio.js')
  const { writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const caminho = join(pasta, 'handbrake.json')
  writeFileSync(caminho, JSON.stringify(arquivo(hb(), hb({ PresetName: 'Padrão Menor Tamanho 4K', VideoQualitySlider: 22 }))))
  const s = await abrir()
  try {
    const p = await s.nova('/converter?aba=Meus')
    await p.waitForFunction(() => window.relayPronto)
    await p.setInputFiles('.meus-acoes input[type="file"]', caminho)
    await p.waitForFunction(() => /trazidos/.test(document.getElementById('aviso-meus')?.textContent ?? ''))
    const aviso = await p.textContent('#aviso-meus')
    assert.match(aviso, /2 presets trazidos\. Ficou de fora: .*marcadores de capítulo/)
    assert.match(await p.textContent('#presets'), /Padrão Maior Tamanho 4K/)
    assert.match(await p.textContent('#presets'), /RF 22/)
  } finally {
    await s.fechar()
  }
})

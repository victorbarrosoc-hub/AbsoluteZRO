// Motor do computador: a linha de comando do plano e uma conversão de verdade com o ffmpeg do sistema.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argsFfmpeg, filtroVideo } from '../src/ffmpeg.js'
import { planejar } from '../src/plano.js'

const origem = { largura: 3840, altura: 2160, fps: 50, duracao: 2, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: null }
const temFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

test('CRF do x264 slow sem teto, GOP de 2 s, marcado 1-1-1', () => {
  const plano = planejar(origem, 'youtube-1080', { motor: 'computador' })
  const [args] = argsFfmpeg(plano, { input: 'a.mov', output: 'b.mp4', origem })
  const s = args.join(' ')
  assert.match(s, /-c:v libx264 -preset slow -crf 17 -profile:v high/) // CRF livre, sem teto
  assert.doesNotMatch(s, /-maxrate/)
  const zap = argsFfmpeg(planejar(origem, 'whatsapp', { motor: 'computador' }), { input: 'a.mov', output: 'b.mp4', origem })[0].join(' ')
  assert.match(zap, /-crf 22 -maxrate 4500k -bufsize 9000k/) // WhatsApp: o tamanho importa
  assert.match(s, /-g 100 /) // 50 fps × 2 s (cadência mantida: 50 ≤ 60)
  assert.match(s, /-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv/)
  assert.match(s, /scale=1920:1080:flags=lanczos\+accurate_rnd\+full_chroma_int:in_color_matrix=bt709:in_range=tv:out_color_matrix=bt709/)
  assert.match(s, /-movflags \+faststart -f mp4 b\.mp4$/)
})

test('tela fixa: faixas (pad) ou corte (crop); cadência dividida no filtro fps', () => {
  const faixas = planejar(origem, 'reels')
  assert.match(filtroVideo(faixas), /force_original_aspect_ratio=decrease.*pad=1080:1920/)
  assert.match(filtroVideo(faixas), /fps=25/)
  const corte = planejar(origem, 'reels', { preencher: true })
  assert.match(filtroVideo(corte), /force_original_aspect_ratio=increase.*crop=1080:1920/)
})

test('tamanho máximo = duas passadas com bitrate médio', () => {
  const plano = planejar({ ...origem, duracao: 60 }, 'discord')
  const passes = argsFfmpeg(plano, { input: 'a.mov', output: 'b.mp4', origem, log: '/tmp/x' })
  assert.equal(passes.length, 2)
  assert.ok(passes[0].includes('-pass') && passes[0].includes('1'))
  assert.ok(passes[1].includes('2'))
  assert.ok(!passes[0].includes('-crf'))
})

test('HEVC sai com a tag hvc1 (a que o QuickTime e o iPhone abrem)', () => {
  const plano = planejar(origem, 'hevc')
  const [args] = argsFfmpeg(plano, { input: 'a.mov', output: 'b.mp4', origem })
  assert.ok(args.join(' ').includes('-tag:v hvc1'))
})

test('áudio: MP3 pelo LAME, WAV em 24 bits', () => {
  const mp3 = argsFfmpeg(planejar(origem, 'mp3'), { input: 'a.mov', output: 'b.mp3', origem })[0].join(' ')
  assert.match(mp3, /-vn .*-c:a libmp3lame -b:a 320k/)
  const wav = argsFfmpeg(planejar(origem, 'wav'), { input: 'a.mov', output: 'b.wav', origem })[0].join(' ')
  assert.match(wav, /-c:a pcm_s24le -ar 48000/)
})

test('conversão de verdade: 4K 50 fps → Reels 1080×1920, 25 fps, BT.709, AAC', { skip: !temFfmpeg && 'sem ffmpeg' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-'))
  try {
    const entrada = join(dir, 'master.mov')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=3840x2160:r=50:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2:sample_rate=48000', '-c:v', 'prores_ks', '-profile:v', '1', '-c:a', 'pcm_s16le', entrada])
    const plano = planejar(origem, 'reels', { motor: 'computador' })
    const saida = join(dir, 'reels.mp4')
    for (const a of argsFfmpeg(plano, { input: entrada, output: saida, origem })) execFileSync('ffmpeg', a, { stdio: 'pipe' })
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', saida]).toString())
    const v = info.streams.find((s) => s.codec_type === 'video')
    const a = info.streams.find((s) => s.codec_type === 'audio')
    assert.equal(v.codec_name, 'h264')
    assert.equal(v.profile, 'High')
    assert.deepEqual([v.width, v.height], [1080, 1920])
    assert.equal(v.avg_frame_rate, '25/1')
    assert.equal(v.color_primaries, 'bt709')
    assert.equal(v.color_transfer, 'bt709')
    assert.equal(v.color_space, 'bt709')
    assert.equal(a.codec_name, 'aac')
    assert.equal(a.sample_rate, '48000')
    assert.ok(statSync(saida).size > 10_000)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tamanho máximo de verdade: o arquivo cabe no limite', { skip: !temFfmpeg && 'sem ffmpeg' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-'))
  try {
    const entrada = join(dir, 'master.mov')
    const o = { ...origem, largura: 1920, altura: 1080, fps: 30, duracao: 4 }
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'mandelbrot=s=1920x1080:r=30', '-f', 'lavfi', '-i', 'anoisesrc=d=4:r=48000', '-t', '4', '-c:v', 'prores_ks', '-profile:v', '1', '-c:a', 'pcm_s16le', entrada])
    const plano = planejar(o, 'tamanho', { tamanhoMB: 1, motor: 'computador' })
    const saida = join(dir, 'pequeno.mp4')
    for (const a of argsFfmpeg(plano, { input: entrada, output: saida, origem: o, log: join(dir, 'passe') })) execFileSync('ffmpeg', a, { stdio: 'pipe' })
    assert.ok(statSync(saida).size <= 1e6, `${statSync(saida).size} bytes`)
    assert.ok(statSync(saida).size > 0.6e6, 'usa o espaço que tem')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

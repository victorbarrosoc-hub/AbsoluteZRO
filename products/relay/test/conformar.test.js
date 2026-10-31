// "Interpretar" a cadência (como o Footage FPS / Interpret Footage do After Effects): todos os quadros ficam, só a
// velocidade muda. Conta pura do plano e do ffmpeg, e no Chromium um 60 fps vira 24 (câmera lenta, sem som) e um 24 vira
// 23,976 (o som acompanha), conferidos pelo ffprobe.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { conformacao, fichaTecnica, planejar } from '../src/plano.js'
import { especificacaoDe, presetPersonalizado } from '../src/personalizado.js'
import { argsFfmpeg } from '../src/ffmpeg.js'
import { abrir, converterNoNavegador, ff, pasta, sondar, temFfmpeg } from './apoio.js'

const meu = (fps) => presetPersonalizado({ nome: 'Interpretado', base: 'youtube-1080', fps, fpsModo: 'conformar' })
const origem = (fps) => ({ largura: 1920, altura: 1080, fps, duracao: 10, temVideo: true, temAudio: true, canais: 2, taxa: 48000 })

test('plano: todos os quadros, duração nova, som só até 5% de diferença; a ficha volta igual', () => {
  const lento = planejar(origem(59.94), meu(23.976))
  assert.equal(lento.video.conforme.fator, 2.5)
  assert.equal(lento.video.fps, null, 'sem fps no motor: nenhum quadro sai nem repete')
  assert.equal(lento.audio, null)
  assert.match(lento.avisos.join(' '), /40% da velocidade\. O som fica de fora/)
  const ntsc = planejar(origem(24), meu(23.976))
  assert.ok(Math.abs(ntsc.audio.conforme - 1.001) < 1e-5)
  assert.match(fichaTecnica(ntsc).find((l) => l[0] === 'Cadência')[1], /23,976 fps interpretados .*99,9%/)
  assert.equal(conformacao(25, 25).fator, 1)
  assert.throws(() => planejar({ ...origem(null) }, meu(24)), /Sem a cadência do arquivo/)
  assert.deepEqual([especificacaoDe(meu(24)).fps, especificacaoDe(meu(24)).fpsModo], [24, 'conformar'])
})

test('ffmpeg: setpts com o fator e a cadência nova; o som com asetrate', () => {
  const a = argsFfmpeg(planejar(origem(24), meu(23.976)), 'in.mov', 'out.mp4').join(' ')
  assert.match(a, /setpts=PTS\*24\/\(24000\/1001\),fps=24000\/1001/)
  assert.match(a, /asetrate=47952,aresample=48000/)
})

const pular = !temFfmpeg && 'sem ffmpeg'
let s
before(async () => {
  if (!temFfmpeg) return
  ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=60:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2:sample_rate=48000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(pasta, 'sessenta.mp4'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2:sample_rate=48000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(pasta, 'vinte-e-quatro.mp4'))
  s = await abrir()
})
after(async () => s?.fechar())

const quadros = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString().trim())

test('no navegador: 60 → 24 fps vira câmera lenta com os 120 quadros; 24 → 23,976 com o som junto', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  await p.waitForFunction(() => window.relayPronto)
  const lento = await converterNoNavegador(p, 'sessenta.mp4', meu(24))
  let info = sondar(lento.caminho)
  assert.equal(quadros(lento.caminho), 120)
  assert.ok(Math.abs(Number(info.format.duration) - 5) < 0.1, `duração ${info.format.duration}`)
  assert.equal(info.streams.filter((x) => x.codec_type === 'audio').length, 0)
  assert.match(info.streams[0].r_frame_rate, /^24\/1$|^24000\/1000$/)

  const ntsc = await converterNoNavegador(p, 'vinte-e-quatro.mp4', meu(23.976))
  info = sondar(ntsc.caminho)
  assert.equal(quadros(ntsc.caminho), 48)
  const v = info.streams.find((x) => x.codec_type === 'video')
  const a = info.streams.find((x) => x.codec_type === 'audio')
  assert.ok(a, 'o som acompanha')
  assert.ok(Math.abs(Number(v.duration) - 2.002) < 0.05, `vídeo ${v.duration}`)
  assert.ok(Math.abs(Number(a.duration) - 2.002) < 0.06, `som ${a.duration}`)
  await p.close()
  assert.deepEqual(s.erros, [])
})

// Transparência e fundo chroma (01/11/2026, pedido do titular para o motion e o AEON): o Relay mantém o alfa (WebM VP9
// no navegador, ProRes 4444 no computador) ou põe a cor chroma atrás dele (H.264). Conta pura do plano e do ffmpeg, e o
// resultado medido pixel a pixel: a metade transparente do arquivo sai com alfa 0, ou verde chroma.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fichaTecnica, nomeSaida, planejar } from '../src/plano.js'
import { argsFfmpeg } from '../src/ffmpeg.js'
import { abrir, converterNoNavegador, ff, pasta, sondar, temFfmpeg } from './apoio.js'

const origem = (extra = {}) => ({ largura: 1920, altura: 1080, fps: 30, duracao: 10, temVideo: true, temAudio: true, canais: 2, taxa: 48000, transparente: true, ...extra })
const linha = (plano, rotulo) => fichaTecnica(plano).find((l) => l[0] === rotulo)?.[1]

test('plano: Transparente sai em WebM VP9 com alfa e Opus; a ficha diz o fundo', () => {
  const p = planejar(origem(), 'alfa-webm')
  assert.equal(p.formato, 'webm')
  assert.equal(p.video.codec, 'vp9')
  assert.equal(p.video.alfa, true)
  assert.equal(p.audio.codec, 'opus')
  assert.equal(linha(p, 'Fundo'), 'transparente (canal alfa)')
  assert.equal(nomeSaida('logo.mov', 'alfa-webm'), 'logo (Transparente).webm')
  assert.match(planejar(origem({ transparente: false }), 'alfa-webm').avisos.join(' '), /não tem transparência/)
})

test('plano: ProRes 4444 só no computador, com o tamanho da tabela da Apple', () => {
  assert.throws(() => planejar(origem(), 'alfa-prores'), (e) => e.codigo === 'computador' && /Máxima qualidade/.test(e.message))
  const p = planejar(origem(), 'alfa-prores', { motor: 'computador' })
  assert.equal(p.formato, 'mov')
  assert.ok(Math.abs(p.video.bitrate - 330e6 * (30 / 29.97)) < 1e3)
  assert.equal(linha(p, 'Vídeo'), 'ProRes 4444 com alfa')
  assert.equal(nomeSaida('logo.webm', 'alfa-prores'), 'logo (ProRes 4444).mov')
})

test('plano: fundo verde e azul em H.264, com a cor na ficha', () => {
  const verde = planejar(origem(), 'chroma-verde')
  assert.equal(verde.video.fundo, '#00B140')
  assert.equal(verde.video.alfa, false)
  assert.equal(linha(verde, 'Fundo'), 'verde chroma #00B140')
  assert.equal(linha(planejar(origem(), 'chroma-azul'), 'Fundo'), 'azul chroma #0047BB')
  assert.match(planejar(origem({ transparente: false }), 'chroma-verde').avisos.join(' '), /o fundo chroma não aparece/)
})

test('ffmpeg: ProRes 4444 e VP9 com alfa no software; chroma com a cor atrás e o vídeo antes do áudio', () => {
  const comp = (id) => argsFfmpeg(planejar(origem(), id, { motor: 'computador' }), { input: 'a.mov', output: 'b', origem: { fps: 30 }, encoder: 'h264_videotoolbox' })[0].join(' ')
  const prores = comp('alfa-prores')
  assert.match(prores, /-c:v prores_ks -profile:v 4444 -alpha_bits 16/)
  assert.match(prores, /format=yuva444p10le/)
  assert.match(prores, /-c:a pcm_s24le .* -f mov b$/)
  const vp9 = comp('alfa-webm')
  assert.match(vp9, /format=yuva420p/)
  assert.match(vp9, /-c:v libvpx-vp9 .*-auto-alt-ref 0/)
  assert.match(vp9, /-c:a libopus .* -f webm b$/)
  const verde = comp('chroma-verde')
  assert.match(verde, /-filter_complex color=c=0x00B140:s=1920x1080:r=30,format=rgba\[fundo\];\[0:v\].*format=rgba\[imagem\];\[fundo\]\[imagem\]overlay/)
  assert.match(verde, /-map \[v\] .*-map 0:a:0\?/)
  assert.match(verde, /-c:v libx264/, 'chroma no x264 mesmo no modo rápido')
})

const pular = !temFfmpeg && 'sem ffmpeg'
// metade esquerda opaca (testsrc2), metade direita transparente
const metade = "format=yuva444p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(X,W/2),255,0)'"
/** RGBA de um ponto do primeiro quadro (média de 2×2). */
const pixel = (arquivo, x, y, decod = []) =>
  execFileSync('ffmpeg', ['-v', 'error', ...decod, '-i', arquivo, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y},format=rgba,scale=1:1`, '-f', 'rawvideo', '-']).toJSON().data

let s
before(async () => {
  if (!temFfmpeg) return
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=1', '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=48000', '-vf', `${metade},format=yuva420p`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '2M', '-c:a', 'libopus', join(pasta, 'alfa.webm'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=1', '-vf', `${metade},format=yuva444p10le`, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', join(pasta, 'alfa.mov'))
  s = await abrir()
})
after(async () => s?.fechar())

test('no computador (ffmpeg): ProRes 4444 e WebM guardam o alfa; o chroma pinta a transparência de verde', { skip: pular }, () => {
  const info = { largura: 320, altura: 180, fps: 24, duracao: 1, temVideo: true, temAudio: false, transparente: true }
  const rodar = (id, ext) => {
    const saida = join(pasta, `comp-${id}.${ext}`)
    for (const args of argsFfmpeg(planejar(info, id, { motor: 'computador' }), { input: join(pasta, 'alfa.mov'), output: saida, origem: info })) execFileSync('ffmpeg', args, { stdio: 'pipe' })
    return saida
  }
  const prores = rodar('alfa-prores', 'mov')
  const v = sondar(prores).streams[0]
  assert.equal(v.codec_name, 'prores')
  assert.equal(v.pix_fmt, 'yuva444p12le', 'ProRes 4444 com alfa')
  assert.equal(pixel(prores, 40, 20)[3], 255)
  assert.equal(pixel(prores, 280, 20)[3], 0)
  const webm = rodar('alfa-webm', 'webm')
  assert.equal(pixel(webm, 40, 20, ['-c:v', 'libvpx-vp9'])[3], 255)
  assert.equal(pixel(webm, 280, 20, ['-c:v', 'libvpx-vp9'])[3], 0)
  const verde = rodar('chroma-verde', 'mp4')
  const [r, g, b] = pixel(verde, 280, 20)
  assert.ok(r < 12 && Math.abs(g - 177) < 12 && Math.abs(b - 64) < 12, `verde chroma, veio ${r},${g},${b}`)
})

test('no navegador: WebM com alfa de verdade; fundo verde de verdade; ProRes 4444 manda para o computador', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  await p.waitForFunction(() => window.relayPronto)
  for (const entrada of ['alfa.webm', 'alfa.mov']) {
    const alfa = await converterNoNavegador(p, entrada, 'alfa-webm')
    assert.equal(alfa.codecVideo, 'vp9')
    const v = sondar(alfa.caminho).streams.find((x) => x.codec_type === 'video')
    assert.equal(v.tags?.alpha_mode ?? v.tags?.ALPHA_MODE, '1', `${entrada}: WebM marcado com alfa`)
    assert.equal(pixel(alfa.caminho, 40, 20, ['-c:v', 'libvpx-vp9'])[3], 255, `${entrada}: metade opaca`)
    assert.equal(pixel(alfa.caminho, 280, 20, ['-c:v', 'libvpx-vp9'])[3], 0, `${entrada}: metade transparente`)

    const verde = await converterNoNavegador(p, entrada, 'chroma-verde')
    const [r, g, b, a] = pixel(verde.caminho, 280, 20)
    assert.ok(r < 12 && Math.abs(g - 177) < 12 && Math.abs(b - 64) < 12 && a === 255, `${entrada}: verde chroma, veio ${r},${g},${b}`)
    const [ro] = pixel(verde.caminho, 40, 20)
    assert.ok(ro > 30, `${entrada}: a metade opaca continua a imagem`)
  }
  const erro = await p.evaluate(async () => {
    const m = await import('/app/motor.js')
    const arquivo = new File([await (await fetch('/teste-arquivo/alfa.mov')).blob()], 'alfa.mov')
    return m.converterArquivo(arquivo, 'alfa-prores').then(
      () => null,
      (e) => e.codigo,
    )
  })
  assert.equal(erro, 'computador')
  assert.deepEqual(s.erros, [])
})

// O Relay no Chromium: página inicial, conversor de ponta a ponta e o motor do navegador conferido com o ffmpeg
// (tamanho, cor, áudio, nitidez da redução em Lanczos e vídeo de celular girado).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { rmSync, statSync } from 'node:fs'
import { PRESETS } from '../src/presets.js'
import { abrir, converterNoNavegador, ff, medirSsim, pasta, sondar, temFfmpeg } from './apoio.js'

const pular = !temFfmpeg && 'sem ffmpeg'
let s

before(async () => {
  if (!temFfmpeg) return
  // master ProRes 1080p com som, um 4K com detalhe fino (para a redução) e um clipe de celular gravado deitado com
  // rotação de 90° (o iPhone em pé)
  ff('-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2:sample_rate=48000', '-c:v', 'prores_ks', '-profile:v', '2', '-c:a', 'pcm_s24le', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', join(pasta, 'master.mov'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=3840x2160:r=30:d=0.4', '-c:v', 'prores_ks', '-profile:v', '3', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', join(pasta, 'uhd.mov'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=1', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', join(pasta, 'deitado.mp4'))
  ff('-display_rotation', '90', '-i', join(pasta, 'deitado.mp4'), '-c', 'copy', join(pasta, 'celular.mp4'))
  ff('-f', 'lavfi', '-i', 'sine=f=220:d=3:sample_rate=44100', '-c:a', 'pcm_s16le', join(pasta, 'voz.wav'))
  s = await abrir()
})
after(async () => {
  await s?.fechar()
  rmSync(pasta, { recursive: true, force: true })
})

test('página inicial: destinos, exemplos calculados e nenhum erro', { skip: pular }, async () => {
  const p = await s.nova('/')
  await p.waitForSelector('.destino')
  assert.equal(await p.locator('.destino').count(), PRESETS.length)
  const exemplos = await p.locator('[data-exemplo]').allTextContents()
  assert.ok(exemplos.every((t) => /\d/.test(t)), exemplos.join(' | '))
  assert.equal(await p.locator('.orbita-app').count(), 7)
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('conversor: um master para Reels, MP3 e WAV, com o arquivo certo de cada um', { skip: pular }, async () => {
  const p = await s.nova('/converter?preset=reels')
  await p.waitForFunction(() => window.relayPronto)
  await p.setInputFiles('#arquivos', join(pasta, 'master.mov'))
  await p.waitForSelector('.item[data-estado="pronto"]')
  await p.locator('.aba', { hasText: 'Áudio' }).click()
  await p.locator('.preset', { hasText: 'MP3 320' }).click()
  await p.locator('.preset', { hasText: 'WAV 48 kHz' }).click()
  await p.waitForSelector('.saida--esperando >> nth=2')
  assert.equal(await p.locator('#converter').textContent(), 'Converter 3')
  await p.click('#converter')
  await p.waitForFunction(() => document.querySelectorAll('.saida--feito').length === 3, null, { timeout: 120_000 })
  const links = await p.locator('.saida--feito a[download]').evaluateAll((as) => as.map((a) => ({ href: a.href, nome: a.download })))
  assert.deepEqual(
    links.map((l) => l.nome),
    ['master (Reels · No Compress).mp4', 'master (MP3 320).mp3', 'master (WAV 48 kHz).wav'],
  )
  for (const l of links)
    await p.evaluate(
      async ({ href, nome }) => fetch(`/teste-saida/${encodeURIComponent(nome)}`, { method: 'POST', body: await (await fetch(href)).blob() }),
      l,
    )
  const reels = sondar(join(pasta, 'master (Reels · No Compress).mp4'))
  const v = reels.streams.find((x) => x.codec_type === 'video')
  const a = reels.streams.find((x) => x.codec_type === 'audio')
  assert.deepEqual([v.codec_name, v.width, v.height], ['h264', 1080, 1920])
  assert.equal(v.color_primaries, 'bt709')
  assert.equal(a.codec_name, 'aac') // nunca Opus num MP4: o AAC em WASM entra onde o navegador não tem
  assert.equal(a.sample_rate, '48000')
  const mp3 = sondar(join(pasta, 'master (MP3 320).mp3')).streams[0]
  assert.equal(mp3.codec_name, 'mp3')
  assert.ok(Math.abs(Number(mp3.bit_rate) - 320_000) < 5000, mp3.bit_rate)
  const wav = sondar(join(pasta, 'master (WAV 48 kHz).wav')).streams[0]
  assert.deepEqual([wav.codec_name, wav.sample_rate], ['pcm_s24le', '48000'])
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('redução 4K → 1080p em Lanczos na placa: igual ao ffmpeg, sem virar de cabeça para baixo', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const r = await converterNoNavegador(p, 'uhd.mov', 'youtube-1080', {}, 'gpu')
  assert.equal(r.escala, 'lanczos')
  const ref = join(pasta, 'uhd.mov')
  const certo = medirSsim(r.caminho, ref, 'scale=1920:1080:flags=lanczos')
  const virado = medirSsim(r.caminho, ref, 'scale=1920:1080:flags=lanczos,vflip')
  assert.ok(certo > 0.97, `SSIM ${certo}`)
  assert.ok(virado < certo - 0.1, `virado ${virado} × certo ${certo}`)
  await p.close()
})

test('vídeo de celular girado vira 1080×1920 em pé, sem faixas', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const r = await converterNoNavegador(p, 'celular.mp4', 'reels', {}, 'gpu')
  const v = sondar(r.caminho).streams.find((x) => x.codec_type === 'video')
  assert.deepEqual([v.width, v.height], [1080, 1920])
  assert.equal(r.plano.video.encaixe, null)
  // a referência é o que o ffmpeg (e todo player) mostra ao aplicar a rotação do arquivo; de ponta-cabeça é o erro
  const certo = medirSsim(r.caminho, join(pasta, 'celular.mp4'), 'scale=1080:1920:flags=lanczos')
  const errado = medirSsim(r.caminho, join(pasta, 'celular.mp4'), 'scale=1080:1920:flags=lanczos,hflip,vflip')
  assert.ok(certo > 0.9, `SSIM ${certo}`)
  assert.ok(certo > errado + 0.05, `certo ${certo} × errado ${errado}`)
  await p.close()
})

test('tamanho exato: cabe no limite mesmo quando o codificador passa do alvo', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const r = await converterNoNavegador(p, 'master.mov', 'tamanho', { tamanhoMB: 0.4 })
  assert.ok(statSync(r.caminho).size <= 0.4e6, `${statSync(r.caminho).size} bytes; avisos: ${r.avisos.join(' / ')}`)
  await p.close()
})

test('só áudio: WAV vira AAC 256 em M4A', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const r = await converterNoNavegador(p, 'voz.wav', 'm4a')
  const a = sondar(r.caminho).streams[0]
  assert.equal(a.codec_name, 'aac')
  assert.equal(r.plano.audio.taxa, 44100) // mantém a taxa do arquivo
  await p.close()
})

test('meus presets: cria a partir de um do Relay, aparece na aba Meus, converte com o bitrate escolhido e leva em .relay.json', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  await p.waitForFunction(() => window.relayPronto)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await p.waitForFunction(() => window.relayPronto)
  await p.setInputFiles('#arquivos', join(pasta, 'master.mov'))
  await p.waitForSelector('.item[data-estado="pronto"]')
  const yt = p.locator('.preset', { hasText: 'YouTube 1080p' })
  await yt.hover()
  await yt.locator('.personalizar').click()
  await p.waitForSelector('dialog.folha[open]')
  await p.fill('.nome-preset', 'Cliente X')
  await p.locator('.folha input[aria-label="Mbit/s"]').fill('6')
  await p.locator('.folha .segmentos button', { hasText: 'Sem áudio' }).click()
  assert.match(await p.locator('.folha .ficha-tecnica').textContent(), /6 Mbit\/s variável/)
  await p.click('.folha-acoes .vidro--tinta')
  await p.waitForSelector('.aba[aria-selected="true"]:has-text("Meus")')
  assert.equal(await p.locator('.preset', { hasText: 'Cliente X' }).count(), 1)
  // só o Cliente X: tira o YouTube que veio marcado
  await p.locator('.aba', { hasText: 'Redes' }).click()
  await p.locator('.preset', { hasText: 'YouTube 1080p' }).click()
  await p.click('#converter')
  await p.waitForFunction(() => document.querySelectorAll('.saida--feito').length === 1, null, { timeout: 120_000 })
  const href = await p.locator('.saida--feito a[download]').getAttribute('href')
  await p.evaluate(async (href) => fetch('/teste-saida/meu.mp4', { method: 'POST', body: await (await fetch(href)).blob() }), href)
  const info = sondar(join(pasta, 'meu.mp4'))
  assert.equal(info.streams.filter((x) => x.codec_type === 'audio').length, 0, 'sem áudio')
  const kbps = (Number(info.format.size) * 8) / Number(info.format.duration) / 1000
  assert.ok(kbps > 3000 && kbps < 9000, `${kbps} kbit/s para 6 Mbit/s`)
  // guardado no aparelho e no formato de levar
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('relay-meus-presets')))
  assert.equal(guardado.relay, 'presets')
  assert.equal(guardado.presets[0].nome, 'Cliente X')
  assert.equal(guardado.presets[0].kbps, 6000)
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('celular (375 px): nenhuma página rola para o lado', { skip: pular }, async () => {
  for (const c of ['/', '/converter', '/qualidade', '/marca/']) {
    const p = await s.nova(c, { viewport: { width: 375, height: 800 } })
    await p.waitForTimeout(400)
    const [largura, tela] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    assert.equal(largura, tela, `${c} rola para o lado`)
    await p.close()
  }
})

// Antes de converter: a ficha técnica de cada saída já aberta e "Ajustar" (o editor completo com os números do
// arquivo). "Usar neste arquivo" muda só aquela conversão; o arquivo sai com o que foi ajustado.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { abrir, ff, pasta, sondar, temFfmpeg } from './apoio.js'

const pular = !temFfmpeg && 'sem ffmpeg'
let s
before(async () => {
  if (!temFfmpeg) return
  ff('-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=1', '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=48000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(pasta, 'ajustar.mp4'))
  s = await abrir()
})
after(async () => s?.fechar())

test('a ficha aparece antes de converter e "Usar neste arquivo" muda só esta conversão', { skip: pular }, async () => {
  const p = await s.nova('/converter?preset=youtube-1080')
  await p.waitForFunction(() => window.relayPronto)
  await p.setInputFiles('#arquivos', join(pasta, 'ajustar.mp4'))
  await p.waitForSelector('.item[data-estado="pronto"] .ficha-tecnica')
  assert.match(await p.textContent('.ficha-tecnica'), /Cadência/)
  await p.click('button:has-text("Ajustar")')
  await p.waitForSelector('.folha[open]')
  assert.match(await p.textContent('.folha[open] h2'), /Ajustar antes de converter/)
  await p.selectOption('.folha select[aria-label="Cadência"]', { label: '24 fps' })
  await p.locator('.folha .segmentos button', { hasText: 'Exata' }).click()
  await p.click('.folha-acoes button:has-text("Usar neste arquivo")')
  await p.waitForSelector('.ficha:text-is("Ajustado")')
  assert.match(await p.textContent('.ficha-tecnica'), /24 fps exatos/)
  // nada foi guardado em Meus presets
  assert.equal(await p.evaluate(() => localStorage.getItem('relay-meus-presets')), null)
  await p.click('#converter')
  await p.waitForSelector('.saida--feito', { timeout: 120_000 })
  const url = await p.getAttribute('.saida--feito a[download]', 'href')
  const nome = await p.getAttribute('.saida--feito a[download]', 'download')
  const caminho = join(pasta, 'ajustado.mp4')
  const b = await p.evaluate(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), url)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(caminho, Buffer.from(b))
  assert.equal(sondar(caminho).streams.find((x) => x.codec_type === 'video').r_frame_rate, '24/1', nome)
  await p.close()
  assert.deepEqual(s.erros, [])
})

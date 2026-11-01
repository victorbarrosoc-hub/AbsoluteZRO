// downloadTo (src/net/baixar-arquivo.js): o que ficou do antigo src/updater.js, usado pelos modelos das Cenas e pelo
// yt-dlp das Referências. Segue o redirecionamento, mostra o progresso, calcula o SHA-256 e falha com download
// incompleto ou parado.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { downloadTo } from '../src/net/baixar-arquivo.js'
import { closeHttp } from '../src/net/http.js'
import { makeTmpDir } from './helpers.js'

const BYTES = Buffer.from('arquivo falso do SOBEDESCE '.repeat(2000))
const SHA = crypto.createHash('sha256').update(BYTES).digest('hex')

let dir
before(async () => {
  dir = await makeTmpDir('sobedesce-baixar-')
})
after(async () => {
  await fs.rm(dir, { recursive: true, force: true })
  await closeHttp()
})

test('downloadTo: segue o redirecionamento, mostra o progresso e calcula o SHA-256', async () => {
  const site = http.createServer((req, res) => {
    if (req.url === '/arquivo') {
      res.writeHead(302, { location: '/release/modelo.bin' })
      return res.end()
    }
    if (req.url === '/release/modelo.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': BYTES.length })
      return res.end(BYTES)
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise(r => site.listen(0, '127.0.0.1', r))
  try {
    const file = path.join(dir, 'baixado.bin')
    const progress = []
    const sha = await downloadTo(`http://127.0.0.1:${site.address().port}/arquivo`, file, { onProgress: (got, total) => progress.push([got, total]) })
    assert.equal(sha, SHA)
    assert.deepEqual(await fs.readFile(file), BYTES)
    assert.deepEqual(progress.at(-1), [BYTES.length, BYTES.length])
    await assert.rejects(downloadTo(`http://127.0.0.1:${site.address().port}/nada`, path.join(dir, 'nada.bin')), /404/)
  } finally {
    site.closeAllConnections?.()
    await new Promise(r => site.close(r))
  }
})

test('downloadTo: download incompleto, parado e grande demais falham', async () => {
  const curto = async () => new Response(BYTES.subarray(0, 100), { headers: { 'content-length': String(BYTES.length) } })
  await assert.rejects(downloadTo('https://x/arquivo', path.join(dir, 'curto.bin'), { fetch: curto }), /incompleto/)
  const parado = async (_url, { signal }) =>
    new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); signal.addEventListener('abort', () => c.error(signal.reason)) } }), { headers: { 'content-length': '100' } })
  await assert.rejects(downloadTo('https://x/arquivo', path.join(dir, 'parado.bin'), { fetch: parado, stallMs: 30 }), /parou de andar/)
  const grande = async () => new Response(BYTES, { headers: { 'content-length': String(BYTES.length) } })
  await assert.rejects(downloadTo('https://x/arquivo', path.join(dir, 'grande.bin'), { fetch: grande, maxBytes: 10 }), /grande demais/)
})

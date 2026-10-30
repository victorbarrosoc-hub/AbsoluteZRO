// "Escolher no Drive" (src/drive.js, app/drive.js): a conta pura do protocolo e, no Chromium, o caminho inteiro com um
// SOBEDESCE de mentira noutra origem (outra porta): escolher no quadro, ler o vídeo aos pedaços pelo canal, converter e
// mandar o resultado de volta para o "Drive", até o "conferido".

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { arquivosEscolhidos, enderecoDoQuadro, intervaloValido, LER_MAX } from '../src/drive.js'
import { servir } from '../scripts/servir.mjs'
import { ff, pasta, temFfmpeg } from './apoio.js'

describe('protocolo', () => {
  test('endereço do quadro: só o modo escolher do anfitrião relay, no tema dado', () => {
    assert.equal(enderecoDoQuadro(), 'https://sobedesce.absolutezro.com/app/?no=relay&modo=escolher&tema=claro')
    assert.equal(enderecoDoQuadro('http://127.0.0.1:9', 'escuro'), 'http://127.0.0.1:9/app/?no=relay&modo=escolher&tema=escuro')
    assert.match(enderecoDoQuadro(undefined, 'qualquer'), /tema=claro$/)
  })

  test('arquivos escolhidos: só com id do Drive, nome e tamanho; o resto fica de fora', () => {
    const ok = { id: '1AbC_def-ghiJKL', nome: ' master.mov ', tamanho: 123, mime: 'video/quicktime', pasta: 'pasta_0123456789' }
    const r = arquivosEscolhidos({ fonte: 'sobedesce', tipo: 'escolhido', arquivos: [ok, { ...ok, id: '../x' }, { ...ok, tamanho: 0 }, { ...ok, nome: '' }, { ...ok, pasta: 'x/y' }] })
    assert.deepEqual(r, [
      { id: ok.id, nome: 'master.mov', tamanho: 123, mime: 'video/quicktime', pasta: ok.pasta },
      { id: ok.id, nome: 'master.mov', tamanho: 123, mime: 'video/quicktime', pasta: null },
    ])
    assert.deepEqual(arquivosEscolhidos({ fonte: 'outro', tipo: 'escolhido', arquivos: [ok] }), [])
  })

  test('leitura: dentro do arquivo e até o limite por pedido', () => {
    assert.equal(intervaloValido(0, 10, 10), true)
    assert.equal(intervaloValido(5, 5, 10), false)
    assert.equal(intervaloValido(0, 11, 10), false)
    assert.equal(intervaloValido(-1, 4, 10), false)
    assert.equal(intervaloValido(0, LER_MAX + 1, LER_MAX * 2), false)
  })

  test('CSP: o quadro só do SOBEDESCE; sem COEP (ele barraria o quadro)', () => {
    const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    const h = v.headers.find((x) => x.source === '/(.*)').headers
    assert.match(h.find((x) => x.key === 'Content-Security-Policy').value, /frame-src https:\/\/sobedesce\.absolutezro\.com;/)
    assert.ok(!h.some((x) => x.key === 'Cross-Origin-Embedder-Policy'))
  })
})

describe('no Chromium, com um SOBEDESCE de mentira', () => {
  const pular = !temFfmpeg && 'sem ffmpeg'
  let relay, sobedesce, navegador, origem
  const video = join(pasta, 'drive-origem.mp4')
  let lidos = 0

  before(async () => {
    if (pular) return
    ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=1', '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=48000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', video)
    const tamanho = statSync(video).size
    sobedesce = http.createServer(async (req, res) => {
      if (req.url.startsWith('/app/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(`<!doctype html><button id="video">drive-origem.mp4</button><script>
          const pai = location.ancestorOrigins[0]
          let porta
          addEventListener('message', (e) => {
            if (e.origin !== pai || e.data?.tipo !== 'canal') return
            porta = e.ports[0]
            porta.onmessage = async ({ data: d }) => {
              if (d.tipo === 'ler') {
                const b = await (await fetch('/arquivo', { headers: { Range: 'bytes=' + d.de + '-' + (d.ate - 1) } })).arrayBuffer()
                porta.postMessage({ pedido: d.pedido, ok: true, dados: b }, [b])
              } else if (d.tipo === 'enviar') {
                await fetch('/recebido/' + encodeURIComponent(d.nome) + '?pasta=' + d.pasta, { method: 'POST', body: d.dados })
                porta.postMessage({ pedido: d.pedido, ok: true, envio: 'envio-1' })
                setTimeout(() => porta.postMessage({ tipo: 'envio', envio: 'envio-1', estado: 'enviando' }), 20)
                setTimeout(() => porta.postMessage({ tipo: 'envio', envio: 'envio-1', estado: 'conferido' }), 60)
              }
            }
          })
          parent.postMessage({ fonte: 'sobedesce', tipo: 'pronto' }, pai)
          document.getElementById('video').onclick = () => parent.postMessage({ fonte: 'sobedesce', tipo: 'escolhido', arquivos: [{ id: 'drive_0123456789', nome: 'drive-origem.mp4', tamanho: ${tamanho}, mime: 'video/mp4', pasta: 'pasta_0123456789' }] }, pai)
        </script>`)
      }
      if (req.url === '/arquivo') {
        const [, de, ate] = /bytes=(\d+)-(\d+)/.exec(req.headers.range)
        const b = readFileSync(video).subarray(Number(de), Number(ate) + 1)
        lidos += b.length
        res.writeHead(206, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length })
        return res.end(b)
      }
      if (req.url.startsWith('/recebido/') && req.method === 'POST') {
        const partes = []
        for await (const c of req) partes.push(c)
        const u = new URL(req.url, 'http://x')
        writeFileSync(join(pasta, `drive-${u.searchParams.get('pasta')}-${decodeURIComponent(u.pathname.slice(10))}`), Buffer.concat(partes))
        res.writeHead(204)
        return res.end()
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise((ok) => sobedesce.listen(0, '127.0.0.1', ok))
    origem = `http://127.0.0.1:${sobedesce.address().port}`
    relay = await servir({ porta: 0 })
    navegador = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
  })
  after(async () => {
    await navegador?.close()
    relay?.close()
    sobedesce?.close()
  })

  test('escolhe no Drive, lê aos pedaços, converte e manda de volta até o "conferido"', { skip: pular }, async () => {
    const ctx = await navegador.newContext()
    await ctx.addInitScript((o) => sessionStorage.setItem('relay-sobedesce', o), origem)
    const p = await ctx.newPage()
    const erros = []
    p.on('pageerror', (e) => erros.push(e.message))
    await p.goto(`http://127.0.0.1:${relay.address().port}/converter?preset=whatsapp`)
    await p.waitForFunction(() => window.relayPronto)
    await p.click('#escolher-drive')
    await p.frameLocator('.drive-quadro').locator('#video').click()
    await p.waitForSelector('.item[data-estado="pronto"]')
    assert.equal(await p.isVisible('.folha--drive'), false, 'a folha fecha ao escolher')
    assert.match(await p.textContent('.item-nome'), /drive-origem\.mp4/)
    await p.click('#converter')
    await p.waitForSelector('.saida--feito', { timeout: 120_000 })
    assert.ok(lidos > 0, 'leu pelo quadro')
    await p.click('button:has-text("Para o Drive")')
    await p.waitForSelector('text=No Drive, conferido')
    const enviado = join(pasta, 'drive-pasta_0123456789-drive-origem (WhatsApp).mp4')
    assert.ok(existsSync(enviado), 'chegou na mesma pasta do Drive')
    assert.ok(statSync(enviado).size > 1000)
    assert.deepEqual(erros, [])
    await ctx.close()
  })
})

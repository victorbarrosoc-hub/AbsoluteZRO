// Estúdio › Montagens: geometria dos modelos e formatos (public/lib/montagens.js) e as rotas do motor
// (src/server/montagens.js): mostrar a foto escolhida só com a chave da mídia e gravar a montagem sem nunca grava por cima.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { startApp } from '../src/index.js'
import { closeHttp } from '../src/net/http.js'
import { nomeMontagem } from '../src/server/montagens.js'
import { makeTmpDir } from './helpers.js'
import { makePng } from './mock-drive.js'

const L = await import('../public/lib/montagens.js')

test('formatos: os tamanhos recomendados de cada rede, e o personalizado dentro dos limites', () => {
  const por = Object.fromEntries(L.FORMATOS.map((f) => [f.id, [f.w, f.h]]))
  assert.deepEqual(por['9x16'], [1080, 1920])
  assert.deepEqual(por['4x5'], [1080, 1350])
  assert.deepEqual(por['3x4'], [1080, 1440])
  assert.deepEqual(por['1x1'], [1080, 1080])
  assert.deepEqual(por['16x9'], [1920, 1080])
  assert.deepEqual(por['21x9'], [2560, 1080])
  assert.equal(L.formatoPorId('nada').id, '4x5')
  const p = L.formatoPersonalizado(50, 99999)
  assert.deepEqual([p.w, p.h], [200, 4096])
  assert.equal(p.id, '200x4096')
})

test('modelos: as caixas cobrem a montagem sem passar da borda e com o mesmo espaço entre as fotos', () => {
  for (const f of L.FORMATOS) {
    for (const m of L.MODELOS) {
      const e = 20
      const cx = L.caixasDe(m, { w: f.w, h: f.h, espaco: e })
      assert.equal(cx.length, m.caixas.length)
      for (const c of cx) {
        assert.ok(c.x >= e - 1e-6 && c.y >= e - 1e-6, `${m.id} ${f.id} dentro da margem`)
        assert.ok(c.x + c.w <= f.w - e + 1e-6 && c.y + c.h <= f.h - e + 1e-6, `${m.id} ${f.id} não passa da borda`)
        assert.ok(c.w > 0 && c.h > 0)
      }
      // sem espaço, a soma das áreas é a montagem inteira (os modelos não deixam buraco nem sobrepõem)
      const area = L.caixasDe(m, { w: f.w, h: f.h, espaco: 0 }).reduce((s, c) => s + c.w * c.h, 0)
      assert.ok(Math.abs(area - f.w * f.h) < 1, `${m.id} ${f.id} cobre tudo`)
    }
  }
  // Dois lado a lado no 4:5 com 20 px: 20 na borda, 20 no meio
  const [a, b] = L.caixasDe('duas-lado', { w: 1080, h: 1350, espaco: 20 })
  assert.equal(a.x, 20)
  assert.equal(b.x - (a.x + a.w), 20)
  assert.equal(1080 - (b.x + b.w), 20)
})

test('quadro no ponto, trocar de lugar e preencher em ordem', () => {
  const o = { w: 1080, h: 1350, espaco: 0 }
  assert.equal(L.quadroNoPonto('quatro', o, 100, 100), 0)
  assert.equal(L.quadroNoPonto('quatro', o, 1000, 1300), 3)
  assert.equal(L.quadroNoPonto('quatro', { ...o, espaco: 40 }, 5, 5), -1)
  const t = L.trocarQuadros(['a', 'b', 'c'], [{ zoom: 2 }, null, null], 0, 2)
  assert.deepEqual(t.fotos, ['c', 'b', 'a'])
  assert.deepEqual(t.enquadres, [null, null, { zoom: 2 }])
  assert.deepEqual(L.preencher([], 3, ['x', 'y', 'z', 'w']), ['x', 'y', 'z'])
  // já usada não repete; quadro esvaziado de propósito ('') não recebe outra
  assert.deepEqual(L.preencher([null, 'x', ''], 3, ['x', 'y', 'z']), ['y', 'x', ''])
  assert.equal(L.modelosPara(4)[0].caixas.length, 4)
})

test('nome do arquivo: sem caracteres que o Windows recusa, com o formato', () => {
  assert.equal(nomeMontagem('Viagem: Chapada/2', '4x5', 'jpg'), 'Viagem Chapada 2_4x5.jpg')
  assert.equal(nomeMontagem('', '2.39x1', 'jpg'), 'Montagem_2.39x1.jpg')
  assert.equal(nomeMontagem('Ok', '../../x', 'png'), 'Ok.png')
})

// ── rotas

let home, app, key, fotos
const keepAwake = { active: false, setActive() {}, stop() {} }

function call(method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const h = { host: `127.0.0.1:${app.port}`, ...headers }
    if (body) h['content-length'] = body.length
    const req = http.request({ host: '127.0.0.1', port: app.port, method, path: p, headers: h, agent: false }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        let json = null
        try {
          json = JSON.parse(buf.toString('utf8'))
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, buf, json })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
const q = (o) => new URLSearchParams(o).toString()

before(async () => {
  home = await makeTmpDir()
  fotos = path.join(home, 'Fotos')
  await fs.mkdir(fotos, { recursive: true })
  await fs.writeFile(path.join(fotos, 'a.png'), makePng(8, 6))
  await fs.writeFile(path.join(fotos, 'nota.txt'), 'oi')
  app = await startApp({ home, port: 0, open: false, quiet: true, managerOptions: { keepAwake }, serverOptions: { log: () => {} } })
  key = (await call('GET', '/api/state')).json.media.key
})

after(async () => {
  await app?.shutdown()
  await closeHttp()
  await fs.rm(home, { recursive: true, force: true })
})

test('foto: só com a chave da mídia, só imagens, e diz quando a foto sumiu', async () => {
  const p = path.join(fotos, 'a.png')
  assert.equal((await call('GET', `/api/montagens/foto?${q({ p })}`)).status, 403)
  assert.equal((await call('GET', `/api/montagens/foto?${q({ p, k: key })}`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  const ok = await call('GET', `/api/montagens/foto?${q({ p, k: key })}`)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['content-type'], 'image/png')
  assert.ok(ok.buf.equals(await fs.readFile(p)))
  assert.equal((await call('GET', `/api/montagens/foto?${q({ p: path.join(fotos, 'nota.txt'), k: key })}`)).status, 415)
  assert.equal((await call('GET', `/api/montagens/foto?${q({ p: path.join(fotos, 'sumiu.jpg'), k: key })}`)).status, 404)
  assert.equal((await call('GET', `/api/montagens/foto?${q({ p: 'relativo/a.png', k: key })}`)).status, 404)
})

test('salvar: grava na pasta escolhida com nome novo, nunca por cima; recusa o que não é imagem', async () => {
  const destino = path.join(home, 'Saida')
  await fs.mkdir(destino)
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)])
  const url = `/api/montagens/salvar?${q({ nome: 'Viagem', formato: '4x5', pasta: destino })}`
  const r1 = await call('POST', url, { headers: { 'content-type': 'image/jpeg' }, body: jpg })
  assert.equal(r1.status, 200)
  assert.equal(r1.json.arquivo, path.join(destino, 'Viagem_4x5.jpg'))
  const r2 = await call('POST', url, { headers: { 'content-type': 'image/jpeg' }, body: Buffer.concat([jpg, Buffer.from([2])]) })
  assert.equal(r2.status, 200)
  assert.notEqual(r2.json.arquivo, r1.json.arquivo)
  assert.ok((await fs.readFile(r1.json.arquivo)).equals(jpg), 'o primeiro continua igual')
  assert.equal((await call('POST', url, { headers: { 'content-type': 'text/plain' }, body: Buffer.from('oi') })).status, 415)
  assert.equal((await call('POST', url, { headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('não é jpeg') })).status, 400)
  const semPasta = `/api/montagens/salvar?${q({ nome: 'X', pasta: path.join(home, 'nao-existe') })}`
  assert.equal((await call('POST', semPasta, { headers: { 'content-type': 'image/jpeg' }, body: jpg })).status, 400)
  assert.equal((await fs.readdir(destino)).length, 2)
})

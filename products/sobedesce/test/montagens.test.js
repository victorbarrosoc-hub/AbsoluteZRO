// Estúdio › Montagens: geometria dos modelos e formatos (public/lib/montagens.js) e as rotas do motor
// (src/server/montagens.js): mostrar a foto escolhida só com a chave da mídia e gravar a montagem sem nunca grava por cima.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { startApp } from '../src/index.js'
import { closeHttp } from '../src/net/http.js'
import { nomeMontagem } from '../src/server/montagens.js'
import { argsMontagem } from '../src/montagens/video.js'
import { makeTmpDir } from './helpers.js'
import { makePng } from './mock-drive.js'

const L = await import('../public/lib/montagens.js')

const ffmpeg = (() => {
  try {
    const r = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
})()
const semFfmpeg = !ffmpeg && 'sem ffmpeg neste computador'

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

test('carrossel contínuo e grade do perfil: a tela inteira e as fatias na ordem de postar', () => {
  const c = L.telaDe({ tipo: 'carrossel', formato: '4x5', slides: 3 })
  assert.deepEqual([c.w, c.h], [3240, 1350])
  assert.deepEqual(c.fatias.map((f) => [f.x, f.n]), [[0, 1], [1080, 2], [2160, 3]])
  assert.equal(L.telaDe({ tipo: 'carrossel', formato: '1x1', slides: 99 }).fatias.length, 10)
  const g = L.telaDe({ tipo: 'grade', formato: '4x5', linhas: 2, quadrado: '3x4' })
  assert.deepEqual([g.w, g.h], [3240, 2880])
  // o primeiro a postar é o de baixo, à direita; o último fica em cima, à esquerda
  assert.deepEqual(g.fatias.map((f) => f.n), [6, 5, 4, 3, 2, 1])
  assert.equal(g.fatias.find((f) => f.n === 1).x, 2160)
  assert.equal(g.fatias.find((f) => f.n === 1).y, 1440)
  assert.deepEqual([L.telaDe({ tipo: 'grade', quadrado: '1x1', linhas: 1 }).h], [1080])
  assert.equal(L.telaDe({ tipo: 'post', formato: '9x16' }).fatias.length, 1)
})

test('trecho do take: dentro do vídeo, com a duração da montagem (metade na câmera lenta)', () => {
  assert.deepEqual(L.trechoDe({ inicio: 3 }, 5, 14), { inicio: 3, lento: false, janela: 5, fim: 8 })
  assert.deepEqual(L.trechoDe({ inicio: 12 }, 5, 14), { inicio: 9, lento: false, janela: 5, fim: 14 })
  assert.equal(L.trechoDe({ inicio: 12, lento: true }, 5, 14).janela, 2.5)
  assert.deepEqual(L.trechoDe(null, 8, 4), { inicio: 0, lento: false, janela: 4, fim: 4 })
})

test('vídeo: o ffmpeg põe cada take no quadro e cobre com a camada da tela; som só do take escolhido', () => {
  const q = { p: '/v/a.mov', inicio: 2, sx: 10, sy: 0, sw: 800, sh: 1000, x: 12, y: 12, w: 1056, h: 701 }
  const a = argsMontagem({ w: 1080, h: 1350, fundo: '#000000', duracao: 5, base: '/c/b.png', quadros: [q, { ...q, p: '/v/b.mov', lento: true, y: 725 }], som: null, destino: '/s/x.mp4' })
  const fc = a[a.indexOf('-filter_complex') + 1]
  assert.match(fc, /color=c=0x000000:s=1080x1350/)
  assert.match(fc, /\[0:v\]setpts=PTS-STARTPTS,fps=30,crop=800:1000:10:0,scale=1056:702/)
  assert.match(fc, /\[1:v\]setpts=2\*\(PTS-STARTPTS\)/)
  assert.match(fc, /\[2:v\]format=rgba/)
  assert.ok(a.includes('-an'))
  assert.equal(a[a.indexOf('-ss') + 1], '2.000')
  const b = argsMontagem({ w: 1080, h: 1920, fundo: 'x', duracao: 8, base: '/c/b.png', quadros: [{ ...q, lento: true }], som: 0, destino: '/s/x.mp4' })
  const fb = b[b.indexOf('-filter_complex') + 1]
  assert.match(fb, /\[0:a\]atempo=0\.5/)
  assert.match(fb, /color=c=black/)
  assert.ok(b.includes('[a]') && !b.includes('-an'))
  assert.equal(b[b.indexOf('-t', b.indexOf('-map')) + 1], '8.000')
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

test('takes: informações e quadros só com a chave; o vídeo da montagem recusa pedido torto', async () => {
  const p = path.join(fotos, 'nota.txt')
  assert.equal((await call('GET', `/api/montagens/info?${q({ p })}`)).status, 403)
  assert.equal((await call('GET', `/api/montagens/info?${q({ p, k: key })}`)).status, 415)
  assert.equal((await call('GET', `/api/montagens/quadro?${q({ p: path.join(fotos, 'sumiu.mp4'), t: 1 })}`)).status, 403)
  assert.equal((await call('POST', '/api/montagens/base', { headers: { 'content-type': 'image/png' }, body: Buffer.from('não é png') })).status, 400)
  const json = (b) => Buffer.from(JSON.stringify(b))
  const pedir = (b) => call('POST', '/api/montagens/video', { headers: { 'content-type': 'application/json' }, body: json(b) })
  assert.equal((await pedir({ base: '../../etc/passwd', w: 1080, h: 1350, duracao: 5, quadros: [] })).status, 400)
  assert.equal((await pedir({ base: 'b0123456789abcdef01234567', w: 1080, h: 1350, duracao: 5, quadros: [] })).status, 400)
})

test('vídeo da montagem de ponta a ponta: MP4 no tamanho do formato, com o take no quadro', { skip: semFfmpeg, timeout: 120_000 }, async () => {
  const clip = path.join(fotos, 'take.mp4')
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip])
  assert.equal(r.status, 0, String(r.stderr))
  const info = await call('GET', `/api/montagens/info?${q({ p: clip, k: key })}`)
  assert.equal(info.status, 200)
  assert.equal(info.json.info.largura, 640)
  assert.ok(info.json.info.audio)
  const quadro = await call('GET', `/api/montagens/quadro?${q({ p: clip, t: 1, l: 160, k: key })}`)
  assert.equal(quadro.status, 200)
  assert.equal(quadro.headers['content-type'], 'image/jpeg')
  const png = makePng(400, 500)
  const base = await call('POST', '/api/montagens/base', { headers: { 'content-type': 'image/png' }, body: png })
  assert.equal(base.status, 200)
  const destino = path.join(home, 'Videos')
  await fs.mkdir(destino)
  const v = await call('POST', '/api/montagens/video', {
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ base: base.json.base, w: 400, h: 500, duracao: 3, fundo: '#000000', nome: 'Teste', formato: '4x5', pasta: destino, som: 0, quadros: [{ p: clip, inicio: 0, sx: 100, sy: 0, sw: 288, sh: 360, x: 0, y: 0, w: 400, h: 250 }] })),
  })
  assert.equal(v.status, 200, JSON.stringify(v.json))
  assert.equal(v.json.arquivo, path.join(destino, 'Teste_4x5.mp4'))
  const st = await fs.stat(v.json.arquivo)
  assert.ok(st.size > 1000)
  assert.deepEqual((await fs.readdir(destino)).filter((n) => n.includes('parcial')), [], 'não sobra arquivo pela metade')
})

test('faixas: frames empilhados no formato do frame, centrados e fora da zona dos Stories', async () => {
  const { ASPECTOS_FAIXA, ZONA_STORIES, caixasDe, modeloDe, modeloFaixas, quadroNoPonto } = await import('../public/lib/montagens.js')
  // 3 × 16:9 num story: largura toda (menos a borda), proporção certa, espaço igual e centrado na área livre
  const tres = caixasDe(modeloFaixas({ n: 3, aspecto: '16:9', seguro: true }), { w: 1080, h: 1920, espaco: 20 })
  assert.equal(tres.length, 3)
  // na área livre dos Stories (1330 px de altura) três 16:9 não cabem na largura toda: ficam do tamanho que cabe
  const altura = (1920 * (1 - ZONA_STORIES.topo - ZONA_STORIES.base) - 2 * 20) / 3
  for (const c of tres) {
    assert.ok(Math.abs(c.w / c.h - 16 / 9) < 1e-9)
    assert.ok(Math.abs(c.h - altura) < 1e-9 && c.w < 1040)
  }
  // dois 16:9 cabem: largura toda menos a borda
  for (const c of caixasDe(modeloFaixas({ n: 2, aspecto: '16:9', seguro: true }), { w: 1080, h: 1920, espaco: 20 })) assert.equal(c.w, 1040)
  assert.ok(Math.abs(tres[1].y - (tres[0].y + tres[0].h + 20)) < 1e-9)
  const livre = [1920 * ZONA_STORIES.topo, 1920 * (1 - ZONA_STORIES.base)]
  assert.ok(Math.abs(tres[0].y - livre[0] - (livre[1] - (tres[2].y + tres[2].h))) < 1e-6, 'centrado na área livre')
  // 5 × 2,39 não cabe na largura toda: fica mais estreito, mas no formato e dentro da zona segura
  const cinco = caixasDe(modeloFaixas({ n: 5, aspecto: '2.39', seguro: true }), { w: 1080, h: 1920, espaco: 20 })
  for (const c of cinco) assert.ok(Math.abs(c.w / c.h - 2.39) < 1e-9 && c.w < 1040 && Math.abs(c.x + c.w / 2 - 540) < 1e-9)
  assert.ok(cinco[0].y >= livre[0] - 1e-9 && cinco[4].y + cinco[4].h <= livre[1] + 1e-9)
  // sem a zona: as faixas podem ir mais perto da borda; tela cheia divide a altura sem sobra
  const solto = caixasDe(modeloFaixas({ n: 5, aspecto: '2.39', seguro: false }), { w: 1080, h: 1920, espaco: 20 })
  assert.ok(solto[0].w > cinco[0].w)
  const cheio = caixasDe(modeloFaixas({ n: 3, aspecto: 'cheio', seguro: false }), { w: 1080, h: 1920, espaco: 0, borda: true })
  assert.deepEqual(cheio.map((c) => [c.x, c.y, c.w, c.h]), [[0, 0, 1080, 640], [0, 640, 1080, 640], [0, 1280, 1080, 640]])
  // a zona dos Stories só vale no vertical; no 4:5 as faixas usam a altura toda
  const feed = caixasDe(modeloFaixas({ n: 4, aspecto: '2.39', seguro: true }), { w: 1080, h: 1350, espaco: 0, borda: false })
  assert.ok(feed[0].y < 1350 * ZONA_STORIES.topo)
  // valores fora da lista voltam ao padrão; a montagem salva acha o modelo; o toque acha a faixa
  assert.equal(modeloFaixas({ n: 1 }).faixas.n, 1) // o último story de um lote
  const m = modeloFaixas({ n: 9, aspecto: 'x' })
  assert.equal(m.faixas.n, 3)
  assert.equal(m.faixas.aspecto, ASPECTOS_FAIXA[0].id)
  assert.equal(modeloDe({ modelo: 'faixas', faixas: { n: 4, aspecto: '1.85', seguro: true } }).caixas.length, 4)
  assert.equal(modeloDe({ modelo: 'quatro' }).id, 'quatro')
  assert.equal(quadroNoPonto(modeloFaixas({ n: 3 }), { w: 1080, h: 1920, espaco: 20 }, 540, tres[1].y + 10), 1)
})

test('faixas antes e depois: pares com rótulo (ANTES em cima, DEPOIS embaixo); sem a chave, sem rótulo', async () => {
  const { modeloFaixas, modeloDe, ROTULOS_ANTES_DEPOIS } = await import('../public/lib/montagens.js')
  const ad = modeloFaixas({ n: 4, aspecto: '2.39', seguro: true, antesDepois: true })
  assert.equal(ad.nome, 'Antes e depois 2,39')
  assert.deepEqual(ad.faixas.rotulos, ROTULOS_ANTES_DEPOIS)
  assert.deepEqual([0, 1, 2, 3].map((i) => ad.faixas.rotulos[i % 2]), ['ANTES', 'DEPOIS', 'ANTES', 'DEPOIS'])
  assert.equal(modeloFaixas({ n: 4 }).faixas.rotulos, null)
  assert.equal(modeloDe({ modelo: 'faixas', faixas: { n: 2, antesDepois: true } }).faixas.antesDepois, true)
})

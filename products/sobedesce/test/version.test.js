// Aviso de versão nova (src/version.js) com um site falso: mais novo/igual/mais velho, build 0 nunca pergunta,
// rede fora fica quieta, "Depois" fica gravado e um build ainda mais novo avisa de novo. Mais as rotas /api/versao.
// Desde 01/11/2026 quem atualiza é a central Absolute ZRO: o aviso aponta para absolutezro://apps/sobedesce?acao=atualizar
// (src/central.js; sem a central, https://absolutezro.com/baixar), a notificação sai uma vez por build e o app não
// baixa instalador nenhum.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { Settings } from '../src/config.js'
import { VersionChecker, parseRemote, readBuildInfo } from '../src/version.js'
import { abrirNaCentral, linkDaCentral, PAGINA_DA_CENTRAL } from '../src/central.js'
import { startApp } from '../src/index.js'
import { closeHttp } from '../src/net/http.js'
import { makeTmpDir, waitFor } from './helpers.js'

const SITE = 'https://sobedesce.exemplo'
const LINK = 'absolutezro://apps/sobedesce?acao=atualizar'
const RAIZ = new URL('../', import.meta.url)
const remote = (build, extra = {}) => ({ ok: true, build, commit: 'abc1234', data: '2026-10-15T12:00:00.000Z', mac: '/baixar/mac', windows: '/baixar/windows', ...extra })

/** fetch falso: responde o que estiver em `answer` (função ou valor) e conta as chamadas. */
function fakeFetch(answer) {
  const calls = []
  const fn = async (url, opts) => {
    calls.push({ url, signal: opts?.signal })
    const a = typeof fn.answer === 'function' ? await fn.answer(url) : fn.answer
    if (a instanceof Error) throw a
    return a
  }
  fn.answer = answer
  fn.calls = calls
  return fn
}

let dir
before(async () => {
  dir = await makeTmpDir('sobedesce-versao-')
})
after(async () => {
  await fs.rm(dir, { recursive: true, force: true })
  await closeHttp()
})

async function freshSettings(name) {
  const s = new Settings(path.join(dir, `${name}.json`))
  await s.load()
  return s
}

function checker(settings, fetchJSON, build = 40, extra = {}) {
  return new VersionChecker({ settings, fetchJSON, buildInfo: { build, commit: 'def5678', data: '2026-10-01T09:00:00Z' }, baseUrl: `${SITE}/`, platform: 'darwin', ...extra })
}

test('readBuildInfo: o arquivo do repositório é a versão de desenvolvimento; arquivo estragado também', async () => {
  const own = readBuildInfo()
  assert.equal(own.build, 0)
  const bad = path.join(dir, 'bad.json')
  await fs.writeFile(bad, '{ isto não é json')
  assert.deepEqual(readBuildInfo(bad), { build: 0, commit: '', data: null })
  await fs.writeFile(bad, JSON.stringify({ build: -3 }))
  assert.equal(readBuildInfo(bad).build, 0)
  const good = path.join(dir, 'good.json')
  await fs.writeFile(good, JSON.stringify({ build: 57, commit: 'ABCDEF1', data: '2026-10-16T10:00:00Z' }))
  assert.deepEqual(readBuildInfo(good), { build: 57, commit: 'abcdef1', data: '2026-10-16T10:00:00.000Z' })
})

test('parseRemote: só aceita build inteiro positivo', () => {
  assert.equal(parseRemote(null), null)
  assert.equal(parseRemote({ ok: false }), null)
  assert.equal(parseRemote({ build: 0 }), null)
  assert.equal(parseRemote({ build: 1.5 }), null)
  assert.equal(parseRemote({ build: '12' })?.build, 12)
  assert.equal(parseRemote(remote(41)).commit, 'abc1234')
})

test('mais novo, igual e mais velho', async () => {
  const s = await freshSettings('cmp')
  const f = fakeFetch(remote(41))
  const v = checker(s, f)
  let st = await v.check()
  assert.equal(f.calls[0].url, `${SITE}/baixar/versao`)
  assert.ok(f.calls[0].signal instanceof AbortSignal, 'pergunta com tempo limite')
  assert.equal(st.nova, true)
  assert.equal(st.disponivel, true)
  assert.equal(st.ultima.build, 41)
  assert.equal(st.atual.build, 40)
  assert.equal(st.plataforma, 'mac')
  assert.equal(st.link, LINK)
  assert.equal(st.pagina, 'https://absolutezro.com/baixar')
  assert.equal(st.baixarUrl, undefined, 'nada de instalador')
  assert.equal(st.podeAtualizar, undefined)
  assert.equal(st.falhou, false)
  assert.ok(st.verificadaEm)

  f.answer = remote(40)
  st = await v.check()
  assert.equal(st.nova, false)
  assert.equal(st.disponivel, false)

  f.answer = remote(12)
  st = await v.check()
  assert.equal(st.nova, false)
  assert.equal(st.ultima.build, 12)
  v.stop()
})

test('Windows e Mac: o mesmo aviso, que aponta para a central (nenhum instalador)', async () => {
  const s = await freshSettings('plat')
  const win = checker(s, fakeFetch(remote(41, { sha256Windows: 'a'.repeat(64) })), 40, { platform: 'win32' })
  const st = await win.check()
  assert.equal(st.nova, true)
  assert.equal(st.plataforma, 'windows')
  assert.equal(st.link, LINK)
  assert.equal(st.ultima.sha256, undefined, 'o hash do instalador não interessa mais')
})

test('build 0 (desenvolvimento) nunca pergunta ao site nem avisa', async () => {
  const s = await freshSettings('dev')
  const f = fakeFetch(remote(999))
  const v = checker(s, f, 0, { firstDelayMs: 1 })
  v.start()
  await new Promise(r => setTimeout(r, 30))
  const st = await v.check()
  assert.equal(f.calls.length, 0)
  assert.equal(st.nova, false)
  assert.equal(st.ultima, null)
  assert.equal(st.atual.build, 0)
  v.stop()
})

test('rede fora ou resposta estranha: fica quieto e guarda o que já sabia', async () => {
  const s = await freshSettings('rede')
  const f = fakeFetch(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }))
  const logs = []
  const v = checker(s, f, 40, { log: (...a) => logs.push(a.join(' ')) })
  let st = await v.check()
  assert.equal(st.nova, false)
  assert.equal(st.falhou, true)
  assert.equal(st.ultima, null)
  assert.equal(logs.length, 1)

  f.answer = remote(45)
  st = await v.check()
  assert.equal(st.nova, true)
  assert.equal(st.falhou, false)

  f.answer = { ok: false }
  st = await v.check()
  assert.equal(st.falhou, true)
  assert.equal(st.nova, true, 'a última versão conhecida continua valendo')
  assert.equal(st.ultima.build, 45)
})

test('duas verificações ao mesmo tempo fazem uma pergunta só', async () => {
  const s = await freshSettings('dup')
  let release
  const f = fakeFetch(() => new Promise(r => (release = () => r(remote(41)))))
  const v = checker(s, f)
  const seen = []
  v.on('status', st => seen.push(st.verificando))
  const a = v.check()
  const b = v.check()
  assert.equal(a, b)
  assert.equal(v.status().verificando, true)
  await waitFor(() => release)
  release()
  await a
  assert.equal(f.calls.length, 1)
  assert.deepEqual(seen, [true, false])
})

test('Depois: fica gravado, sobrevive a reabrir o app e um build mais novo avisa de novo', async () => {
  const s = await freshSettings('depois')
  const f = fakeFetch(remote(41))
  const v = checker(s, f)
  await v.check()
  const events = []
  v.on('status', st => events.push(st.nova))
  let st = await v.dismiss()
  assert.equal(st.nova, false)
  assert.equal(st.disponivel, true, 'Procurar atualização ainda acha')
  assert.equal(st.dispensada, 41)
  assert.ok(events.includes(false))
  v.stop()

  // Reabre: os ajustes vêm do disco.
  const s2 = await freshSettings('depois')
  assert.equal(s2.get().versaoDispensada, 41)
  const v2 = checker(s2, f)
  st = await v2.check()
  assert.equal(st.nova, false)

  f.answer = remote(42)
  st = await v2.check()
  assert.equal(st.nova, true)

  // Dispensar um build mais velho que o já dispensado não volta atrás.
  await v2.dismiss(42)
  await v2.dismiss(41)
  assert.equal(s2.get().versaoDispensada, 42)
  await assert.rejects(v2.dismiss(43), err => err.status === 400)
  v2.stop()
})

test('Depois sem versão conhecida → 409', async () => {
  const s = await freshSettings('nada')
  const v = checker(s, fakeFetch(remote(41)))
  await assert.rejects(v.dismiss(), err => err.status === 409)
})

test('relógio: primeira verificação depois do atraso e de novo a cada intervalo', async () => {
  const s = await freshSettings('timer')
  const f = fakeFetch(remote(41))
  const v = checker(s, f, 40, { firstDelayMs: 5, everyMs: 20 })
  v.start()
  v.start() // de novo não duplica o relógio
  await waitFor(() => f.calls.length >= 3, { timeoutMs: 2000 })
  v.stop()
  const n = f.calls.length
  await new Promise(r => setTimeout(r, 60))
  assert.equal(f.calls.length, n, 'parado não pergunta mais')
})

test('cliente HTTP de verdade: lê /baixar/versao do site; 503 do site conta como falha silenciosa', async () => {
  let answer = { status: 200, body: remote(41) }
  const site = http.createServer((req, res) => {
    assert.equal(req.url, '/baixar/versao')
    res.writeHead(answer.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(answer.body))
  })
  await new Promise(r => site.listen(0, '127.0.0.1', r))
  try {
    const s = await freshSettings('http')
    const v = new VersionChecker({ settings: s, buildInfo: { build: 40 }, baseUrl: `http://127.0.0.1:${site.address().port}`, platform: 'darwin' })
    let st = await v.check()
    assert.equal(st.nova, true)
    assert.equal(st.ultima.build, 41)
    answer = { status: 503, body: { ok: false } }
    st = await v.check()
    assert.equal(st.falhou, true)
    assert.equal(st.nova, true)
  } finally {
    site.closeAllConnections?.()
    await new Promise(r => site.close(r))
  }
})

// ─────────── rotas ───────────

function call(app, method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const headers = { host: `127.0.0.1:${app.port}` }
    if (method !== 'GET') headers['content-type'] = 'application/json'
    if (data) headers['content-length'] = Buffer.byteLength(data)
    const req = http.request({ host: '127.0.0.1', port: app.port, method, path: p, headers, agent: false }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

test('rotas: /api/state, /api/versao, verificar, depois (com validação) e o evento SSE', async () => {
  const home = await makeTmpDir('sobedesce-versao-app-')
  const f = fakeFetch(remote(41))
  const app = await startApp({
    home,
    port: 0,
    open: false,
    quiet: true,
    managerOptions: { keepAwake: { active: false, setActive() {}, stop() {} } },
    serverOptions: { log: () => {}, media: false },
    versionOptions: { buildInfo: { build: 40, commit: 'def5678', data: '2026-10-01T09:00:00Z' }, baseUrl: SITE, platform: 'win32', fetchJSON: f, firstDelayMs: 60_000 },
  })
  try {
    let r = await call(app, 'GET', '/api/state')
    assert.equal(r.json.versao.atual.build, 40)
    assert.equal(r.json.versao.nova, false)
    assert.equal(f.calls.length, 0, 'só pergunta depois do atraso inicial')

    r = await call(app, 'POST', '/api/versao/depois', {})
    assert.equal(r.status, 409)
    assert.equal(r.json.ok, false)

    const sse = []
    const off = (() => {
      const send = app.server.hub.send.bind(app.server.hub)
      app.server.hub.send = (ev, d) => {
        sse.push(ev)
        send(ev, d)
      }
      return () => (app.server.hub.send = send)
    })()

    r = await call(app, 'POST', '/api/versao/verificar')
    assert.equal(r.status, 200)
    assert.equal(r.json.versao.nova, true)
    assert.equal(r.json.versao.link, LINK)
    assert.ok(sse.includes('versao'))
    off()

    r = await call(app, 'GET', '/api/versao')
    assert.equal(r.json.versao.ultima.build, 41)

    for (const build of ['41', 0, -1, 1.5, null]) {
      r = await call(app, 'POST', '/api/versao/depois', { build })
      assert.equal(r.status, 400, `build ${JSON.stringify(build)}`)
    }
    r = await call(app, 'POST', '/api/versao/depois', { build: 99 })
    assert.equal(r.status, 400)

    r = await call(app, 'POST', '/api/versao/depois', { build: 41 })
    assert.equal(r.status, 200)
    assert.equal(r.json.versao.nova, false)
    assert.equal(app.settings.get().versaoDispensada, 41)

    r = await call(app, 'GET', '/api/versao/verificar')
    assert.equal(r.status, 405)
    // o app não se atualiza mais sozinho: as rotas de baixar/instalar saíram
    for (const rota of ['/api/versao/atualizar', '/api/versao/baixar']) {
      r = await call(app, 'POST', rota, {})
      assert.equal(r.status, 404, rota)
    }
    r = await call(app, 'PATCH', '/api/settings', { versaoDispensada: 'x' })
    assert.equal(r.status, 400)
  } finally {
    await app.shutdown()
    await fs.rm(home, { recursive: true, force: true })
  }
})

test('notificação do sistema: uma vez por build, mesmo depois de reabrir; build mais novo avisa de novo', async () => {
  const s1 = await freshSettings('avisar')
  const f = fakeFetch(remote(41))
  const v = checker(s1, f)
  const avisos = []
  v.on('avisar', (a) => avisos.push(a))
  await v.check()
  await v.check()
  assert.deepEqual(avisos, [{ build: 41, link: LINK }])
  assert.equal(s1.get().versaoAvisada, 41)
  v.stop()
  // "Depois" esconde a pílula, mas não faz a notificação voltar
  const s2 = await freshSettings('avisar')
  const v2 = checker(s2, f)
  v2.on('avisar', (a) => avisos.push(a))
  await v2.check()
  assert.equal(avisos.length, 1)
  f.answer = remote(43)
  await v2.check()
  assert.deepEqual(avisos.at(-1), { build: 43, link: LINK })
  // em dia: nada
  const v3 = checker(await freshSettings('avisar-em-dia'), fakeFetch(remote(40)))
  v3.on('avisar', (a) => avisos.push(a))
  await v3.check()
  assert.equal(avisos.length, 2)
  v2.stop()
})

test('a central: deep link do contrato; sem a central (ou o sistema recusa), a página de baixar', async () => {
  assert.equal(linkDaCentral(), LINK)
  assert.equal(linkDaCentral('sobedesce', 'instalar'), 'absolutezro://apps/sobedesce?acao=instalar')
  assert.throws(() => linkDaCentral('outro'))
  assert.throws(() => linkDaCentral('sobedesce', 'apagar'))
  assert.equal(PAGINA_DA_CENTRAL, 'https://absolutezro.com/baixar')
  const abertos = []
  const abrir = async (u) => abertos.push(u)
  assert.equal(await abrirNaCentral({ temCentral: () => true, abrir }), 'central')
  assert.equal(await abrirNaCentral({ temCentral: () => false, abrir }), 'pagina')
  const recusa = async (u) => {
    abertos.push(u)
    if (u.startsWith('absolutezro:')) throw new Error('sem app para o protocolo')
  }
  assert.equal(await abrirNaCentral({ temCentral: () => true, abrir: recusa }), 'pagina')
  assert.deepEqual(abertos, [LINK, PAGINA_DA_CENTRAL, LINK, PAGINA_DA_CENTRAL])
})

test('o app não baixa instalador sozinho: sem src/updater.js, sem troca no Electron e a interface aponta para a central', async () => {
  const existe = (p) => fs.access(new URL(p, RAIZ)).then(() => true, () => false)
  assert.equal(await existe('src/updater.js'), false)
  assert.equal(await existe('src/gerenciado.js'), false)
  const ler = (p) => fs.readFile(new URL(p, RAIZ), 'utf8')
  const main = await ler('desktop/main.js')
  assert.doesNotMatch(main, /child_process|handoff|update-handoff|SOBEDESCE_APP_EXE/)
  assert.match(main, /'Atualização disponível'/)
  assert.match(main, /'Atualizar na Absolute ZRO'/)
  assert.match(main, /'sobedesce:abrir-central'/)
  assert.match(await ler('desktop/preload.cjs'), /abrirCentral: \(\) => ipcRenderer\.invoke\('sobedesce:abrir-central'\)/)
  assert.match(await ler('desktop/engine.js'), /type: 'versao-nova'/)
  const ui = (await ler('public/components/versao.js')) + (await ler('public/lib/versao.js')) + (await ler('public/components/settings.js'))
  assert.doesNotMatch(ui, /Atualizar agora|Ou baixe o instalador|Procurar atualização|\/api\/versao\/atualizar|\/api\/versao\/baixar|baixarUrl/)
  assert.match(ui, /Atualização disponível/)
  assert.match(ui, /Atualizar na Absolute ZRO/)
  assert.match(ui, /As atualizações chegam pela Absolute ZRO/)
})

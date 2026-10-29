// "Agora sua conta é Absolute ZRO" (web/src/lib/zro/ligar.ts, decisão do titular de 29/10/2026) no app do computador e
// no do celular: a conta antiga sem vínculo vê a folha (app parado) ou a faixa (algo andando); o botão abre o vincular
// de sempre no navegador e o motor confere até ligar. Nada para: o envio que estava andando termina conferido.
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { startApp } from '../src/index.js'
import { closeHttp } from '../src/net/http.js'
import { normalizeZro } from '../src/google/cloud-auth.js'
import { makeTmpDir, waitFor, randomFile } from './helpers.js'
import { startMockDrive } from './mock-drive.js'
import { startMockCloud } from './mock-cloud.js'
import { modoLigarZro, TITULO, BOTAO } from '../public/lib/ligar-zro.js'
import * as celular from '../web/public/app/lib/ligar-zro.js'

const MiB = 1024 * 1024
const LIGAR = '/api/zro/entrar?modo=vincular&volta=%2Fconta'

describe('regras puras', () => {
  test('computador: folha com o app parado, faixa com transferência ou cartão andando, nada sem pedir', () => {
    const cloud = { conectado: true, zro: { pedir: true } }
    assert.equal(modoLigarZro(cloud, { transfers: new Map(), backup: null }), 'folha')
    assert.equal(modoLigarZro(cloud, { transfers: new Map([['a', { status: 'running' }]]) }), 'faixa')
    assert.equal(modoLigarZro(cloud, { transfers: [{ status: 'queued' }] }), 'faixa')
    assert.equal(modoLigarZro(cloud, { transfers: [{ status: 'paused' }] }), 'folha', 'pausado não segura a folha')
    assert.equal(modoLigarZro(cloud, { transfers: [], backup: { job: { id: 'c1' } } }), 'faixa')
    assert.equal(modoLigarZro({ conectado: true, zro: { pedir: false } }, {}), null, 'conta ligada não vê nada')
    assert.equal(modoLigarZro({ conectado: true, zro: null }, {}), null, 'site antigo, sem o campo')
    assert.equal(modoLigarZro({ conectado: false, zro: { pedir: true } }, {}), null)
    assert.equal(TITULO, 'Agora sua conta é Absolute ZRO')
    assert.equal(BOTAO, 'Continuar com Absolute ZRO')
  })

  test('celular: tela inteira, faixa com envio andando; só com a conta aberta', () => {
    const s = (status, pedir = true) => ({ auth: { status }, zro: { pedir } })
    for (const st of ['signedIn', 'noDrive', 'choose', 'reconnect']) assert.equal(celular.modoLigar(s(st), false), 'tela', st)
    assert.equal(celular.modoLigar(s('signedIn'), true), 'faixa')
    for (const st of ['loading', 'signedOut', 'error']) assert.equal(celular.modoLigar(s(st), false), null, st)
    assert.equal(celular.modoLigar(s('signedIn', false), false), null)
    assert.equal(celular.modoLigar({ auth: { status: 'signedIn' }, zro: null }, false), null)
    assert.equal(celular.filaAndando([{ status: 'done' }, { status: 'running' }]), true)
    assert.equal(celular.filaAndando([{ status: 'paused' }, { status: 'failed' }]), false)
    assert.deepEqual(celular.lerZro({ ligada: false, pedir: true, ligar: '/x' }), { ligada: false, pedir: true })
    assert.equal(celular.lerZro(undefined), null)
    assert.equal(celular.LIGAR, '/api/zro/entrar?modo=vincular&volta=%2Fapp%2F')
    assert.match(celular.recadoDe('zro_outra_conta'), /já está ligada a outra conta SOBEDESCE/)
    assert.match(celular.recadoDe('zro_email_nao_verificado'), /confirmar seu e-mail/)
    assert.match(celular.recadoDe('zro_recusado'), /nada foi conectado/)
    assert.equal(celular.recadoDe('google_erro'), null)
    for (const t of [celular.TITULO, celular.BOTAO, celular.recadoDe('zro_erro')]) assert.doesNotMatch(t, /!/)
  })

  test('motor: lê o campo do site e só aceita caminho do próprio vincular', () => {
    assert.deepEqual(normalizeZro({ ligada: false, pedir: true, ligar: LIGAR }), { ligada: false, pedir: true, ligar: LIGAR })
    assert.equal(normalizeZro({ pedir: true, ligar: 'https://evil.example/x' }).ligar, LIGAR)
    assert.equal(normalizeZro(null), null)
  })
})

describe('app do computador', () => {
  let mock, site, home, files, app
  const keepAwake = { active: false, setActive() {}, stop() {} }

  before(async () => {
    home = await makeTmpDir()
    files = await makeTmpDir('sobedesce-ligar-zro-')
    mock = await startMockDrive()
    mock.applyEnv()
    site = await startMockCloud({ drive: mock })
    site.zro = { ligada: false, pedir: true, ligar: LIGAR }
    app = await startApp({
      home,
      port: 0,
      open: false,
      quiet: true,
      cloudOptions: { pollMs: 20, retryBaseMs: 5, refreshEveryMs: 0, zroWatchMs: 30, deviceName: 'MacBook de Teste', platform: 'darwin', baseUrl: site.url },
      managerOptions: { keepAwake, taskOptions: { upload: { retryBaseMs: 5 } } },
      serverOptions: { log: () => {} },
      acompanharOptions: { ativoMs: 150, ociosoMs: 2000, eventoMs: 20, minGapMs: 20, log: () => {} },
    })
    await app.settings.update({ keepAwake: false })
  })

  after(async () => {
    await app?.shutdown()
    await site?.close().catch(() => {})
    await mock?.close()
    await fs.rm(home, { recursive: true, force: true, maxRetries: 3 })
    await fs.rm(files, { recursive: true, force: true, maxRetries: 3 })
    await closeHttp()
  })

  function call(method, p, body) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body)
      const headers = { host: `127.0.0.1:${app.port}` }
      if (method !== 'GET') headers['content-type'] = 'application/json'
      if (data != null) headers['content-length'] = Buffer.byteLength(data)
      const req = http.request({ host: '127.0.0.1', port: app.port, method, path: p, headers, agent: false }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          try {
            json = JSON.parse(text)
          } catch {}
          resolve({ status: res.statusCode, text, json })
        })
      })
      req.on('error', reject)
      if (data != null) req.write(data)
      req.end()
    })
  }

  test('sem conta: nada a pedir; a rota de ligar recusa', async () => {
    const r = await call('GET', '/api/state')
    assert.equal(r.json.cloud.zro, null)
    assert.equal((await call('POST', '/api/cloud/zro/ligar', {})).status, 409)
  })

  test('conta antiga: pede; o envio segue enquanto liga; ligou, a folha some e o envio termina', async () => {
    let r = await call('POST', '/api/cloud/login', {})
    site.approve(r.json.cloud.login.codigo)
    await waitFor(async () => (await call('GET', '/api/cloud')).json.cloud.zro?.pedir === true, { message: 'o motor leu zro.pedir' })
    r = await call('GET', '/api/cloud')
    assert.deepEqual(r.json.cloud.zro, { ligada: false, pedir: true, esperando: false })
    assert.equal(r.json.cloud.contas.length, 2, 'os Drives continuam lá')

    // Um envio começa sem vínculo: o token do Drive sai normalmente.
    const arquivo = path.join(files, 'Brutos_A002.mov')
    const md5 = await randomFile(arquivo, 6 * MiB + 5, 91)
    r = await call('POST', '/api/transfers/upload', { accountId: 'nuvem:g1', paths: [arquivo], destFolderId: 'root' })
    assert.equal(r.status, 200, r.text)
    const batch = r.json.batch.id

    // "Continuar com Absolute ZRO" no meio do envio: devolve o vincular de sempre e passa a conferir.
    r = await call('POST', '/api/cloud/zro/ligar', {})
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json.url, `${site.url}${LIGAR}`)
    assert.equal(r.json.cloud.zro.esperando, true)

    // A pessoa liga no navegador: o motor percebe sozinho e a folha some.
    site.zro = { ligada: true, pedir: false, ligar: LIGAR }
    await waitFor(async () => (await call('GET', '/api/cloud')).json.cloud.zro?.pedir === false, { message: 'o motor viu a conta ligada' })
    assert.equal((await call('GET', '/api/cloud')).json.cloud.zro.esperando, false)
    assert.equal((await call('GET', '/api/cloud')).json.cloud.conectado, true, 'ninguém saiu da conta')

    // O envio terminou conferido, sem erro nem pausa.
    await waitFor(
      async () => (await call('GET', '/api/state')).json.transfers.filter((t) => t.batchId === batch).every((t) => t.status === 'completed'),
      { timeoutMs: 20_000, message: 'o envio terminou' },
    )
    const t = (await call('GET', '/api/state')).json.transfers.find((x) => x.batchId === batch)
    assert.equal(t.error ?? null, null)
    assert.equal(await mock.contentMd5(t.target.fileId), md5, 'o arquivo chegou inteiro')
  })
})

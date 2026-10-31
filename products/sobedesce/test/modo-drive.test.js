// Drive híbrido no app de computador (docs/CONTAS.md §13): a mesma marca e as mesmas regras do celular, pastas novas
// com a marca, Comparar só nas pastas do SOBEDESCE em Arquivos escolhidos (nunca "falta subir" do que só está
// invisível) e a conta SOBEDESCE dizendo o modo (e o computador dizendo ao site que entende).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as motor from '../src/google/modo-drive.js'
import * as tela from '../public/lib/modo-drive.js'
import * as celular from '../web/public/app/lib/modo-drive.js'
import { CAPACIDADES_DO_APP, dataPaths } from '../src/config.js'
import { CloudAuth } from '../src/google/cloud-auth.js'
import { AuthManager } from '../src/google/oauth.js'
import { DriveClient } from '../src/google/drive.js'
import { compareFolders } from '../src/engine/compare.js'
import { closeHttp } from '../src/net/http.js'
import { setupDrive, makeTmpDir, randomFile, waitFor } from './helpers.js'
import { startMockCloud } from './mock-cloud.js'

after(() => closeHttp())

test('a marca, os nomes e a regra são os mesmos no motor, na tela e no celular', () => {
  for (const m of [motor, tela]) {
    assert.deepEqual({ ...m.MARCA_PASTA }, { ...celular.MARCA_PASTA })
    assert.deepEqual({ ...m.NOME_MODO }, { ...celular.NOME_MODO })
    assert.equal(m.PRECISA_TOTAL, celular.PRECISA_TOTAL)
    const casos = [null, {}, { sd: true }, { appProperties: {} }, { appProperties: { sobedesce: 'pasta' } }, { appProperties: { sobedesce: 'referencias' } }, { appProperties: { sobedesce: '' } }, { appProperties: { outro: 'x' } }]
    for (const c of casos) assert.equal(m.criadaPeloSobedesce(c), celular.criadaPeloSobedesce(c), JSON.stringify(c))
    for (const conta of [null, {}, { modo: 'total' }, { modo: 'arquivos' }, { modo: 'outro' }]) assert.equal(m.modoDe(conta), celular.modoDe(conta))
  }
  for (const modo of ['total', 'arquivos']) {
    for (const p of [null, { sd: true }, { appProperties: { sobedesce: 'pasta' } }]) assert.equal(motor.lugarCompleto(modo, p), celular.lugarCompleto(modo, p))
  }
  // O que muda: o computador fala de comparar e de somar o tamanho; a última linha é a mesma do celular.
  assert.equal(tela.DICA_MODO.arquivos.at(-1), celular.DICA_MODO.arquivos.at(-1))
  // O computador diz ao site que entende o modo (sem isso, o site recusa o token drive.file).
  assert.ok(CAPACIDADES_DO_APP.includes(motor.CAPACIDADE_MODO))
  const e = motor.erroPrecisaTotal()
  assert.equal(e.status, 403)
  assert.equal(e.code, 'precisa_acesso_total')
  assert.ok(e.message.startsWith(motor.PRECISA_TOTAL))
})

test('Escolher do Drive abre o site no Drive certo, sem token, só para conta da conta SOBEDESCE', () => {
  assert.equal(tela.urlEscolher('nuvem:abc_DEF-123', 'https://sobedesce.com'), 'https://sobedesce.com/app/#escolher/abc_DEF-123')
  assert.equal(tela.urlEscolher('nuvem:abc', 'https://sobedesce.com/conta?x=1'), 'https://sobedesce.com/app/#escolher/abc')
  assert.equal(tela.urlEscolher('nuvem:abc', 'http://127.0.0.1:3000'), 'http://127.0.0.1:3000/app/#escolher/abc')
  for (const [id, site] of [
    ['acc_local', 'https://sobedesce.com'],
    ['nuvem:', 'https://sobedesce.com'],
    ['nuvem:a/b', 'https://sobedesce.com'],
    ['nuvem:a b', 'https://sobedesce.com'],
    ['nuvem:abc', 'http://sobedesce.com'],
    ['nuvem:abc', 'javascript:alert(1)'],
    ['nuvem:abc', ''],
  ]) {
    assert.equal(tela.urlEscolher(id, site), null, `${id} ${site}`)
  }
})

/** Drive falso com a conta deste computador; `modo` força o modo da conta (como se viesse da conta SOBEDESCE). */
async function setup(t, modo = 'total') {
  const ctx = await setupDrive()
  const dir = await makeTmpDir('sobedesce-modo-')
  t.after(async () => {
    await ctx.cleanup()
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })
  })
  ctx.auth.modoDe = () => modo
  const drive = new DriveClient(ctx.auth, ctx.accountId, { ratePerSec: 1000, retryBaseMs: 5 })
  return { ...ctx, drive, dir }
}

test('toda pasta que o app cria leva a marca do SOBEDESCE (createFolder e ensureFolderPath)', async t => {
  const { mock, drive } = await setup(t)
  const a = await drive.createFolder('Projeto', 'root')
  assert.deepEqual(mock.getItem(a.id).appProperties, { sobedesce: 'pasta' })
  assert.equal(motor.criadaPeloSobedesce(a), true, 'o item devolvido já vem com a marca')
  const id = await drive.ensureFolderPath(a.id, 'Diária 01/Cenas')
  const cenas = mock.getItem(id)
  assert.deepEqual(cenas.appProperties, { sobedesce: 'pasta' })
  assert.deepEqual(mock.getItem(cenas.parents[0]).appProperties, { sobedesce: 'pasta' })
})

test('pastaCompleta: acesso total sempre; Arquivos escolhidos só na pasta do SOBEDESCE (nunca a raiz)', async t => {
  const total = await setup(t, 'total')
  assert.deepEqual(await total.drive.pastaCompleta('root'), { completo: true, pasta: null })

  const { mock, drive } = await setup(t, 'arquivos')
  assert.equal(drive.modo, 'arquivos')
  const nossa = mock.addFolder('Nossa', 'root', { appProperties: { sobedesce: 'pasta' } })
  const outra = mock.addFolder('Outra', 'root')
  assert.equal((await drive.pastaCompleta('root')).completo, false)
  assert.equal((await drive.pastaCompleta(outra.id)).completo, false)
  assert.equal((await drive.pastaCompleta(nossa.id)).completo, true)
})

test('Comparar em Arquivos escolhidos: "Precisa de acesso total" fora da pasta do SOBEDESCE; dentro, compara', async t => {
  const { mock, drive, dir } = await setup(t, 'arquivos')
  await randomFile(path.join(dir, 'A001.mov'), 2048, 3)
  await randomFile(path.join(dir, 'Cenas', 'B001.mov'), 1024, 4)

  const recusa = async (folderId, re) => {
    const err = await compareFolders({ drive, localPath: dir, driveFolderId: folderId, persist: false }).then(
      () => null,
      e => e,
    )
    assert.ok(err, 'devia recusar')
    assert.equal(err.status, 403)
    assert.equal(err.code, 'precisa_acesso_total')
    assert.ok(err.message.startsWith('Precisa de acesso total'), err.message)
    if (re) assert.match(err.message, re)
  }
  // A raiz do Meu Drive e uma pasta qualquer: o que não aparece só está invisível, nunca "falta subir".
  await recusa('root')
  const outra = mock.addFolder('Outra', 'root')
  await recusa(outra.id)
  // Pasta do SOBEDESCE com uma subpasta de fora (criada no site do Google ou pelo app antigo): também recusa.
  const nossa = mock.addFolder('Nossa', 'root', { appProperties: { sobedesce: 'pasta' } })
  mock.addFolder('Cenas', nossa.id)
  await recusa(nossa.id, /Cenas/)

  // Tudo criado pelo SOBEDESCE: compara e diz o que falta de verdade.
  const limpa = await drive.createFolder('Limpa', 'root')
  const cenas = await drive.createFolder('Cenas', limpa.id)
  mock.addFile('A001.mov', limpa.id, { size: 2048, seed: 3 })
  const r = await compareFolders({ drive, localPath: dir, driveFolderId: limpa.id, persist: false })
  const por = Object.fromEntries(r.files.map(f => [f.relPath, f.status]))
  assert.equal(por['A001.mov'], 'synced')
  assert.equal(por['Cenas/B001.mov'], 'missing')
  assert.ok(cenas.id)

  // Acesso total: a mesma pasta de fora compara como sempre.
  drive.auth.modoDe = () => 'total'
  const r2 = await compareFolders({ drive, localPath: dir, driveFolderId: outra.id, persist: false })
  assert.equal(r2.summary.missing, 2)
})

test('conta SOBEDESCE: o modo vem do site, o computador diz que entende e o 403 do site vira "Precisa de acesso total"', async t => {
  const home = await makeTmpDir()
  const site = await startMockCloud({
    autoApprove: false,
    contas: [
      { id: 'g1', email: 'ana@gmail.com', nome: 'Ana', estado: 'ok', modo: 'arquivos' },
      { id: 'g2', email: 'estudio@gmail.com', nome: 'Estúdio', estado: 'ok', modo: 'total' },
      { id: 'g3', email: 'antigo@gmail.com', nome: 'Antigo', estado: 'ok' },
    ],
  })
  t.after(async () => {
    await site.close().catch(() => {})
    await fs.rm(home, { recursive: true, force: true })
  })
  const paths = dataPaths(home)
  const cloud = new CloudAuth({ paths, baseUrl: site.url, pollMs: 20, retryBaseMs: 5, refreshEveryMs: 0, deviceName: 'Mac', platform: 'darwin' })
  await cloud.init()
  const login = await cloud.beginLogin()
  site.approve(login.codigo)
  await waitFor(() => cloud.listAccounts().length === 3, { timeoutMs: 5000, message: 'as contas não chegaram' })
  const auth = new AuthManager({ paths, cloud })
  await auth.init()
  const modos = Object.fromEntries(auth.listAccounts().map(a => [a.id, a.modo]))
  assert.deepEqual(modos, { 'nuvem:g1': 'arquivos', 'nuvem:g2': 'total', 'nuvem:g3': 'total' }, 'site antigo, sem o campo: total')
  assert.equal(auth.modoDe('nuvem:g1'), 'arquivos')
  assert.equal(auth.modoDe('acc_local'), 'total', 'conta deste computador: Drive inteiro')
  assert.equal(cloud.status().contas.find(c => c.id === 'nuvem:g1').modo, 'arquivos', 'Ajustes mostram o modo')

  // Com a capacidade (todo pedido): o site entrega o token drive.file.
  assert.match(await cloud.getAccessToken('g1'), /^ya29\./)
  assert.ok(site.capacidades.every(c => String(c).split(',').includes('drive-arquivos')))

  // O admin ligou o acesso total: o modo novo chega junto com o token.
  site.contas[0].modo = 'total'
  await cloud.getAccessToken('g1', { forceRefresh: true })
  assert.equal(auth.modoDe('nuvem:g1'), 'total')

  // Site que recusa (403 precisa_acesso_total): erro que não repete, com a mensagem do site; o modo fica 'arquivos'.
  site.contas[0].modo = 'arquivos'
  site.recusarArquivos = true
  const antes = site.stats.token
  const err = await cloud.getAccessToken('g1', { forceRefresh: true }).catch(e => e)
  assert.equal(err.kind, 'fatal')
  assert.equal(err.reason, 'precisaAcessoTotal')
  assert.match(err.message, /Atualize o SOBEDESCE/)
  assert.equal(site.stats.token, antes + 1, 'não fica martelando o site')
  assert.equal(auth.modoDe('nuvem:g1'), 'arquivos')
  cloud.close()
})

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const r = require('../desktop/regras.cjs')
const HUB = 'https://absolutezro.com'

test('endereço do HUB: oficial no app instalado; ZRO_HUB_URL só em desenvolvimento', () => {
  assert.equal(r.hubOrigin({ empacotado: true, env: { ZRO_HUB_URL: 'https://outro.example.com' } }), HUB)
  assert.equal(r.hubOrigin({ empacotado: false, env: {} }), HUB)
  assert.equal(r.hubOrigin({ empacotado: false, env: { ZRO_HUB_URL: 'http://localhost:3000/' } }), 'http://localhost:3000')
  assert.equal(r.hubOrigin({ empacotado: false, env: { ZRO_HUB_URL: 'https://preview.vercel.app/x' } }), 'https://preview.vercel.app')
  // http fora do localhost, credenciais embutidas e lixo voltam para o oficial
  assert.equal(r.hubOrigin({ empacotado: false, env: { ZRO_HUB_URL: 'http://exemplo.com' } }), HUB)
  assert.equal(r.hubOrigin({ empacotado: false, env: { ZRO_HUB_URL: 'https://a:b@exemplo.com' } }), HUB)
  assert.equal(r.hubOrigin({ empacotado: false, env: { ZRO_HUB_URL: 'não é url' } }), HUB)
})

test('navegação: só o HUB e o login do Google ficam na janela', () => {
  for (const url of [`${HUB}/`, `${HUB}/inicio?x=1#a`, `${HUB}/baixar`, 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x']) {
    assert.equal(r.destino(url, HUB), 'app', url)
  }
  for (const url of [
    'https://sobedesce.vercel.app/',
    'https://nossom.absolutezro.com/studio',
    'https://synquei.vercel.app/app/',
    'https://tpeasy.vercel.app/app/',
    'https://carro.absolutezro.com',
    'https://github.com/victorbarrosoc-hub',
    // parecidos com o HUB, mas não são ele
    'https://absolutezro.com.evil.com/',
    'https://evil-absolutezro.com/',
    'https://absolutezro.com:8443/',
    'https://accounts.google.com.evil.com/',
    'https://mail.google.com/',
  ]) {
    assert.equal(r.destino(url, HUB), 'fora', url)
  }
  for (const url of [
    'http://absolutezro.com/',
    'http://accounts.google.com/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'smb://servidor/x',
    'mailto:a@b.c',
    'data:text/html,oi',
    '',
    'lixo',
  ]) {
    assert.equal(r.destino(url, HUB), 'nada', url)
  }
  assert.equal(r.destino(`https://user:senha@absolutezro.com/`, HUB), 'nada')
  assert.equal(r.ehLoginGoogle('https://accounts.google.com:444/'), false)
})

test('links externos: só https, sem credenciais', () => {
  assert.equal(r.linkExterno('https://sobedesce.vercel.app'), 'https://sobedesce.vercel.app/')
  assert.equal(r.linkExterno('http://sobedesce.vercel.app'), null)
  assert.equal(r.linkExterno('https://a:b@x.com'), null)
  assert.equal(r.linkExterno('file:///C:/Windows/system32/calc.exe'), null)
})

test('deep link absolutezro:// abre só rotas do HUB', () => {
  assert.equal(r.deepLink('absolutezro://projetos/123?aba=arquivos#topo', HUB), `${HUB}/projetos/123?aba=arquivos#topo`)
  assert.equal(r.deepLink('absolutezro:///inicio', HUB), `${HUB}/inicio`)
  assert.equal(r.deepLink('absolutezro:inicio', HUB), `${HUB}/inicio`)
  assert.equal(r.deepLink('ABSOLUTEZRO://inicio', HUB), `${HUB}/inicio`)
  assert.equal(r.deepLink('absolutezro://', HUB), `${HUB}/`)
  assert.equal(r.deepLink('absolutezro://a/../../baixar', HUB), `${HUB}/baixar`)
  // nunca sai do HUB
  for (const ruim of [
    'absolutezro://evil.com@absolutezro.com/',
    'absolutezro://user@evil.com',
    'absolutezro:////evil.com/x',
    'absolutezro:\\\\evil.com\\x',
    'absolutezro://api/v1/auth/logout',
    'absolutezro://oauth/authorize?client_id=x',
    'absolutezro://.well-known/openid-configuration',
    'https://absolutezro.com/inicio',
    'outro://inicio',
    'absolutezro://' + 'a'.repeat(3000),
  ]) {
    const alvo = r.deepLink(ruim, HUB)
    assert.ok(alvo === null || new URL(alvo).origin === HUB, ruim)
    if (/api|oauth|well-known|https:|outro:|aaaa|@/.test(ruim)) assert.equal(alvo, null, ruim)
  }
  assert.equal(new URL(r.deepLink('absolutezro:////evil.com/x', HUB)).origin, HUB)
  assert.equal(r.deepLinkDosArgs(['C:\\app.exe', '--flag', 'absolutezro://inicio'], HUB), `${HUB}/inicio`)
  assert.equal(r.deepLinkDosArgs(['app', '--smoke'], HUB), null)
})

test('deep link de app (ADR 0036): absolutezro://apps/<id>?acao=atualizar|instalar abre o cartão do app e só oferece', () => {
  assert.deepEqual(r.linkDeApp('absolutezro://apps/maestro?acao=atualizar'), { id: 'maestro', acao: 'atualizar' })
  assert.deepEqual(r.linkDeApp('absolutezro://apps/rift-motion?acao=instalar'), { id: 'rift-motion', acao: 'instalar' })
  assert.deepEqual(r.linkDeApp('absolutezro:apps/relay/'), { id: 'relay', acao: null })
  assert.deepEqual(r.linkDeApp('absolutezro://apps/relay?acao=remover'), { id: 'relay', acao: null }, 'só atualizar e instalar')
  for (const ruim of [
    'absolutezro://apps/../api',
    'absolutezro://apps/Maestro',
    'absolutezro://apps/a',
    'absolutezro://apps/x/y',
    'https://apps/maestro',
    'absolutezro://apps/%2e%2e',
  ])
    assert.equal(r.linkDeApp(ruim), null, ruim)
  assert.equal(r.deepLink('absolutezro://apps/maestro?acao=atualizar', HUB), `${HUB}/app?app=maestro&acao=atualizar#app-maestro`)
  assert.equal(r.deepLink('absolutezro://apps/rift-motion?acao=instalar&x=<script>', HUB), `${HUB}/app?app=rift-motion&acao=instalar#app-rift-motion`)
  assert.equal(r.deepLink('absolutezro://apps/tpeasy', HUB), `${HUB}/app?app=tpeasy#app-tpeasy`)
  // Windows passa o link na linha de comando; a segunda instância repassa a rota já convertida
  assert.equal(
    r.deepLinkDosArgs(['C:\\Absolute ZRO.exe', 'absolutezro://apps/synquei?acao=atualizar'], HUB),
    `${HUB}/app?app=synquei&acao=atualizar#app-synquei`,
  )
  assert.equal(r.deepLink('absolutezro://app?app=synquei&acao=atualizar#app-synquei', HUB), `${HUB}/app?app=synquei&acao=atualizar#app-synquei`)
})

test('permissões: só copiar e tela cheia, e só para o HUB', () => {
  assert.equal(r.permitir('clipboard-sanitized-write', `${HUB}/inicio`, HUB), true)
  assert.equal(r.permitir('fullscreen', HUB, HUB), true)
  for (const p of ['media', 'notifications', 'geolocation', 'midi', 'openExternal', 'clipboard-read', 'display-capture'])
    assert.equal(r.permitir(p, HUB, HUB), false, p)
  assert.equal(r.permitir('clipboard-sanitized-write', 'https://accounts.google.com/', HUB), false)
})

test('erros de rede e agente de usuário', () => {
  assert.equal(r.ehErroDeRede(-106), true)
  assert.equal(r.ehErroDeRede(-105), true)
  assert.equal(r.ehErroDeRede(-200), false)
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) absolute-zro-desktop/1.0.0 Chrome/140.0.0.0 Electron/44.5.1 Safari/537.36'
  const limpo = r.agenteLimpo(ua)
  assert.doesNotMatch(limpo, /Electron|absolute-zro/i)
  assert.match(limpo, /Chrome\/140\.0\.0\.0 Safari\/537\.36$/)
})

test('download da central: só o HUB (/baixar/), o Release no GitHub do dono e o servidor de arquivos do GitHub', () => {
  const ok = (u) => r.downloadPermitido(u, HUB)
  assert.equal(ok(HUB + '/baixar/app/maestro/Maestro-0.2.1-b9-mac-universal.dmg'), true)
  assert.equal(ok('https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/maestro-versao-de-teste/Maestro-0.2.1-b9-mac-universal.dmg'), true)
  assert.equal(ok('https://release-assets.githubusercontent.com/github-production-release-asset/1/abc?sp=r&sig=x'), true)
  assert.equal(ok('https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/abc'), true)
  // fora da regra
  assert.equal(ok(HUB + '/api/v1/desktop/apps'), false)
  assert.equal(ok('http://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/x/y.dmg'), false)
  assert.equal(ok('https://github.com/outra-pessoa/AbsoluteZRO/releases/download/x/y.dmg'), false)
  assert.equal(ok('https://github.com/victorbarrosoc-hub/AbsoluteZRO/archive/main.zip'), false)
  assert.equal(ok('https://release-assets.githubusercontent.com:8443/x'), false)
  assert.equal(ok('https://evil.example.com/AbsoluteZRO-1.4.0-mac-universal.dmg'), false)
  assert.equal(ok('https://user:senha@github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/x/y.dmg'), false)
  assert.equal(ok('file:///tmp/x.dmg'), false)
  assert.equal(ok('não é url'), false)
})

test('marca flat na tela "Sem conexão": o wordmark oficial do HUB, nada do feixe de luz antigo', async () => {
  const fs = await import('node:fs')
  const raiz = new URL('../', import.meta.url)
  const ler = (p) => fs.readFileSync(new URL(p, raiz))
  assert.ok(ler('desktop/paginas/marca.svg').equals(ler('../hub-web/public/brand/absolute-zro-grafite.svg')))
  assert.equal(fs.existsSync(new URL('desktop/paginas/marca.webp', raiz)), false)
  assert.match(ler('desktop/paginas/offline.html').toString(), /src="marca\.svg"/)
})

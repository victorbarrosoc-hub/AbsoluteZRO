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
    'https://nossom-teal.vercel.app/studio',
    'https://synquei.vercel.app/app/',
    'https://tpeasy.absolutezro.com/app/',
    'https://carrodofreela.com.br',
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

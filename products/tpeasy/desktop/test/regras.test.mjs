// O que fica na janela do TPeasy, o que vai para o navegador, deep link e permissões (sem Electron).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const r = require('../desktop/regras.cjs')
const O = { tpeasy: 'https://tpeasy.absolutezro.com', hub: 'https://absolutezro.com' }
const M = O.tpeasy
const HUB = O.hub

test('endereços: oficiais no app instalado; TPEASY_URL e ZRO_HUB_URL só em desenvolvimento', () => {
  assert.deepEqual(r.origens({ empacotado: true, env: { TPEASY_URL: 'https://outro.example.com', ZRO_HUB_URL: 'http://localhost:3000' } }), O)
  assert.deepEqual(r.origens({ empacotado: false, env: {} }), O)
  assert.deepEqual(r.origens({ empacotado: false, env: { TPEASY_URL: 'http://127.0.0.1:4301/x', ZRO_HUB_URL: 'http://localhost:4302/' } }), {
    tpeasy: 'http://127.0.0.1:4301',
    hub: 'http://localhost:4302',
  })
  // http fora do computador, credenciais embutidas e lixo voltam para os oficiais
  for (const ruim of ['http://exemplo.com', 'https://a:b@exemplo.com', 'não é url', 'file:///etc', 'javascript:alert(1)'])
    assert.deepEqual(r.origens({ empacotado: false, env: { TPEASY_URL: ruim, ZRO_HUB_URL: ruim } }), O, ruim)
})

test('na janela: o site, as telas do login único e o login do Google', () => {
  for (const url of [
    `${M}/`,
    `${M}/converter`,
    `${M}/entrar?volta=%2F`,
    `${M}/api/zro/entrar?volta=%2F`,
    `${M}/api/zro/callback?code=x&state=y`,
    `${HUB}/oauth/authorize?client_id=tpeasy-web&response_type=code`,
    `${HUB}/entrar?next=%2Foauth%2Fauthorize`,
    `${HUB}/entrar/google?next=x`,
    `${HUB}/entrar/google/retorno?code=x`,
    `${HUB}/criar-conta?next=x`,
    `${HUB}/esqueci-a-senha`,
    `${HUB}/redefinir-senha?token=x`,
    `${HUB}/confirmar-email`,
    `${HUB}/boas-vindas?next=x`,
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
    'https://accounts.google.com/signin/v2/challenge',
  ]) {
    assert.equal(r.destino(url, O), 'app', url)
  }
})

test('no navegador: o resto do HUB e os outros sites; parecidos não enganam', () => {
  for (const url of [
    `${HUB}/`,
    `${HUB}/inicio`,
    `${HUB}/perfil`,
    `${HUB}/conexoes`,
    `${HUB}/planos`,
    `${HUB}/baixar`,
    `${HUB}/oauth/token`,
    `${HUB}/entrarx`,
    'https://sobedesce.vercel.app/',
    'https://wa.me/5511999999999?text=oi',
    'https://drive.google.com/file/d/x/view',
    'https://www.youtube.com/watch?v=x',
    'https://tpeasy.absolutezro.com.evil.com/',
    'https://evil-tpeasy.absolutezro.com/',
    'https://tpeasy.absolutezro.com:8443/',
    'https://absolutezro.com.evil.com/oauth/authorize',
    'https://accounts.google.com.evil.com/',
    'https://mail.google.com/',
  ]) {
    assert.equal(r.destino(url, O), 'fora', url)
  }
})

test('saídas para o sistema: só https e e-mail; nada de esquema perigoso', () => {
  assert.equal(r.destino('mailto:contato@exemplo.com', O), 'fora')
  assert.equal(r.linkExterno('mailto:contato@exemplo.com?subject=Oi', O), 'mailto:contato@exemplo.com?subject=Oi')
  for (const url of [
    'webcal://tpeasy.absolutezro.com/api/agenda/abc123.ics',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'smb://servidor/pasta',
    'http://tpeasy.absolutezro.com/',
    'data:text/html,<h1>x</h1>',
    'https://usuario:senha@exemplo.com/',
    'mailto:',
    'não é url',
  ]) {
    assert.equal(r.destino(url, O), 'nada', url)
  }
})

test('deep link tpeasy://: só rotas do TPeasy, nunca a API', () => {
  assert.equal(r.deepLink('tpeasy://painel?x=1', O), `${M}/painel?x=1`)
  assert.equal(r.deepLink('tpeasy:///painel', O), `${M}/painel`)
  assert.equal(r.deepLink('tpeasy:painel', O), `${M}/painel`)
  assert.equal(r.deepLink('TPEASY://painel', O), `${M}/painel`)
  for (const ruim of [
    'tpeasy://api/zro/sair',
    'tpeasy://API/x',
    'tpeasy://.well-known/x',
    'tpeasy://evil.example.com@x',
    'tpeasy://usuario@host/x',
    'tpeasy:////evil.example.com/x',
    'absolutezro://x',
    'https://tpeasy.absolutezro.com/x',
    `tpeasy://${'x'.repeat(2100)}`,
  ]) {
    const alvo = r.deepLink(ruim, O)
    assert.ok(alvo === null || alvo.startsWith(M + '/'), ruim)
    if (alvo) assert.ok(!/\/api\//i.test(new URL(alvo).pathname), ruim)
  }
  assert.equal(r.deepLink('tpeasy://evil.example.com@x', O), null)
  assert.equal(r.deepLink('tpeasy://api/zro/sair', O), null)
  assert.equal(r.deepLinkDosArgs(['/caminho/TPeasy.exe', '--x', 'tpeasy://painel'], O), `${M}/painel`)
  assert.equal(r.deepLinkDosArgs(['/caminho/TPeasy.exe'], O), null)
})

test('permissões: só o permitido, e só para o TPeasy', () => {
  assert.equal(r.permitir('clipboard-sanitized-write', `${M}/`, O), true)
  assert.equal(r.permitir('fullscreen', `${M}/`, O), true)
  // "Rolar com a voz": só o microfone, só para o TPeasy (câmera, tela ou pedido sem dizer o quê ficam negados)
  assert.equal(r.permitir('media', `${M}/app/`, O, { mediaTypes: ['audio'] }), true)
  assert.equal(r.permitir('media', `${M}/app/`, O, { mediaType: 'audio' }), true)
  assert.equal(r.permitir('media', `${M}/app/`, O, { mediaTypes: ['audio', 'video'] }), false)
  assert.equal(r.permitir('media', `${M}/app/`, O, { mediaTypes: ['video'] }), false)
  assert.equal(r.permitir('media', `${M}/app/`, O, { mediaType: 'unknown' }), false)
  assert.equal(r.permitir('media', `${M}/app/`, O), false)
  assert.equal(r.permitir('media', `${HUB}/entrar`, O, { mediaTypes: ['audio'] }), false)
  for (const p of ['fileSystem', 'geolocation', 'notifications', 'midi', 'clipboard-read', 'openExternal', 'pointerLock'])
    assert.equal(r.permitir(p, `${M}/`, O), false, p)
  assert.equal(r.permitir('fullscreen', `${HUB}/entrar`, O), false)
  assert.equal(r.permitir('clipboard-sanitized-write', 'https://accounts.google.com/', O), false)
})

test('erros de rede e agente de usuário limpo', () => {
  assert.equal(r.ehErroDeRede(-106), true)
  assert.equal(r.ehErroDeRede(-105), true)
  assert.equal(r.ehErroDeRede(-202), false)
  const ua = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) tpeasy-desktop/0.1.0 Chrome/140.0 Electron/44.5.1 Safari/537.36'
  assert.equal(r.agenteLimpo(ua), 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')
})

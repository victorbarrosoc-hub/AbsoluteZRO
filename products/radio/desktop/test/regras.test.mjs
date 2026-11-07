// O que fica na janela do RADION, o que vai para o navegador, deep link e permissões (sem Electron).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const r = require('../desktop/regras.cjs')
const O = { radion: 'https://radion.absolutezro.com', hub: 'https://absolutezro.com' }
const M = O.radion
const HUB = O.hub

test('endereços: oficiais no app instalado; RADION_URL e ZRO_HUB_URL só em desenvolvimento', () => {
  assert.deepEqual(r.origens({ empacotado: true, env: { RADION_URL: 'https://outro.example.com', ZRO_HUB_URL: 'http://localhost:3000' } }), O)
  assert.deepEqual(r.origens({ empacotado: false, env: {} }), O)
  assert.deepEqual(r.origens({ empacotado: false, env: { RADION_URL: 'http://127.0.0.1:4301/x', ZRO_HUB_URL: 'http://localhost:4302/' } }), {
    radion: 'http://127.0.0.1:4301',
    hub: 'http://localhost:4302',
  })
  // http fora do computador, credenciais embutidas e lixo voltam para os oficiais
  for (const ruim of ['http://exemplo.com', 'https://a:b@exemplo.com', 'não é url', 'file:///etc', 'javascript:alert(1)'])
    assert.deepEqual(r.origens({ empacotado: false, env: { RADION_URL: ruim, ZRO_HUB_URL: ruim } }), O, ruim)
})

test('na janela: o site, as telas do login único (o Google não: disallowed_useragent)', () => {
  for (const url of [
    `${M}/`,
    `${M}/converter`,
    `${M}/entrar?volta=%2F`,
    `${M}/api/zro/entrar?volta=%2F`,
    `${M}/api/zro/callback?code=x&state=y`,
    `${HUB}/oauth/authorize?client_id=radio-web&response_type=code`,
    `${HUB}/entrar?next=%2Foauth%2Fauthorize`,
    `${HUB}/entrar/google?next=x`,
    `${HUB}/entrar/google/retorno?code=x`,
    `${HUB}/criar-conta?next=x`,
    `${HUB}/esqueci-a-senha`,
    `${HUB}/redefinir-senha?token=x`,
    `${HUB}/confirmar-email`,
    `${HUB}/boas-vindas?next=x`,
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
    'https://radion.absolutezro.com.evil.com/',
    'https://evil-radion.absolutezro.com/',
    'https://radion.absolutezro.com:8443/',
    'https://absolutezro.com.evil.com/oauth/authorize',
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
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
    'webcal://radion.absolutezro.com/api/agenda/abc123.ics',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'smb://servidor/pasta',
    'http://radion.absolutezro.com/',
    'data:text/html,<h1>x</h1>',
    'https://usuario:senha@exemplo.com/',
    'mailto:',
    'não é url',
  ]) {
    assert.equal(r.destino(url, O), 'nada', url)
  }
})

test('deep link radion://: só rotas do RADION, nunca a API', () => {
  assert.equal(r.deepLink('radion://painel?x=1', O), `${M}/painel?x=1`)
  assert.equal(r.deepLink('radion:///painel', O), `${M}/painel`)
  assert.equal(r.deepLink('radion:painel', O), `${M}/painel`)
  assert.equal(r.deepLink('RADION://painel', O), `${M}/painel`)
  for (const ruim of [
    'radion://api/zro/sair',
    'radion://API/x',
    'radion://.well-known/x',
    'radion://evil.example.com@x',
    'radion://usuario@host/x',
    'radion:////evil.example.com/x',
    'absolutezro://x',
    'https://radion.absolutezro.com/x',
    `radion://${'x'.repeat(2100)}`,
  ]) {
    const alvo = r.deepLink(ruim, O)
    assert.ok(alvo === null || alvo.startsWith(M + '/'), ruim)
    if (alvo) assert.ok(!/\/api\//i.test(new URL(alvo).pathname), ruim)
  }
  assert.equal(r.deepLink('radion://evil.example.com@x', O), null)
  assert.equal(r.deepLink('radion://api/zro/sair', O), null)
  assert.equal(r.deepLinkDosArgs(['/caminho/RADION.exe', '--x', 'radion://painel'], O), `${M}/painel`)
  assert.equal(r.deepLinkDosArgs(['/caminho/RADION.exe'], O), null)
})

test('permissões: o microfone (só áudio) e o básico, e só para o RADION', () => {
  assert.equal(r.permitir('clipboard-sanitized-write', `${M}/`, O), true)
  assert.equal(r.permitir('fullscreen', `${M}/`, O), true)
  assert.equal(r.permitir('screen-wake-lock', `${M}/`, O), true)
  // o rádio: microfone sim, câmera não (nem pedido sem dizer o quê)
  assert.equal(r.permitir('media', `${M}/`, O, { mediaTypes: ['audio'] }), true)
  assert.equal(r.permitir('media', `${M}/`, O, { mediaType: 'audio' }), true)
  assert.equal(r.permitir('media', `${M}/`, O, { mediaTypes: ['audio', 'video'] }), false)
  assert.equal(r.permitir('media', `${M}/`, O, { mediaTypes: ['video'] }), false)
  assert.equal(r.permitir('media', `${M}/`, O), false)
  assert.equal(r.permitir('media', `${HUB}/entrar`, O, { mediaTypes: ['audio'] }), false)
  for (const p of ['geolocation', 'notifications', 'midi', 'clipboard-read', 'openExternal', 'pointerLock', 'fileSystem'])
    assert.equal(r.permitir(p, `${M}/`, O), false, p)
  assert.equal(r.permitir('fullscreen', `${HUB}/entrar`, O), false)
  assert.equal(r.permitir('clipboard-sanitized-write', 'https://accounts.google.com/', O), false)
})

test('deep link da diária: radion://d/<código> abre o rádio nela', () => {
  assert.equal(r.deepLink('radion://d/abc234', O), `${M}/?d=ABC234`)
  assert.equal(r.deepLink('radion:///d/ABC234/', O), `${M}/?d=ABC234`)
  // código fora do formato não vira diária (é só uma rota qualquer do site)
  assert.equal(r.deepLink('radion://d/abc', O), `${M}/d/abc`)
})

test('erros de rede', () => {
  assert.equal(r.ehErroDeRede(-106), true)
  assert.equal(r.ehErroDeRede(-105), true)
  assert.equal(r.ehErroDeRede(-202), false)
})

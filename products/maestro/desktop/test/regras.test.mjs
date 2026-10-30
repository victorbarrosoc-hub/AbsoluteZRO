// O que fica na janela do Maestro, o que vai para o navegador, deep link e permissões (sem Electron).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const r = require('../desktop/regras.cjs')
const O = { maestro: 'https://maestro.absolutezro.com', hub: 'https://absolutezro.com' }
const M = O.maestro
const HUB = O.hub

test('endereços: oficiais no app instalado; MAESTRO_URL e ZRO_HUB_URL só em desenvolvimento', () => {
  assert.deepEqual(r.origens({ empacotado: true, env: { MAESTRO_URL: 'https://outro.example.com', ZRO_HUB_URL: 'http://localhost:3000' } }), O)
  assert.deepEqual(r.origens({ empacotado: false, env: {} }), O)
  assert.deepEqual(r.origens({ empacotado: false, env: { MAESTRO_URL: 'http://127.0.0.1:4301/app', ZRO_HUB_URL: 'http://localhost:4302/' } }), {
    maestro: 'http://127.0.0.1:4301',
    hub: 'http://localhost:4302',
  })
  // http fora do computador, credenciais embutidas e lixo voltam para os oficiais
  for (const ruim of ['http://exemplo.com', 'https://a:b@exemplo.com', 'não é url', 'file:///etc', 'javascript:alert(1)'])
    assert.deepEqual(r.origens({ empacotado: false, env: { MAESTRO_URL: ruim, ZRO_HUB_URL: ruim } }), O, ruim)
})

test('na janela: o Maestro, as telas do login único e o login do Google', () => {
  for (const url of [
    `${M}/`,
    `${M}/app`,
    `${M}/app/quadro?card=x#y`,
    `${M}/entrar?volta=%2Fapp`,
    `${M}/api/zro/entrar?modo=entrar`,
    `${M}/api/zro/callback?code=x&state=y`,
    `${HUB}/oauth/authorize?client_id=maestro-web&response_type=code`,
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

test('no navegador: o resto do HUB, as páginas do cliente e os outros sites', () => {
  for (const url of [
    // o resto da Absolute ZRO (conta, planos, Conexões, a central)
    `${HUB}/`,
    `${HUB}/inicio`,
    `${HUB}/perfil`,
    `${HUB}/conexoes`,
    `${HUB}/planos`,
    `${HUB}/baixar`,
    `${HUB}/oauth/token`,
    `${HUB}/entrarx`,
    // o cliente vê no navegador dele: aprovação, orçamento, pedido e o link do Fluxo
    `${M}/a/tok123`,
    `${M}/a`,
    `${M}/o/tok`,
    `${M}/p/tok?x=1`,
    `${M}/f/tok`,
    `${M}/f/tok.md`,
    // outros sites e apps da família
    'https://sobedesce.vercel.app/',
    'https://wa.me/5511999999999?text=oi',
    'https://drive.google.com/file/d/x/view',
    'https://www.youtube.com/watch?v=x',
    // parecidos, mas não são
    'https://maestro.absolutezro.com.evil.com/app',
    'https://evil-maestro.absolutezro.com/',
    'https://maestro.absolutezro.com:8443/app',
    'https://absolutezro.com.evil.com/oauth/authorize',
    'https://accounts.google.com.evil.com/',
    'https://mail.google.com/',
  ]) {
    assert.equal(r.destino(url, O), 'fora', url)
  }
  // páginas que começam com a/o/p mas não são do cliente ficam no app
  for (const url of [`${M}/app`, `${M}/aprovacoes`, `${M}/orcamentos`, `${M}/pedidos`, `${M}/fluxos`, `${M}/app/criacao/fluxos`])
    assert.equal(r.destino(url, O), 'app', url)
})

test('saídas para o sistema: e-mail e a agenda do Maestro; nada de esquema perigoso', () => {
  assert.equal(r.destino('mailto:cliente@exemplo.com', O), 'fora')
  assert.equal(r.linkExterno('mailto:cliente@exemplo.com?subject=Oi', O), 'mailto:cliente@exemplo.com?subject=Oi')
  assert.equal(r.destino('webcal://maestro.absolutezro.com/api/agenda/abc123.ics', O), 'fora')
  for (const url of [
    'webcal://evil.example.com/api/agenda/abc.ics',
    'webcal://maestro.absolutezro.com/outra-coisa',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'smb://servidor/pasta',
    // http não sai do app (nem para o navegador)
    'http://maestro.absolutezro.com/app',
    'data:text/html,<h1>x</h1>',
    'https://usuario:senha@exemplo.com/',
    'mailto:',
    'não é url',
  ]) {
    assert.equal(r.destino(url, O), 'nada', url)
  }
})

test('deep link maestro://: só rotas do Maestro, nunca a API', () => {
  assert.equal(r.deepLink('maestro://app/quadro?card=x', O), `${M}/app/quadro?card=x`)
  assert.equal(r.deepLink('maestro:///app/hoje', O), `${M}/app/hoje`)
  assert.equal(r.deepLink('maestro:app', O), `${M}/app`)
  assert.equal(r.deepLink('MAESTRO://app', O), `${M}/app`)
  assert.equal(r.deepLink('maestro://a/tok', O), `${M}/a/tok`) // o main.cjs manda para o navegador (ehDoCliente)
  assert.equal(r.ehDoCliente(r.deepLink('maestro://a/tok', O), O), true)
  for (const ruim of [
    'maestro://api/zro/sair',
    'maestro://API/quadro',
    'maestro://.well-known/x',
    'maestro://evil.example.com@x',
    'maestro://usuario@host/app',
    'maestro:////evil.example.com/app',
    'absolutezro://app',
    'https://maestro.absolutezro.com/app',
    `maestro://${'x'.repeat(2100)}`,
  ]) {
    const alvo = r.deepLink(ruim, O)
    assert.ok(alvo === null || alvo.startsWith(M + '/'), ruim)
    if (alvo) assert.ok(!/\/api\//i.test(new URL(alvo).pathname), ruim)
  }
  assert.equal(r.deepLink('maestro://evil.example.com@x', O), null)
  assert.equal(r.deepLink('maestro://api/zro/sair', O), null)
  assert.equal(r.deepLinkDosArgs(['/caminho/Maestro.exe', '--x', 'maestro://app/quadro'], O), `${M}/app/quadro`)
  assert.equal(r.deepLinkDosArgs(['/caminho/Maestro.exe'], O), null)
})

test('permissões: só copiar e tela cheia, e só para o Maestro', () => {
  assert.equal(r.permitir('clipboard-sanitized-write', `${M}/app/aprovacoes`, O), true)
  assert.equal(r.permitir('fullscreen', `${M}/app/aprovacoes/x`, O), true)
  for (const p of ['media', 'geolocation', 'notifications', 'midi', 'clipboard-read', 'openExternal', 'pointerLock'])
    assert.equal(r.permitir(p, `${M}/app`, O), false, p)
  assert.equal(r.permitir('fullscreen', `${HUB}/entrar`, O), false)
  assert.equal(r.permitir('clipboard-sanitized-write', 'https://accounts.google.com/', O), false)
})

test('erros de rede e agente de usuário limpo', () => {
  assert.equal(r.ehErroDeRede(-106), true)
  assert.equal(r.ehErroDeRede(-105), true)
  assert.equal(r.ehErroDeRede(-202), false)
  const ua = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) maestro-desktop/0.1.0 Chrome/140.0 Electron/44.5.1 Safari/537.36'
  assert.equal(r.agenteLimpo(ua), 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')
})

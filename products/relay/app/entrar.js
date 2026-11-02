// Relay · página de entrada (/entrar). O Relay pede a conta Absolute ZRO (decisão do titular, 02/11/2026), no padrão
// das outras plataformas: fora (Entrar / Criar conta), dentro (quem é, Abrir o Relay, Sair) e desligado (login não
// ligado neste endereço); fora e dentro, "Usar outra conta" embaixo das ações. `?volta=` diz para onde ir depois de
// entrar; `?zro=` traz o resultado da volta do login.

import { lerConta, preencherAvatar, primeiroNome, sair } from './conta.js'

const $ = (id) => document.getElementById(id)
const q = new URLSearchParams(location.search)
const volta = /^\/[^/\\]/.test(q.get('volta') || '') && !q.get('volta').startsWith('/entrar') ? q.get('volta') : '/painel'
const AVISOS = {
  expirou: 'A entrada demorou demais. Tente de novo.',
  recusado: 'Entrada cancelada.',
  erro: 'Não deu para entrar agora. Tente de novo em instantes.',
}

$('entrar').href = `/api/zro/entrar?volta=${encodeURIComponent(volta)}`
$('criar').href = `/api/zro/entrar?criar=1&volta=${encodeURIComponent(volta)}`
// "Usar outra conta" (02/11/2026): sem isto o Relay reaproveita calado a conta aberta na Absolute ZRO. Sai da conta
// deste site (o /sair revoga o acesso) e pede a conta de novo com prompt=login; se o /sair falhar, segue mesmo assim.
const outra = `/api/zro/entrar?outra=1&volta=${encodeURIComponent(volta)}`
for (const a of document.querySelectorAll('[data-outra]')) {
  a.href = outra
  a.addEventListener('click', (ev) => {
    ev.preventDefault()
    const ir = () => location.assign(outra)
    fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin', cache: 'no-store' }).then(ir, ir)
  })
}
if (AVISOS[q.get('zro')]) $('aviso').textContent = AVISOS[q.get('zro')]

const c = await lerConta()
if (c.estado === 'dentro') {
  // já dentro: quem veio de uma página do Relay volta para ela
  if (q.get('volta')) location.replace(volta)
  preencherAvatar($('avatar'), c.pessoa)
  $('ola').textContent = `Olá, ${primeiroNome(c.pessoa)}.`
  $('quem').textContent = c.pessoa.email ?? ''
  $('abrir').href = volta
  $('dentro').hidden = false
} else if (c.estado === 'fora') $('fora').hidden = false
else $('desligado').hidden = false

for (const b of document.querySelectorAll('[data-sair]')) b.addEventListener('click', () => sair())
window.entrarPronto = true

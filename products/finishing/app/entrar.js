// Revela · página de entrada. A conta é a da Absolute ZRO (api/zro/*, ADR 0012 e 0014): aqui só três estados —
// fora (Entrar / Criar conta), dentro (quem é, Abrir a Revela, Sair) e desligado (login ainda não configurado neste
// endereço: as ferramentas seguem abertas). `?volta=` diz para onde voltar depois; `?zro=` traz o resultado.
import { iniciais, lerConta } from './conta.js'

const $ = (id) => document.getElementById(id)
const q = new URLSearchParams(location.search)
const volta = /^\/[^/\\]/.test(q.get('volta') || '') ? q.get('volta') : '/lut'
const AVISOS = {
  expirou: 'A entrada demorou demais. Tente de novo.',
  recusado: 'Você não permitiu o acesso. Tudo bem, tente quando quiser.',
  erro: 'Não deu para entrar agora. Tente de novo em instantes.',
  config: 'O login ainda não está ligado neste endereço.',
}

$('entrar').href = `/api/zro/entrar?volta=${encodeURIComponent(volta)}`
$('criar').href = `/api/zro/entrar?volta=${encodeURIComponent(volta)}&criar=1`
if (q.get('criar') === '1') $('criar').classList.add('vidro--tinta'), $('entrar').classList.remove('vidro--tinta')
if (AVISOS[q.get('zro')]) $('aviso').textContent = AVISOS[q.get('zro')]

const c = await lerConta()
if (c.estado === 'logado') {
  const p = c.pessoa || {}
  $('avatar').textContent = iniciais(p)
  $('ola').textContent = `Olá, ${(p.nome || p.email || '').split(' ')[0]}.`
  $('quem').textContent = [p.email, p.organizacao?.nome].filter(Boolean).join(' · ')
  $('sem-acesso').hidden = c.acesso !== false
  $('dentro').hidden = false
} else if (c.estado === 'fora') {
  $('fora').hidden = false
} else {
  $('desligado').hidden = false
}

$('sair').addEventListener('click', async () => {
  await fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  location.replace('entrar.html')
})

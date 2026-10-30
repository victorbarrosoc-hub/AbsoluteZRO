// Relay · a conta Absolute ZRO no topo (perfil único: nome, foto e e-mail são os da conta e se editam lá). Uma leitura
// do /api/zro/eu por página, dividida entre o topo, o painel e o conversor. Dentro: a foto (sem foto, as iniciais),
// que abre o menu com Painel, Sua conta e Sair. Mesma ideia da Revela (products/finishing/app/conta.js).

export const CONTA_PADRAO = 'https://absolutezro.com/perfil'

let leitura = null

/** { estado: 'dentro' | 'fora' | 'desligado', pessoa?, acesso? }. 'desligado': login não ligado neste endereço. */
export function lerConta() {
  leitura ??= (async () => {
    try {
      // o /eu do Relay responde 200 sempre (api/zro/eu.js): ok com sessão, configurado sem ela
      const r = await fetch('/api/zro/eu', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
      const j = r.ok && (r.headers.get('content-type') || '').includes('application/json') ? await r.json().catch(() => null) : null
      if (j?.ok && j.pessoa) return { estado: 'dentro', pessoa: j.pessoa, acesso: j.acesso !== false }
      return { estado: j?.configurado ? 'fora' : 'desligado' }
    } catch {
      return { estado: 'desligado' }
    }
  })()
  return leitura
}

/** Para onde voltar depois de entrar: da página inicial, o painel; das outras, a mesma página. */
export function linkEntrar(caminho = location.pathname + location.search) {
  const volta = caminho === '/' || caminho === '/index.html' ? '/painel' : caminho
  return `/api/zro/entrar?volta=${encodeURIComponent(volta)}`
}

export const primeiroNome = (p) => String(p?.nome || p?.email || '').split(/[\s@]/)[0]

export const iniciais = (p) =>
  (p?.nome || p?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('')

/** Onde editar nome, foto e e-mail: a conta Absolute ZRO, nunca o Relay. */
export const ondeEditar = (p) => (typeof p?.conta === 'string' && /^https:\/\//.test(p.conta) ? p.conta : CONTA_PADRAO)

/** Só a foto da conta (https, /api/v1/foto/…): o servidor já conferiu que é da Absolute ZRO. */
export function fotoDe(p) {
  try {
    const u = new URL(p?.foto)
    return u.protocol === 'https:' && u.pathname.startsWith('/api/v1/foto/') ? u.href : null
  } catch {
    return null
  }
}

/** Avatar: a foto da conta; sem foto, ou se ela não carregar, as iniciais. */
export function preencherAvatar(el, p) {
  el.textContent = iniciais(p)
  el.classList.remove('avatar--foto')
  const src = fotoDe(p)
  if (!src) return el
  const img = Object.assign(document.createElement('img'), { src, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' })
  img.addEventListener('load', () => (el.replaceChildren(img), el.classList.add('avatar--foto')), { once: true })
  img.addEventListener('error', () => (el.textContent = iniciais(p)), { once: true })
  return el
}

/** Sai do Relay (a sessão na Absolute ZRO continua, ADR 0012) e volta à página inicial. */
export async function sair() {
  await fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  location.replace('/')
}

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null && f !== false))
  return n
}

/** O botão da conta no fim do topo e o menu dele. */
export function menuConta(pessoa) {
  const caixa = el('div', { className: 'conta' })
  const botao = el('button', { type: 'button', className: 'avatar avatar--topo', title: [pessoa.nome, pessoa.email].filter(Boolean).join(' · ') })
  botao.dataset.conta = ''
  botao.setAttribute('aria-label', `Sua conta: ${botao.title}`)
  botao.setAttribute('aria-haspopup', 'menu')
  botao.setAttribute('aria-expanded', 'false')
  preencherAvatar(botao, pessoa)
  const aqui = location.pathname.replace(/\.html$/, '')
  const menu = el(
    'div',
    { className: 'conta-menu cartao', role: 'menu', hidden: true },
    el('div', { className: 'conta-quem' }, preencherAvatar(el('span', { className: 'avatar' }), pessoa), el('span', {}, el('strong', { textContent: pessoa.nome || primeiroNome(pessoa) }), pessoa.email ? el('small', { textContent: pessoa.email }) : null)),
    aqui === '/painel' ? null : el('a', { href: '/painel', role: 'menuitem', textContent: 'Painel' }),
    aqui === '/converter' ? null : el('a', { href: '/converter', role: 'menuitem', textContent: 'Converter' }),
    el('a', { href: ondeEditar(pessoa), role: 'menuitem', textContent: 'Sua conta Absolute ZRO', rel: 'noopener' }),
    el('button', { type: 'button', role: 'menuitem', className: 'conta-sair', textContent: 'Sair' }),
  )
  const fechar = () => {
    menu.hidden = true
    botao.setAttribute('aria-expanded', 'false')
  }
  botao.onclick = () => {
    menu.hidden = !menu.hidden
    botao.setAttribute('aria-expanded', String(!menu.hidden))
    if (!menu.hidden) menu.querySelector('a, button')?.focus()
  }
  menu.querySelector('.conta-sair').onclick = (ev) => {
    ev.currentTarget.disabled = true
    sair()
  }
  document.addEventListener('click', (e) => !caixa.contains(e.target) && fechar())
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      fechar()
      botao.focus()
    }
  })
  caixa.append(botao, menu)
  return caixa
}

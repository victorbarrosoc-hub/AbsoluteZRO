// A conta Absolute ZRO (api/zro/eu, como na Revela). No site: logado mostra as iniciais (levam a entrar.html, onde dá
// para sair); fora, "Entrar". No editor (app/editor.js) é a trava: o AEON só abre com a conta.

export async function lerConta() {
  try {
    const r = await fetch('/api/zro/eu', { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' })
    if (r.status === 200) return { estado: 'logado', ...(await r.json()) }
    if (r.status === 401) return { estado: 'fora' }
    return { estado: 'desligado' }
  } catch {
    return { estado: 'desligado' }
  }
}

export const iniciais = (p) =>
  (p?.nome || p?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('')

/** Onde a pessoa edita nome, foto e e-mail: a conta Absolute ZRO (perfil único), nunca o app. */
export const CONTA_PADRAO = 'https://absolutezro.com/perfil'
export const ondeEditar = (c) => (typeof c?.conta === 'string' && /^https:\/\//.test(c.conta) ? c.conta : CONTA_PADRAO)

/** Só a foto da conta (https, /api/v1/foto/…): o servidor já conferiu que é da Absolute ZRO. */
const fotoDe = (p) => {
  try {
    const u = new URL(p?.foto)
    return u.protocol === 'https:' && u.pathname.startsWith('/api/v1/foto/') ? u.href : null
  } catch {
    return null
  }
}

/**
 * Avatar da conta (perfil único): a foto da conta Absolute ZRO; sem foto, ou se ela não carregar, as iniciais.
 * Mesmo elemento nos dois casos (o CSS do círculo não muda).
 */
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

export async function mostrarConta() {
  const c = await lerConta()
  if (c.estado !== 'logado') return
  for (const el of document.querySelectorAll('[data-conta]')) {
    preencherAvatar(el, c.pessoa)
    el.classList.add('conta--logado')
    el.title = [c.pessoa?.nome, c.pessoa?.email].filter(Boolean).join(' · ')
    el.setAttribute('aria-label', `Sua conta: ${el.title}`)
  }
}

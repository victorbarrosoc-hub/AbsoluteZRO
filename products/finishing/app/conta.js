// Revela · a conta Absolute ZRO no topo das páginas (api/zro/eu). Logado: a foto da conta (sem foto, as iniciais),
// que leva à página da conta. Perfil único: nome, foto e e-mail são os da conta Absolute ZRO e se editam lá.
// Sem sessão: "Entrar". Login não ligado neste endereço (503) ou sem as funções (site local): o lugar some e as
// ferramentas seguem abertas, como sempre. Nada aqui bloqueia o uso: as imagens e vídeos continuam no aparelho.

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

/** Onde a pessoa edita nome, foto e e-mail: a conta Absolute ZRO (perfil único), nunca a Revela. */
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

/** Avatar (perfil único): a foto da conta Absolute ZRO; sem foto, ou se ela não carregar, as iniciais. */
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

export async function mostrarConta(el = document.getElementById('conta')) {
  if (!el) return
  const c = await lerConta()
  if (c.estado === 'desligado') return el.remove()
  if (c.estado === 'logado') {
    preencherAvatar(el, c.pessoa)
    el.classList.add('conta--logado')
    el.title = [c.pessoa?.nome, c.pessoa?.email].filter(Boolean).join(' · ')
    el.setAttribute('aria-label', `Sua conta: ${el.title}`)
  }
  el.classList.add('conta--pronta')
}

mostrarConta()

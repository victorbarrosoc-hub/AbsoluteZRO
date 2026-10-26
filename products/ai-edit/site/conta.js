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

export async function mostrarConta() {
  const c = await lerConta()
  if (c.estado !== 'logado') return
  for (const el of document.querySelectorAll('[data-conta]')) {
    el.textContent = iniciais(c.pessoa)
    el.classList.add('conta--logado')
    el.title = [c.pessoa?.nome, c.pessoa?.email].filter(Boolean).join(' · ')
    el.setAttribute('aria-label', `Sua conta: ${el.title}`)
  }
}

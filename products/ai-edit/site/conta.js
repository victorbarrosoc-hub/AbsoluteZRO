// A conta Absolute ZRO no topo do site (api/zro/eu, como na Revela). Logado: as iniciais, que levam à página de entrar
// (onde dá para sair). Sem sessão ou com o login ainda não ligado: "Entrar", que abre entrar.html. Nada aqui bloqueia o
// editor: ele abre sem conta e o material fica no computador.

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

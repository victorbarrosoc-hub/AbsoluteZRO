// Revela · a conta Absolute ZRO no topo das páginas (api/zro/eu). Logado: as iniciais, que levam à página da conta.
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

export async function mostrarConta(el = document.getElementById('conta')) {
  if (!el) return
  const c = await lerConta()
  if (c.estado === 'desligado') return el.remove()
  if (c.estado === 'logado') {
    el.textContent = iniciais(c.pessoa)
    el.classList.add('conta--logado')
    el.title = [c.pessoa?.nome, c.pessoa?.email].filter(Boolean).join(' · ')
    el.setAttribute('aria-label', `Sua conta: ${el.title}`)
  }
  el.classList.add('conta--pronta')
}

mostrarConta()

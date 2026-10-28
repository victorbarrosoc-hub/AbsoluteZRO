// Balão que abre ao lado da barra lateral (aviso de versão, apps da família). Posição fixa na janela: nada dentro
// da barra precisa rolar nem fica cortado, e o balão não empurra a navegação.

/** Estilo (position: fixed) para um balão à direita da barra, alinhado ao botão `ancora`. */
export function balaoAoLado(ancora) {
  const r = ancora.getBoundingClientRect()
  const barra = ancora.closest('.sidebar')?.getBoundingClientRect()
  const left = Math.round((barra ? barra.right : r.right) + 8)
  const h = window.innerHeight
  // na metade de baixo da janela o balão cresce para cima a partir do botão; em cima, para baixo
  if (r.top + r.height / 2 > h / 2) return { left: `${left}px`, bottom: `${Math.max(8, Math.round(h - r.bottom))}px` }
  return { left: `${left}px`, top: `${Math.max(8, Math.round(r.top))}px` }
}

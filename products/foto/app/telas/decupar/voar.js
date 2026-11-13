// O cartão que voa para o balde: ao marcar na grade, uma cópia da miniatura sai do cartão e cai na pílula da marca
// (Escolhidas ou Rejeitadas), que conta. Web Animations num elemento solto no <body>, nada no Preact; com "reduzir
// movimento", não voa (a contagem muda do mesmo jeito).

import { reduzirMovimento } from '../../preact.js'

const MOLA = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Onde a miniatura está agora (antes de marcar: com filtro, o cartão pode sair da grade em seguida). */
export function fotografar(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width ? { rect: r, src: el.querySelector('img')?.src ?? null } : null
}

/** Faz a miniatura (`origem`, de fotografar) voar até `destino`. Devolve quando chegou. */
export function voar(origem, destino) {
  if (!origem || !destino || reduzirMovimento() || typeof document.body.animate !== 'function') return Promise.resolve()
  const a = origem.rect
  const b = destino.getBoundingClientRect()
  if (!a.width || !b.width) return Promise.resolve()
  const copia = document.createElement('div')
  copia.className = 'voo'
  if (origem.src) copia.style.backgroundImage = `url("${origem.src}")`
  Object.assign(copia.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` })
  document.body.append(copia)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const fim = Math.max(0.08, Math.min(24 / a.width, 0.4))
  const animacao = copia.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 0.95, borderRadius: '6px' },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 40}px) scale(${(1 + fim) / 2})`, opacity: 0.9, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${fim})`, opacity: 0, borderRadius: '50%' },
    ],
    { duration: 520, easing: MOLA },
  )
  return animacao.finished
    .catch(() => {})
    .then(() => {
      copia.remove()
      destino.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: MOLA })
    })
}

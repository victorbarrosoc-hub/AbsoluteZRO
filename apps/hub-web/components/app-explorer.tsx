'use client'
/**
 * Explorador da página inicial: a fileira de ícones é uma lista de abas; escolher um mostra a ferramenta (frase, o
 * que ela faz, tela real ou o ícone aceso no palco e os links). Setas do teclado andam entre as abas. Os ícones da
 * órbita e do fluxo apontam para #app-<id> e abrem a ferramenta certa aqui.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ProductMark } from '@zro/ui'

export type ExplorerApp = {
  id: string
  name: string
  tagline: string
  role: string
  features: string[]
  site: string | null
  download: boolean
  /** Tem tela real em /brand/produto-<id>-{claro,escuro}.webp */
  shot: boolean
  color: CSSProperties
}

export function AppExplorer({ apps }: { apps: ExplorerApp[] }) {
  const [current, setCurrent] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const pick = useCallback(
    (i: number, focus = false) => {
      const n = (i + apps.length) % apps.length
      setCurrent(n)
      if (focus) tabs.current[n]?.focus()
    },
    [apps.length],
  )

  // #app-<id> (órbita, fluxo, link compartilhado) escolhe a ferramenta.
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#app-/, ''))
      const i = apps.findIndex((a) => a.id === id)
      if (i >= 0) setCurrent(i)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [apps])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') pick(current + 1, true)
    else if (e.key === 'ArrowLeft') pick(current - 1, true)
    else if (e.key === 'Home') pick(0, true)
    else if (e.key === 'End') pick(apps.length - 1, true)
    else return
    e.preventDefault()
  }

  const app = apps[current]
  if (!app) return null
  return (
    <div className="explorer home-mark">
      <div className="explorer__tabs" role="tablist" aria-label="Ferramentas" onKeyDown={onKey}>
        {apps.map((a, i) => (
          <button
            key={a.id}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`tab-${a.id}`}
            className="explorer__tab"
            aria-selected={i === current}
            aria-controls="explorer-panel"
            tabIndex={i === current ? 0 : -1}
            onClick={() => pick(i)}
          >
            <ProductMark productId={a.id} name={a.name} size={60} />
            <span>{a.name}</span>
          </button>
        ))}
      </div>
      <div className="explorer__panel" id="explorer-panel" role="tabpanel" aria-labelledby={`tab-${app.id}`} style={app.color} key={app.id}>
        <div className="explorer__text">
          <p className="explorer__name">
            <ProductMark productId={app.id} name={app.name} size={36} />
            {app.name}
          </p>
          <h3 className="explorer__title">{app.tagline}</h3>
          <p className="explorer__role">{app.role}</p>
          <ul className="explorer__features">
            {app.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="explorer__ctas">
            {app.site && (
              <a className="glass-btn glass-btn--ink" href={app.site} target="_blank" rel="noopener noreferrer">
                Conhecer o {app.name}
                <span className="zro-sr-only"> (abre o site oficial em nova aba)</span>
              </a>
            )}
            {app.download && (
              <a className="glass-btn" href={`/baixar#app-${app.id}`}>
                Baixar
              </a>
            )}
          </div>
        </div>
        <div className="explorer__stage">
          {app.shot ? (
            <figure className="explorer__figure">
              <img
                className="explorer__shot explorer__shot--claro"
                src={`/brand/produto-${app.id}-claro.webp`}
                alt={`O ${app.name} aberto num MacBook e num iPhone`}
                width={1600}
                height={971}
              />
              <img className="explorer__shot explorer__shot--escuro" src={`/brand/produto-${app.id}-escuro.webp`} alt="" width={1600} height={971} />
            </figure>
          ) : (
            <div className="explorer__hero-mark" aria-hidden="true">
              <ProductMark productId={app.id} name={app.name} size={220} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Bloco de um app da família, no espírito de uma suíte: ícone da própria marca, brilho na cor dela, papel no
 * fluxo e a ação que a organização realmente tem (abrir, contratar ou aguardar). Nada de acesso de fachada.
 */
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import type { ProductAccess } from '@zro/billing'
import { Pill, ProductMark } from '@zro/ui'
import { hasDesktopInstaller } from '@/lib/downloads'
import { fmtDay } from '@/lib/labels'
import { Icon } from './icons'

export const productColor = (id: string): CSSProperties =>
  ({ '--p': `var(--p-${id}, var(--zro-ash))`, '--p2': `var(--p-${id}-2, var(--zro-mist))` }) as CSSProperties

export function AppTile({ p, children, compact }: { p: ProductAccess; children?: ReactNode; compact?: boolean }) {
  return (
    <article
      className={`app-tile${compact ? ' app-tile--compact' : ''}${p.access === 'coming_soon' ? ' app-tile--soon' : ''}`}
      style={productColor(p.productId)}
    >
      <div className="app-tile__glow" aria-hidden="true" />
      <div className="app-tile__top">
        <ProductMark productId={p.productId} name={p.name} size={compact ? 40 : 52} />
        {p.access === 'contracted' ? (
          <Pill tone="ok" title={p.endsAt ? `Contratada até ${fmtDay(p.endsAt)}` : undefined}>
            Contratada{p.endsAt && !compact ? ` até ${fmtDay(p.endsAt)}` : ''}
          </Pill>
        ) : p.access === 'available' ? (
          <Pill>{p.stage === 'beta' ? 'Beta' : 'Disponível'}</Pill>
        ) : (
          <Pill tone="faint">Em desenvolvimento</Pill>
        )}
      </div>
      <div className="app-tile__body">
        <h3>
          {p.name}
          {p.provisionalName && <span className="zro-faint"> · nome provisório</span>}
        </h3>
        <p className="zro-mute">{p.roleInFlow}</p>
      </div>
      {children}
      <div className="app-tile__actions">
        {p.access === 'contracted' ? (
          p.externalUrl ? (
            <a className="zro-btn zro-btn--small zro-btn--primary" href={p.externalUrl} target="_blank" rel="noopener noreferrer">
              Abrir
              <Icon name="external" />
              <span className="zro-sr-only">(abre {p.name} em nova aba, com login próprio)</span>
            </a>
          ) : (
            <span className="zro-faint">Usado dentro do projeto</span>
          )
        ) : p.access === 'available' ? (
          <Link className="zro-btn zro-btn--small" href="/planos">
            Ver planos
          </Link>
        ) : (
          <span className="zro-faint">Em breve no Ciclo do O</span>
        )}
        {hasDesktopInstaller(p.productId) && (
          <Link className="zro-btn zro-btn--small zro-btn--ghost" href={`/downloads#app-${p.productId}`}>
            <Icon name="download" />
            Instalar
            <span className="zro-sr-only"> {p.name}</span>
          </Link>
        )}
      </div>
    </article>
  )
}

import type { ReactNode } from 'react'
import type { Authenticated } from '@zro/auth'
import type { OrganizationSummary } from '@zro/core'
import { Pill } from '@zro/ui'
import { logoutAction, themeAction } from '@/lib/actions/auth'
import { switchOrgAction } from '@/lib/actions/org'
import { ROLE_LABEL } from '@/lib/labels'
import { Wordmark } from './brand'
import { BackPath, Nav } from './nav'

export function Shell({ auth, orgs, theme, children }: { auth: Authenticated; orgs: OrganizationSummary[]; theme: string; children: ReactNode }) {
  const admin = auth.user.platformRole === 'admin' || auth.user.platformRole === 'support'
  const active = orgs.find((o) => o.active)
  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark href="/inicio" />
        <Nav admin={admin} />
        <div className="sidebar__foot">
          <span>{auth.user.displayName || auth.user.email}</span>
          <form action={logoutAction}>
            <button className="zro-btn zro-btn--ghost zro-btn--small" type="submit">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <div className="main">
        <details className="mobile-nav">
          <summary>
            <Wordmark href="/inicio" />
            <span className="zro-btn zro-btn--ghost zro-btn--small">Menu</span>
          </summary>
          <Nav admin={admin} />
        </details>
        <header className="topbar">
          <form action={switchOrgAction} className="topbar__org">
            <BackPath />
            <label className="zro-faint" htmlFor="org-switch">
              Organização
            </label>
            <select id="org-switch" name="orgId" className="zro-select" defaultValue={active?.id}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button className="zro-btn zro-btn--small" type="submit">
              Trocar
            </button>
            {active && <Pill>{ROLE_LABEL[active.role] ?? active.role}</Pill>}
          </form>
          <div className="row">
            {!auth.user.emailVerified && <Pill tone="warn">E-mail não confirmado</Pill>}
            <form action={themeAction}>
              <BackPath />
              <input type="hidden" name="theme" value={theme === 'paper' ? 'dark' : 'paper'} />
              <button className="zro-btn zro-btn--ghost zro-btn--small" type="submit" aria-label="Trocar tema claro/escuro">
                {theme === 'paper' ? 'Tema escuro' : 'Tema claro'}
              </button>
            </form>
          </div>
        </header>
        <main id="conteudo" className="content">
          {children}
        </main>
      </div>
    </div>
  )
}

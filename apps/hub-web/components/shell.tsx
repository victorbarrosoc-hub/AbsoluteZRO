import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Authenticated } from '@zro/auth'
import type { OrganizationSummary } from '@zro/core'
import { Pill } from '@zro/ui'
import { logoutAction, themeAction } from '@/lib/actions/auth'
import { switchOrgAction } from '@/lib/actions/org'
import { ROLE_LABEL } from '@/lib/labels'
import { Wordmark } from './brand'
import { Icon } from './icons'
import { BackPath, Nav } from './nav'

const initials = (s: string) =>
  s
    .replace(/\[.*?\]/g, '')
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '·'

function OrgSwitch({ orgs, id }: { orgs: OrganizationSummary[]; id: string }) {
  const active = orgs.find((o) => o.active)
  return (
    <form action={switchOrgAction} className="org-switch">
      <BackPath />
      <div className="org-switch__head">
        <label className="org-switch__label" htmlFor={id}>
          Organização
        </label>
        {active && <Pill>{ROLE_LABEL[active.role] ?? active.role}</Pill>}
      </div>
      <div className="org-switch__row">
        <select id={id} name="orgId" className="zro-select" defaultValue={active?.id}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" type="submit" title="Trocar de organização">
          <Icon name="swap" />
          <span className="zro-sr-only">Trocar</span>
        </button>
      </div>
    </form>
  )
}

export function Shell({ auth, orgs, theme, children }: { auth: Authenticated; orgs: OrganizationSummary[]; theme: string; children: ReactNode }) {
  const admin = auth.user.platformRole === 'admin' || auth.user.platformRole === 'support'
  const name = auth.user.displayName || auth.user.email
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Wordmark href="/inicio" />
        </div>
        <Link className="zro-btn zro-btn--primary sidebar__new" href="/projetos/novo">
          <Icon name="plus" />
          Novo projeto
        </Link>
        <Nav admin={admin} />
        <div className="sidebar__foot">
          <OrgSwitch orgs={orgs} id="org-switch" />
          <div className="me">
            <span className="me__avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="me__name">{name}</span>
            <form action={logoutAction}>
              <button className="icon-btn" type="submit" aria-label="Sair" title="Sair">
                <Icon name="logout" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="main">
        <details className="mobile-nav">
          <summary>
            <Wordmark href="/inicio" />
            <span className="zro-btn zro-btn--ghost zro-btn--small">
              <Icon name="menu" />
              Menu
            </span>
          </summary>
          <div className="mobile-nav__body">
            <Link className="zro-btn zro-btn--primary sidebar__new" href="/projetos/novo">
              <Icon name="plus" />
              Novo projeto
            </Link>
            <Nav admin={admin} />
            <OrgSwitch orgs={orgs} id="org-switch-mobile" />
            <form action={logoutAction}>
              <button className="zro-btn zro-btn--ghost zro-btn--small" type="submit">
                <Icon name="logout" />
                Sair
              </button>
            </form>
          </div>
        </details>
        <header className="topbar">
          <div className="topbar__status">
            {!auth.user.emailVerified && (
              <Link href="/perfil" className="topbar__notice">
                <Pill tone="warn">E-mail não confirmado</Pill>
              </Link>
            )}
          </div>
          <div className="row">
            <form action={themeAction}>
              <BackPath />
              <input type="hidden" name="theme" value={theme === 'paper' ? 'dark' : 'paper'} />
              <button
                className="icon-btn"
                type="submit"
                aria-label={theme === 'paper' ? 'Usar tema escuro' : 'Usar tema claro'}
                title={theme === 'paper' ? 'Tema escuro' : 'Tema claro'}
              >
                <Icon name={theme === 'paper' ? 'moon' : 'sun'} />
              </button>
            </form>
            <Link className="icon-btn" href="/ferramentas" aria-label="Ferramentas" title="Ferramentas">
              <Icon name="apps" />
            </Link>
            <Link className="me__avatar me__avatar--top" href="/perfil" title={name}>
              <span aria-hidden="true">{initials(name)}</span>
              <span className="zro-sr-only">Perfil e segurança</span>
            </Link>
          </div>
        </header>
        <main id="conteudo" className="content">
          {children}
        </main>
      </div>
    </div>
  )
}

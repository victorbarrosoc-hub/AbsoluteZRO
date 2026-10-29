import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Authenticated } from '@zro/auth'
import type { OrganizationSummary, Pendencias } from '@zro/core'
import { Pill } from '@zro/ui'
import { logoutAction } from '@/lib/actions/auth'
import { switchOrgAction } from '@/lib/actions/org'
import { ROLE_LABEL } from '@/lib/labels'
import { Avatar } from './avatar'
import { Wordmark } from './brand'
import { Icon } from './icons'
import { Transicao } from './movimento'
import { BackPath, MobileMenu, Nav, NavToggle, type FamilyApp, type NavMode } from './nav'
import { ThemeToggle } from './theme-toggle'

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

export function Shell({
  auth,
  orgs,
  nav,
  avatar,
  pendencias = {},
  familia = [],
  children,
}: {
  auth: Authenticated
  orgs: OrganizationSummary[]
  nav: NavMode
  /** Versão da foto do perfil (null = sem foto). */
  avatar: number | null
  /** Quantas ações esperam a pessoa em cada seção (o balão do menu). */
  pendencias?: Pendencias
  /** Apps da família no menu: só os lançados ou liberados para a pessoa (ADR 0023). */
  familia?: FamilyApp[]
  children: ReactNode
}) {
  const admin = auth.user.platformRole === 'admin' || auth.user.platformRole === 'support'
  const name = auth.user.displayName || auth.user.email
  const activeOrg = orgs.find((o) => o.active)
  return (
    <div className="shell" data-nav={nav}>
      <aside className="sidebar">
        <div className="sidebar__top">
          <div className="sidebar__brand">
            <Wordmark href="/inicio" />
          </div>
          <NavToggle initial={nav} />
        </div>
        <Link className="zro-btn zro-btn--primary sidebar__new" href="/projetos/novo" title="Novo projeto">
          <Icon name="plus" />
          <span className="nav__text">Novo projeto</span>
        </Link>
        <Nav admin={admin} pendencias={pendencias} familia={familia} />
        <div className="sidebar__foot">
          <OrgSwitch orgs={orgs} id="org-switch" />
          <div className="me">
            <Link className="me__link" href="/perfil" title={activeOrg ? `${name} · ${activeOrg.name}` : name}>
              <Avatar userId={auth.user.id} name={name} version={avatar} />
              <span className="me__name">{name}</span>
            </Link>
            <form action={logoutAction} className="me__logout">
              <button className="icon-btn" type="submit" aria-label="Sair" title="Sair">
                <Icon name="logout" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar__start">
            <MobileMenu
              summary={
                <span className="mobile-nav__button" title="Menu">
                  <Icon name="menu" />
                  <span className="zro-sr-only">Menu</span>
                </span>
              }
            >
              <Link className="zro-btn zro-btn--primary sidebar__new" href="/projetos/novo">
                <Icon name="plus" />
                Novo projeto
              </Link>
              <Nav admin={admin} pendencias={pendencias} familia={familia} />
              <OrgSwitch orgs={orgs} id="org-switch-mobile" />
              <form action={logoutAction}>
                <button className="zro-btn zro-btn--ghost zro-btn--small" type="submit">
                  <Icon name="logout" />
                  Sair
                </button>
              </form>
            </MobileMenu>
            <span className="topbar__brand">
              <Wordmark href="/inicio" />
            </span>
            {!auth.user.emailVerified && (
              <Link href="/perfil/seguranca" className="topbar__notice">
                <Pill tone="warn">E-mail não confirmado</Pill>
              </Link>
            )}
          </div>
          <div className="row topbar__end">
            <ThemeToggle />
            <Link className="icon-btn" href="/ferramentas" aria-label="Ferramentas" title="Ferramentas">
              <Icon name="apps" />
            </Link>
            <Link className="me__top" href="/perfil" title={name}>
              <Avatar userId={auth.user.id} name={name} version={avatar} />
              <span className="zro-sr-only">Sua conta</span>
            </Link>
          </div>
        </header>
        <main id="conteudo" className="content">
          <Transicao>{children}</Transicao>
        </main>
      </div>
    </div>
  )
}

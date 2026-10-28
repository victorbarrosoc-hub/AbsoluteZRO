'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ProductMark } from '@zro/ui'
import { navAction } from '@/lib/actions/account'
import { Icon, type IconName } from './icons'

type Item = { href: string; label: string; icon: IconName }

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'Trabalho',
    items: [
      { href: '/inicio', label: 'Início', icon: 'home' },
      { href: '/ia', label: 'IA', icon: 'sparkle' },
      { href: '/projetos', label: 'Meus projetos', icon: 'projects' },
      { href: '/ciclo', label: 'Ciclo do O', icon: 'cycle' },
      { href: '/ferramentas', label: 'Ferramentas', icon: 'apps' },
      { href: '/downloads', label: 'Downloads', icon: 'download' },
      { href: '/arquivos', label: 'Arquivos', icon: 'files' },
      { href: '/atividades', label: 'Atividades', icon: 'activity' },
    ],
  },
  {
    label: 'Conta',
    items: [
      { href: '/equipe', label: 'Equipe', icon: 'team' },
      { href: '/assinatura', label: 'Assinatura e consumo', icon: 'card' },
      { href: '/perfil', label: 'Sua conta', icon: 'user' },
    ],
  },
]

/** Um app da família no menu. A lista vem do servidor: só o lançado ou liberado para a pessoa (ADR 0023). */
export type FamilyApp = { productId: string; name: string; href: string }

export function Nav({ admin, pendencias = {}, familia = [] }: { admin: boolean; pendencias?: Record<string, number>; familia?: FamilyApp[] }) {
  const path = usePathname()
  const groups = admin ? [...GROUPS, { label: 'Plataforma', items: [{ href: '/admin', label: 'Administração', icon: 'shield' as const }] }] : GROUPS
  return (
    <nav className="nav" aria-label="Navegação do HUB">
      {groups.map((g) => (
        <div key={g.label} className="nav__group">
          <p className="nav__label">{g.label}</p>
          {g.items.map((i) => {
            const n = pendencias[i.href] ?? 0
            return (
              <Link
                key={i.href}
                href={i.href}
                title={n ? `${i.label} · ${n} ${n === 1 ? 'espera' : 'esperam'} você` : i.label}
                aria-current={path === i.href || path.startsWith(i.href + '/') ? 'page' : undefined}
              >
                <Icon name={i.icon} />
                <span className="nav__text">{i.label}</span>
                {n > 0 && <Balao n={n} />}
              </Link>
            )
          })}
        </div>
      ))}
      {familia.length > 0 && (
        <div className="nav__group nav__family">
          <p className="nav__label">Absolute ZRO</p>
          {familia.map((app) => (
            <a key={app.productId} href={app.href} rel="noopener" title={app.name}>
              <ProductMark productId={app.productId} name={app.name} size={22} />
              <span className="nav__text">{app.name}</span>
            </a>
          ))}
        </div>
      )}
    </nav>
  )
}

/** O balão com o número de ações que esperam a pessoa numa seção (como no SOBEDESCE). */
export function Balao({ n }: { n: number }) {
  return (
    <span className="nav__balao" aria-label={`${n} ${n === 1 ? 'pendência' : 'pendências'}`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

export function BackPath() {
  const path = usePathname()
  return <input type="hidden" name="back" value={path} />
}

export type NavMode = 'auto' | 'rail' | 'full'

/** Em telas médias (até 1200 px) o modo automático já começa recolhido. */
const RAIL_AUTO = '(min-width: 901px) and (max-width: 1200px)'

/**
 * Recolhe ou abre o menu lateral. Troca na hora (atributo no .shell + cookie) e lembra a escolha.
 * Atalho: ⌘ + \ (Ctrl + \ no Windows). Sem JavaScript, o formulário grava pelo servidor.
 */
export function NavToggle({ initial }: { initial: NavMode }) {
  const [rail, setRail] = useState(initial === 'rail')

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.shell')
    if (shell?.dataset.nav === 'auto') setRail(window.matchMedia(RAIL_AUTO).matches)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggle(e?: MouseEvent) {
    e?.preventDefault()
    const shell = document.querySelector<HTMLElement>('.shell')
    if (!shell) return
    const isRail = shell.dataset.nav === 'rail' || (shell.dataset.nav === 'auto' && window.matchMedia(RAIL_AUTO).matches)
    const next = isRail ? 'full' : 'rail'
    shell.dataset.nav = next
    document.cookie = `zro_nav=${next}; path=/; max-age=31536000; samesite=lax`
    setRail(next === 'rail')
  }

  const label = rail ? 'Abrir menu' : 'Recolher menu'
  return (
    <form action={navAction} className="nav-toggle">
      <BackPath />
      <button
        type="submit"
        name="nav"
        value={rail ? 'full' : 'rail'}
        className="icon-btn"
        aria-label={label}
        aria-expanded={!rail}
        title={`${label} (⌘ \\)`}
        onClick={toggle}
      >
        <Icon name="sidebar" />
      </button>
    </form>
  )
}

/** Menu do celular: fecha sozinho quando a página muda. */
export function MobileMenu({ children, summary }: { children: ReactNode; summary: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const path = usePathname()
  useEffect(() => {
    if (ref.current) ref.current.open = false
  }, [path])
  return (
    <details className="mobile-nav" ref={ref}>
      <summary>{summary}</summary>
      <div className="mobile-nav__body">{children}</div>
    </details>
  )
}

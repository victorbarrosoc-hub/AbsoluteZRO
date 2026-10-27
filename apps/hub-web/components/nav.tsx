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

// A família Absolute ZRO, como no menu da Revela. O HUB é o app atual, então fica de fora.
const FAMILY = [
  { productId: 'carro-do-freela', name: 'Carro do Freela', href: 'https://carrodofreela.com.br' },
  { productId: 'nossom', name: 'Nossom', href: 'https://nossom-teal.vercel.app' },
  { productId: 'finishing', name: 'Revela', href: 'https://revela.absolutezro.com' },
  { productId: 'sobedesce', name: 'Sobedesce', href: 'https://sobedesce.vercel.app' },
  { productId: 'synquei', name: 'Synquei', href: 'https://synquei.vercel.app' },
  { productId: 'tpeasy', name: 'TPEasy', href: 'https://tpeasy.vercel.app' },
]

export function Nav({ admin }: { admin: boolean }) {
  const path = usePathname()
  const groups = admin ? [...GROUPS, { label: 'Plataforma', items: [{ href: '/admin', label: 'Administração', icon: 'shield' as const }] }] : GROUPS
  return (
    <nav className="nav" aria-label="Navegação do HUB">
      {groups.map((g) => (
        <div key={g.label} className="nav__group">
          <p className="nav__label">{g.label}</p>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} title={i.label} aria-current={path === i.href || path.startsWith(i.href + '/') ? 'page' : undefined}>
              <Icon name={i.icon} />
              <span className="nav__text">{i.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <div className="nav__group nav__family">
        <p className="nav__label">Absolute ZRO</p>
        {FAMILY.map((app) => (
          <a key={app.productId} href={app.href} rel="noopener" title={app.name}>
            <ProductMark productId={app.productId} name={app.name} size={22} />
            <span className="nav__text">{app.name}</span>
          </a>
        ))}
      </div>
    </nav>
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

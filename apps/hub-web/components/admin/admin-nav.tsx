'use client'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '../icons'
import { LinkIntencao, sentido } from '../movimento'

const SECTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin', label: 'Visão geral', icon: 'activity' },
  { href: '/admin/pessoas', label: 'Pessoas', icon: 'team' },
  { href: '/admin/planos', label: 'Planos', icon: 'card' },
  { href: '/admin/lancamento', label: 'Lançamento', icon: 'sparkle' },
  { href: '/admin/apps', label: 'Apps', icon: 'apps' },
]

const ORDEM = SECTIONS.map((s) => s.href).slice(1)

/** Seções do console: coluna no computador, faixa de pílulas no celular. */
export function AdminNav() {
  const path = usePathname()
  const current = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  return (
    <nav className="adm-nav" aria-label="Console">
      {SECTIONS.map((s) => (
        <LinkIntencao
          key={s.href}
          href={s.href}
          transitionTypes={[s.href === '/admin' ? 'z-volta' : sentido(ORDEM, path === '/admin' ? '/admin/' : path, s.href)]}
          aria-current={current(s.href) ? 'page' : undefined}
        >
          <Icon name={s.icon} />
          <span>{s.label}</span>
        </LinkIntencao>
      ))}
    </nav>
  )
}

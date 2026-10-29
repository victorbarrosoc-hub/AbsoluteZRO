'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '../icons'

const SECTIONS: { href: string; label: string; icon: IconName; onlyAdmin?: boolean }[] = [
  { href: '/admin', label: 'Visão geral', icon: 'activity' },
  { href: '/admin/pessoas', label: 'Pessoas', icon: 'team' },
  { href: '/admin/planos', label: 'Planos', icon: 'card' },
  { href: '/admin/custos', label: 'Custos', icon: 'pie', onlyAdmin: true },
  { href: '/admin/lancamento', label: 'Lançamento', icon: 'sparkle' },
  { href: '/admin/apps', label: 'Apps', icon: 'apps' },
]

/** Seções do console: coluna no computador, faixa de pílulas no celular. Custos só aparece para o papel admin. */
export function AdminNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const path = usePathname()
  const current = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  return (
    <nav className="adm-nav" aria-label="Console">
      {SECTIONS.filter((s) => isAdmin || !s.onlyAdmin).map((s) => (
        <Link key={s.href} href={s.href} aria-current={current(s.href) ? 'page' : undefined}>
          <Icon name={s.icon} />
          <span>{s.label}</span>
        </Link>
      ))}
    </nav>
  )
}

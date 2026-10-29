'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './icons'

const SECTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: '/perfil', label: 'Visão geral', icon: 'user' },
  { href: '/perfil/profissional', label: 'Perfil profissional', icon: 'at' },
  { href: '/perfil/seguranca', label: 'Segurança', icon: 'lock' },
  { href: '/perfil/plano', label: 'Plano', icon: 'card' },
  { href: '/perfil/acessos', label: 'Acessos', icon: 'apps' },
  { href: '/conexoes', label: 'Conexões', icon: 'link' },
]

/** Seções da central da conta: coluna no computador, faixa rolável no celular. */
export function AccountNav() {
  const path = usePathname()
  return (
    <nav className="account-nav" aria-label="Sua conta">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={path === s.href ? 'page' : undefined}>
          <Icon name={s.icon} />
          {s.label}
        </Link>
      ))}
    </nav>
  )
}

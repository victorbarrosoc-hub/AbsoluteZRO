'use client'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '../icons'
import { LinkIntencao, sentido } from '../movimento'

const SECTIONS: { href: string; label: string; icon: IconName; onlyAdmin?: boolean }[] = [
  { href: '/admin', label: 'Visão geral', icon: 'activity' },
  { href: '/admin/pessoas', label: 'Pessoas', icon: 'team' },
  { href: '/admin/planos', label: 'Planos', icon: 'card' },
  { href: '/admin/custos', label: 'Custos', icon: 'pie', onlyAdmin: true },
  { href: '/admin/lancamento', label: 'Lançamento', icon: 'sparkle' },
  { href: '/admin/apps', label: 'Apps', icon: 'apps' },
  { href: '/admin/denuncias', label: 'Denúncias', icon: 'chat' },
]

/** Seções do console: coluna no computador, faixa de pílulas no celular. Custos só aparece para o papel admin. */
export function AdminNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const path = usePathname()
  const secoes = SECTIONS.filter((s) => isAdmin || !s.onlyAdmin)
  const ordem = secoes.map((s) => s.href).slice(1)
  const current = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  return (
    <nav className="adm-nav" aria-label="Console">
      {secoes.map((s) => (
        <LinkIntencao
          key={s.href}
          href={s.href}
          transitionTypes={[s.href === '/admin' ? 'z-volta' : sentido(ordem, path === '/admin' ? '/admin/' : path, s.href)]}
          aria-current={current(s.href) ? 'page' : undefined}
        >
          <Icon name={s.icon} />
          <span>{s.label}</span>
        </LinkIntencao>
      ))}
    </nav>
  )
}

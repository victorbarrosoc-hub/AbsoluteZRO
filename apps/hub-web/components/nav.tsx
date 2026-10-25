'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './icons'

type Item = { href: string; label: string; icon: IconName }

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'Trabalho',
    items: [
      { href: '/inicio', label: 'Início', icon: 'home' },
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
      { href: '/perfil', label: 'Perfil e segurança', icon: 'user' },
    ],
  },
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
            <Link key={i.href} href={i.href} aria-current={path === i.href || path.startsWith(i.href + '/') ? 'page' : undefined}>
              <Icon name={i.icon} />
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function BackPath() {
  const path = usePathname()
  return <input type="hidden" name="back" value={path} />
}

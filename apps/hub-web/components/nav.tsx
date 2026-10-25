'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: 'Trabalho',
    items: [
      { href: '/inicio', label: 'Início' },
      { href: '/projetos', label: 'Meus projetos' },
      { href: '/ciclo', label: 'Ciclo do O' },
      { href: '/ferramentas', label: 'Ferramentas' },
      { href: '/arquivos', label: 'Arquivos' },
      { href: '/atividades', label: 'Atividades' },
    ],
  },
  {
    label: 'Conta',
    items: [
      { href: '/equipe', label: 'Equipe' },
      { href: '/assinatura', label: 'Assinatura e consumo' },
      { href: '/perfil', label: 'Perfil e segurança' },
    ],
  },
]

export function Nav({ admin }: { admin: boolean }) {
  const path = usePathname()
  const groups = admin ? [...GROUPS, { label: 'Plataforma', items: [{ href: '/admin', label: 'Administração' }] }] : GROUPS
  return (
    <nav className="nav" aria-label="Navegação do HUB">
      {groups.map((g) => (
        <div key={g.label} className="nav">
          <p className="nav__label">{g.label}</p>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={path === i.href || path.startsWith(i.href + '/') ? 'page' : undefined}>
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

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ProductMark } from '@zro/ui'
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

// A família Absolute ZRO, como no menu da Revela. O HUB é o app atual, então fica de fora.
const FAMILY = [
  { productId: 'finishing', name: 'Revela', href: 'https://revela-zro.vercel.app' },
  { productId: 'sobedesce', name: 'Sobedesce', href: 'https://sobedesce.vercel.app' },
  { productId: 'synquei', name: 'Synquei', href: 'https://synquei.vercel.app' },
  { productId: 'nossom', name: 'Nossom', href: 'https://nossom-teal.vercel.app' },
  { productId: 'tpeasy', name: 'TPEasy', href: 'https://tpeasy.vercel.app' },
  { productId: 'carro-do-freela', name: 'Carro do Freela', href: 'https://carrodofreela.com.br' },
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
      <div className="nav__group nav__family">
        <p className="nav__label">Absolute ZRO</p>
        {FAMILY.map((app) => (
          <a key={app.productId} href={app.href} rel="noopener" title={app.name}>
            <ProductMark productId={app.productId} name={app.name} size={22} />
            {app.name}
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

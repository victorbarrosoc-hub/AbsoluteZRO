'use client'
import { usePathname } from 'next/navigation'
import type { AreaConsole } from '@zro/core'
import { Icon, type IconName } from '../icons'
import { LinkIntencao, sentido } from '../movimento'

/** `documento`: abre a tela num carregamento novo (o Laboratório da Z precisa da permissão de microfone da própria página). */
const SECTIONS: { area: AreaConsole; href: string; label: string; icon: IconName; documento?: boolean }[] = [
  { area: 'visao', href: '/admin', label: 'Visão geral', icon: 'activity' },
  { area: 'pessoas', href: '/admin/pessoas', label: 'Pessoas', icon: 'team' },
  { area: 'planos', href: '/admin/planos', label: 'Planos', icon: 'card' },
  { area: 'custos', href: '/admin/custos', label: 'Custos', icon: 'pie' },
  { area: 'correio', href: '/admin/correio', label: 'Correio', icon: 'mail' },
  { area: 'laboratorio', href: '/admin/laboratorio', label: 'Laboratório da Z', icon: 'flask', documento: true },
  { area: 'lancamento', href: '/admin/lancamento', label: 'Lançamento', icon: 'sparkle' },
  { area: 'apps', href: '/admin/apps', label: 'Apps', icon: 'apps' },
  { area: 'denuncias', href: '/admin/denuncias', label: 'Denúncias', icon: 'chat' },
  { area: 'papeis', href: '/admin/papeis', label: 'Papéis', icon: 'key' },
]

/**
 * Seções do console: coluna no computador, faixa de pílulas no celular. Só aparecem as áreas do papel (ADR 0034); o
 * servidor nega o resto de qualquer jeito.
 */
export function AdminNav({ areas }: { areas: AreaConsole[] }) {
  const path = usePathname()
  const secoes = SECTIONS.filter((s) => areas.includes(s.area))
  const ordem = secoes.map((s) => s.href).filter((h) => h !== '/admin')
  const current = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  return (
    <nav className="adm-nav" aria-label="Console">
      {secoes.map((s) =>
        s.documento ? (
          <a key={s.href} href={s.href} aria-current={current(s.href) ? 'page' : undefined}>
            <Icon name={s.icon} />
            <span>{s.label}</span>
          </a>
        ) : (
          <LinkIntencao
            key={s.href}
            href={s.href}
            transitionTypes={[s.href === '/admin' ? 'z-volta' : sentido(ordem, path === '/admin' ? '/admin/' : path, s.href)]}
            aria-current={current(s.href) ? 'page' : undefined}
          >
            <Icon name={s.icon} />
            <span>{s.label}</span>
          </LinkIntencao>
        ),
      )}
    </nav>
  )
}

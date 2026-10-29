'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ProductMark } from '@zro/ui'
import { navAction } from '@/lib/actions/account'
import { Icon, type IconName } from './icons'
import { LinkIntencao, sentido } from './movimento'

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
      { href: '/conexoes', label: 'Conexões', icon: 'link' },
    ],
  },
]

/** Um app da família no menu. A lista vem do servidor: só o lançado ou liberado para a pessoa (ADR 0023). */
export type FamilyApp = { productId: string; name: string; href: string }

export function Nav({ admin, pendencias = {}, familia = [] }: { admin: boolean; pendencias?: Record<string, number>; familia?: FamilyApp[] }) {
  const path = usePathname()
  // o destino acende no clique, antes de a tela chegar (como no Synquei); volta ao caminho de verdade quando ele muda
  const [indo, setIndo] = useState<{ de: string; para: string } | null>(null)
  const visto = indo && indo.de === path ? indo.para : path
  const groups = admin ? [...GROUPS, { label: 'Plataforma', items: [{ href: '/admin', label: 'Administração', icon: 'shield' as const }] }] : GROUPS
  const ordem = groups.flatMap((g) => g.items.map((i) => i.href))
  const ativo = (href: string) => visto === href || visto.startsWith(href + '/')

  // a pílula da tela ativa desliza de um item para o outro (transform com a mola, só CSS; aqui só se mede)
  const raiz = useRef<HTMLElement>(null)
  const pilula = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const nav = raiz.current
    const p = pilula.current
    if (!nav || !p) return
    const pos = () => {
      const alvo = nav.querySelector<HTMLElement>('a[aria-current="page"]')
      if (!alvo || !alvo.offsetParent) {
        p.style.opacity = '0'
        return
      }
      const a = alvo.getBoundingClientRect()
      const b = nav.getBoundingClientRect()
      const primeira = !nav.dataset.pilula
      if (primeira) p.style.transition = 'none'
      p.style.opacity = '1'
      p.style.height = `${a.height}px`
      p.style.width = `${a.width}px`
      p.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`
      if (primeira) {
        void p.offsetWidth
        p.style.transition = ''
        nav.dataset.pilula = ''
      }
    }
    pos()
    const ro = new ResizeObserver(pos)
    ro.observe(nav)
    return () => ro.disconnect()
  }, [visto])

  return (
    <nav ref={raiz} className="nav" aria-label="Navegação do HUB">
      <span ref={pilula} className="nav__pilula" aria-hidden="true" />
      {groups.map((g) => (
        <div key={g.label} className="nav__group">
          <p className="nav__label">{g.label}</p>
          {g.items.map((i) => {
            const n = pendencias[i.href] ?? 0
            return (
              <LinkIntencao
                key={i.href}
                href={i.href}
                transitionTypes={[sentido(ordem, path, i.href)]}
                title={n ? `${i.label} · ${n} ${n === 1 ? 'espera' : 'esperam'} você` : i.label}
                aria-current={ativo(i.href) ? 'page' : undefined}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) setIndo({ de: path, para: i.href })
                }}
              >
                <Icon name={i.icon} />
                <span className="nav__text">{i.label}</span>
                {n > 0 && <Balao n={n} />}
              </LinkIntencao>
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

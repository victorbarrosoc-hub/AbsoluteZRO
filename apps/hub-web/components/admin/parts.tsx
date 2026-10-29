/**
 * Peças do console da plataforma: seção que recolhe, número grande, gráficos em SVG/CSS e o rosto da pessoa.
 * Tudo Server Component; o movimento é CSS (entrada, recolher) e some com "reduzir movimento".
 */
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { ProductMark } from '@zro/ui'
import { initials } from '../avatar'
import { Icon } from '../icons'

/** Seção que recolhe (details nativo: teclado e leitor de tela de graça). */
export function Fold({
  title,
  meta,
  open = false,
  id,
  tone,
  children,
}: {
  title: ReactNode
  meta?: ReactNode
  open?: boolean
  id?: string
  tone?: 'danger'
  children: ReactNode
}) {
  return (
    <details className={`fold${tone ? ` fold--${tone}` : ''}`} open={open} id={id}>
      <summary className="fold__head">
        <span className="fold__title">{title}</span>
        {meta != null && <span className="fold__meta">{meta}</span>}
        <span className="fold__chev" aria-hidden="true" />
      </summary>
      <div className="fold__body">{children}</div>
    </details>
  )
}

export function Kpi({ label, value, hint, href, i = 0 }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; i?: number }) {
  const body = (
    <>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      {hint && <span className="kpi__hint">{hint}</span>}
    </>
  )
  const style = { '--i': i } as CSSProperties
  return href ? (
    <Link href={href} className="kpi kpi--link" style={style}>
      {body}
    </Link>
  ) : (
    <div className="kpi" style={style}>
      {body}
    </div>
  )
}

const dayShort = (day: string) => `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`

/** Barras de 30 dias, uma série. Cada barra tem o valor no title (passar o mouse ou tocar). */
export function Bars30({ series, label, unit }: { series: { day: string; n: number }[]; label: string; unit: [string, string] }) {
  const max = Math.max(1, ...series.map((s) => s.n))
  const total = series.reduce((n, s) => n + s.n, 0)
  if (!total) return <p className="adm-empty">Nada nos últimos 30 dias.</p>
  const H = 100
  const W = 10
  return (
    <figure className="bars30">
      <svg
        className="bars30__svg"
        viewBox={`0 0 ${series.length * W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${total} ${total === 1 ? unit[0] : unit[1]} em 30 dias. Pico de ${max} num dia.`}
      >
        {series.map((s, i) => {
          const h = Math.max((s.n / max) * (H - 4), 1.2)
          return (
            <g key={s.day}>
              <title>{`${dayShort(s.day)}: ${s.n} ${s.n === 1 ? unit[0] : unit[1]}`}</title>
              <rect x={i * W} y={0} width={W} height={H} className="bars30__hit" />
              <rect
                x={i * W + 1.6}
                y={H - h}
                width={W - 3.2}
                height={h}
                rx={1.4}
                className={s.n ? 'bars30__bar' : 'bars30__zero'}
                style={{ '--i': i } as CSSProperties}
              />
            </g>
          )
        })}
      </svg>
      <figcaption className="bars30__foot">
        <span>{series[0] ? dayShort(series[0].day) : ''}</span>
        <span>hoje</span>
      </figcaption>
    </figure>
  )
}

export type HBarItem = { key: string; label: string; n: number; href?: string; icon?: ReactNode; hint?: string }

/** Lista com barra horizontal proporcional ao maior valor. */
export function HBars({ items, empty = 'Ninguém ainda.' }: { items: HBarItem[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n))
  if (!items.length) return <p className="adm-empty">{empty}</p>
  return (
    <ul className="hbars">
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="hbars__name">
              {it.icon}
              <span>{it.label}</span>
            </span>
            <span className="hbars__n">{it.n.toLocaleString('pt-BR')}</span>
            <span className="hbars__track" aria-hidden="true">
              <span className="hbars__bar" style={{ width: `${(it.n / max) * 100}%`, '--i': i } as CSSProperties} />
            </span>
          </>
        )
        return (
          <li key={it.key} title={it.hint}>
            {it.href ? (
              <Link href={it.href} className="hbars__row">
                {inner}
              </Link>
            ) : (
              <div className="hbars__row">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export type Segment = { key: string; label: string; n: number; hint: string; href: string }

/** Barra empilhada com a legenda clicável (cada parte leva à lista filtrada). */
export function SegmentBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((n, s) => n + s.n, 0)
  if (!total) return <p className="adm-empty">Ninguém ainda.</p>
  return (
    <div className="segbar">
      <div className="segbar__track" role="img" aria-label={segments.map((s) => `${s.label}: ${s.n}`).join(', ')}>
        {segments.map((s) =>
          s.n ? <span key={s.key} className={`segbar__part segbar__part--${s.key}`} style={{ flexGrow: s.n }} title={`${s.label}: ${s.n}`} /> : null,
        )}
      </div>
      <ul className="segbar__legend">
        {segments.map((s) => (
          <li key={s.key}>
            <Link href={s.href} title={s.hint}>
              <span className={`segbar__key segbar__part--${s.key}`} aria-hidden="true" />
              <span className="segbar__label">{s.label}</span>
              <strong>{s.n.toLocaleString('pt-BR')}</strong>
              <span className="segbar__pct">{Math.round((s.n / total) * 100)}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Foto (ou iniciais) com o ponto verde de online. */
export function Face({ name, avatarId, online, size = 40 }: { name: string; avatarId: string | null; online?: boolean; size?: number }) {
  return (
    <span className="face" style={{ width: size, height: size }}>
      <span className="avatar" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }} aria-hidden="true">
        {avatarId ? <img src={`/api/v1/foto/${avatarId}`} alt="" width={size} height={size} loading="lazy" /> : initials(name)}
      </span>
      {online && <span className="face__dot" title="Online agora" />}
    </span>
  )
}

/** Ícones dos apps que a pessoa usa (o nome fica no title). */
export function AppIcons({ apps, max = 5 }: { apps: { productId: string | null; name: string }[]; max?: number }) {
  const seen = new Map<string, string>()
  for (const a of apps) if (!seen.has(a.productId ?? a.name)) seen.set(a.productId ?? a.name, a.name)
  const list = [...seen.entries()]
  if (!list.length) return <span className="zro-faint">—</span>
  return (
    <span className="app-icons" aria-label={`Apps: ${list.map(([, n]) => n).join(', ')}`} role="img">
      {list.slice(0, max).map(([id, n]) => (
        <span key={id} title={n} className="app-icons__one">
          <ProductMark productId={id} name={n} size={22} />
        </span>
      ))}
      {list.length > max && <span className="app-icons__more">+{list.length - max}</span>}
    </span>
  )
}

/** Atalho de seção ("Ver todas", "Abrir") com seta. */
export function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="adm-more">
      {children}
      <Icon name="arrow" />
    </Link>
  )
}

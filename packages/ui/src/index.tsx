/**
 * Componentes base do HUB. Sem estado e sem hooks: funcionam em Server Components.
 * Classes em packages/ui/src/components.css.
 */
import type { ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({
  title,
  eyebrow,
  actions,
  children,
  tone,
  id,
}: {
  title?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  tone?: 'default' | 'stage' | 'attention'
  id?: string
}) {
  return (
    <section className={cx('zro-card', tone && tone !== 'default' && `zro-card--${tone}`)} id={id} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || eyebrow || actions) && (
        <header className="zro-card__head">
          <div>
            {eyebrow && <p className="zro-eyebrow">{eyebrow}</p>}
            {title && (
              <h2 className="zro-card__title" id={id ? `${id}-title` : undefined}>
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="zro-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' | 'faint'

export function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={cx('zro-pill', `zro-pill--${tone}`)} title={title}>
      {children}
    </span>
  )
}

export function Notice({ tone = 'neutral', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('zro-notice', `zro-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <strong className="zro-notice__title">{title}</strong>}
      {children && <div className="zro-notice__body">{children}</div>}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="zro-empty">
      <p className="zro-empty__title">{title}</p>
      {children && <div className="zro-empty__body">{children}</div>}
      {action && <div className="zro-empty__action">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="zro-stat">
      <span className="zro-stat__label">{label}</span>
      <span className="zro-stat__value">{value}</span>
      {hint && <span className="zro-stat__hint">{hint}</span>}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  htmlFor: string
}) {
  return (
    <div className={cx('zro-field', !!error && 'zro-field--error')}>
      <label className="zro-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="zro-field__hint">{hint}</p>}
      {error && (
        <p className="zro-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function ProductMark({ productId, name, size = 32 }: { productId: string; name: string; size?: number }) {
  const icons: Record<string, string> = {
    nossom: '/products/nossom.svg',
    sobedesce: '/products/sobedesce.svg',
    synquei: '/products/synquei.svg',
    tpeasy: '/products/tpeasy.svg',
    'carro-do-freela': '/products/carro-do-freela.png',
  }
  const src = icons[productId]
  if (!src) {
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    return (
      <span className="zro-mark zro-mark--initials" style={{ width: size, height: size }} aria-hidden="true">
        {initials}
      </span>
    )
  }
  return <img className="zro-mark" src={src} alt="" width={size} height={size} />
}

export { cx }

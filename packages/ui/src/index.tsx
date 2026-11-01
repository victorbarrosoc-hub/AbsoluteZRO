/**
 * Componentes base do HUB. Sem estado e sem hooks: funcionam em Server Components.
 * Classes em packages/ui/src/components.css.
 */
import type { ReactNode } from 'react'
import { ZRO_SIMBOLO, ZRO_WORDMARK } from './marca'
export { ZRO_SIMBOLO, ZRO_WORDMARK } from './marca'

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

/**
 * Os ícones públicos: só as plataformas no ar (apps/hub-web/public/products). Este arquivo vai para o navegador, então
 * nada aqui cita app que ainda não lançou (revisão de 01/11/2026); o ícone dele vem da rota /marca/<produto> do HUB, que
 * só o entrega para quem o produto existe (a administração e a lista do titular). Lançou? O ícone entra aqui e em public/.
 */
const ICONES_PUBLICOS: Readonly<Record<string, string>> = {
  sobedesce: '/products/sobedesce.svg',
  synquei: '/products/synquei.svg',
  tpeasy: '/products/tpeasy.svg',
  'carro-do-freela': '/products/carro-do-freela.png',
  maestro: '/products/maestro.svg',
  relay: '/products/relay.svg',
}

export function ProductMark({ productId, name, size = 32 }: { productId: string; name: string; size?: number }) {
  const src = ICONES_PUBLICOS[productId] ?? (/^[a-z0-9-]{1,40}$/.test(productId) ? `/marca/${productId}` : undefined)
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

/**
 * Marca flat Absolute ZRO (26/10/2026): uma cor só (herda `color`), serve em qualquer fundo e tamanho.
 * A centelha de 4 pontas fica por trás do anel e só mostra as pontas horizontais. Em animação ela aparece inteira
 * (manual: docs/marca/README.md). Abaixo de 20 px o símbolo vira só o anel.
 */
export function ZroSymbol({
  size = 24,
  title,
  className,
  animated = false,
}: {
  size?: number
  title?: string
  className?: string
  /** Animação de marca: a centelha nasce com as 4 pontas e recolhe as verticais para trás do anel. */
  animated?: boolean
}) {
  const ringOnly = size < 20
  return (
    <svg
      className={cx('zro-symbol', animated && 'zro-symbol--anim', className)}
      width={size}
      height={size}
      viewBox={ZRO_SIMBOLO.viewBox}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {!ringOnly && !animated && <path d={ZRO_SIMBOLO.centelha} />}
      <path fillRule="evenodd" d={ZRO_SIMBOLO.anel} />
      {animated && <path className="zro-symbol__spark" d={ZRO_SIMBOLO.centelha} />}
    </svg>
  )
}

export function ZroWordmark({ height = 22, title = 'Absolute ZRO', className }: { height?: number; title?: string; className?: string }) {
  const [, , w, h] = ZRO_WORDMARK.viewBox.split(' ').map(Number)
  return (
    <svg
      className={cx('zro-wordmark', className)}
      height={height}
      width={Math.round((height * w!) / h!)}
      viewBox={ZRO_WORDMARK.viewBox}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={ZRO_WORDMARK.letras} />
      <path d={ZRO_WORDMARK.centelha} />
      <path fillRule="evenodd" d={ZRO_WORDMARK.anel} />
    </svg>
  )
}

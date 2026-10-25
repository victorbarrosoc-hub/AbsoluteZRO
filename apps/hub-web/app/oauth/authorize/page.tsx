import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { denyUrl, grantConsent, hasConsent, issueCode, parseAuthorizeRequest } from '@zro/auth'
import { listMyOrganizations } from '@zro/core'
import { Notice, ProductMark } from '@zro/ui'
import { Icon } from '@/components/icons'
import { approveAppAction } from '@/lib/actions/oidc'
import '@/lib/oidc'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar com Absolute ZRO' }

const SHARED: Record<string, string> = {
  email: 'Seu e-mail e se ele está confirmado',
  profile: 'Seu nome',
  org: 'A organização ativa, seu papel nela e as ferramentas contratadas',
  offline_access: 'Continuar conectado sem pedir login de novo (dá para remover no Perfil)',
}

function toQuery(sp: Record<string, string | string[] | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') q.set(k, v)
  return q
}

export default async function Authorize({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = toQuery(await searchParams)
  const parsed = await db().asSystem('oidc: validar pedido', (tx) => parseAuthorizeRequest(tx, q))
  if (!parsed.ok) {
    if (parsed.redirect) redirect(parsed.to)
    return (
      <div className="stack">
        <h1>Não deu para continuar</h1>
        <Notice tone="danger" title={parsed.message}>
          O app que trouxe você até aqui está com a configuração errada. Volte para ele e tente de novo.
        </Notice>
        <Link className="zro-btn" href="/inicio">
          Ir para o HUB
        </Link>
      </div>
    )
  }
  const req = parsed.req
  const auth = await getAuth()
  const here = `/oauth/authorize?${q.toString()}`
  if (!auth) {
    if (req.prompt === 'none') redirect(denyUrl(req).replace('error=access_denied', 'error=login_required'))
    redirect(`/entrar?next=${encodeURIComponent(here)}`)
  }

  // App da família (trusted): entra direto, como numa central de apps. O consentimento fica registrado e removível no Perfil.
  const direct = req.client.trusted && req.prompt !== 'consent'
  const consented =
    direct || (req.prompt !== 'consent' && (await db().asSystem('oidc: consentimento', (tx) => hasConsent(tx, auth.user.id, req.client.id, req.scopes))))
  if (consented) {
    const to = await db().asSystem('oidc: emitir código', async (tx) => {
      if (direct) await grantConsent(tx, auth.user.id, req.client.id, req.scopes)
      return issueCode(tx, req, { userId: auth.user.id, orgId: auth.session.activeOrgId, authTime: auth.session.createdAt })
    })
    redirect(to)
  }
  if (req.prompt === 'none') redirect(denyUrl(req).replace('error=access_denied', 'error=consent_required'))

  const orgs = await listMyOrganizations(db(), auth)
  const active = orgs.find((o) => o.active)
  const query = new URLSearchParams(q)
  query.delete('prompt')
  return (
    <div className="consent">
      <div className="consent__marks" aria-hidden="true">
        {req.client.productId ? (
          <ProductMark productId={req.client.productId} name={req.client.name} size={56} />
        ) : (
          <span className="consent__ghost">
            <Icon name="apps" size={26} />
          </span>
        )}
        <span className="consent__link">
          <Icon name="swap" size={18} />
        </span>
        <img src="/brand/absolute-zro-o-alpha.webp" alt="" width={56} height={50} />
      </div>
      <div className="stack">
        <h1>Entrar no {req.client.name}</h1>
        <p className="zro-mute">
          com a conta <strong>{auth.user.email}</strong>
        </p>
      </div>
      <div className="consent__box">
        <p className="zro-faint">O {req.client.name} vai receber:</p>
        <ul className="consent__list">
          {req.scopes
            .filter((s) => SHARED[s])
            .map((s) => (
              <li key={s}>
                <Icon name="check" size={16} />
                {SHARED[s]}
                {s === 'org' && active ? <strong> ({active.name})</strong> : null}
              </li>
            ))}
        </ul>
        <p className="zro-faint">Nunca sua senha. O acesso pode ser removido a qualquer hora em Perfil e segurança.</p>
      </div>
      {orgs.length > 1 && (
        <p className="zro-faint">
          Quer usar outra organização? Troque no <Link href="/inicio">HUB</Link> e volte ao app.
        </p>
      )}
      <form action={approveAppAction} className="consent__actions">
        <input type="hidden" name="query" value={query.toString()} />
        <button type="submit" className="zro-btn zro-btn--primary zro-btn--large">
          Permitir e continuar
        </button>
        <a className="zro-btn zro-btn--ghost" href={denyUrl(req)}>
          Cancelar
        </a>
      </form>
    </div>
  )
}

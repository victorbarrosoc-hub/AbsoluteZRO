import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { denyUrl, grantConsent, hasConsent, issueCode, parseAuthorizeRequest, productClosedFor, RELEASE_CLOSED_DESCRIPTION } from '@zro/auth'
import { listMyOrganizations } from '@zro/core'
import { audit } from '@zro/observability'
import { Notice, ProductMark, ZroSymbol } from '@zro/ui'
import { EmDesenvolvimento } from '@/components/em-desenvolvimento'
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
  'carro-do-freela.jobs': 'Levar seus jobs e a equipe escalada para os projetos da organização',
  'zro.ia': 'Conversar com a IA da Absolute ZRO (usa os créditos de IA do seu plano)',
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
    // "Criar conta" num app da família: a conta nasce aqui, na Absolute ZRO, e volta ao app já logada.
    if (req.prompt === 'create') {
      const back = new URLSearchParams(q)
      back.delete('prompt')
      redirect(`/criar-conta?next=${encodeURIComponent(`/oauth/authorize?${back.toString()}`)}`)
    }
    redirect(`/entrar?next=${encodeURIComponent(here)}`)
  }
  // Gate de lançamento (ADR 0023): app de produto fechado só para contas listadas. Para as outras, nenhum código:
  // a pessoa vê "Em desenvolvimento" (200) e fica registrado; com prompt=none o app recebe access_denied.
  if (req.client.productId) {
    const productId = req.client.productId
    const fechado = await db().asSystem('oidc: gate de lançamento', async (tx) => {
      if (!(await productClosedFor(tx, req.client, auth.user.id, 'sso'))) return null
      const [p] = await tx`select name from zro.products where id = ${productId}`
      if (req.prompt !== 'none') {
        await audit(tx, {
          actorUserId: auth.user.id,
          action: 'release.denied',
          targetType: 'product',
          targetId: productId,
          metadata: { client: req.client.id, channel: 'sso' },
        })
      }
      return { id: productId, nome: (p?.name as string) ?? req.client.name }
    })
    if (fechado) {
      if (req.prompt === 'none') redirect(denyUrl(req, RELEASE_CLOSED_DESCRIPTION))
      return <EmDesenvolvimento produto={fechado} />
    }
  }
  // O acesso às ferramentas vem do plano da organização: conta recém-criada passa por Boas-vindas e volta aqui.
  if (!auth.session.activeOrgId && req.prompt !== 'none') redirect(`/boas-vindas?next=${encodeURIComponent(here)}`)

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
        <ZroSymbol size={56} title="Absolute ZRO" />
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

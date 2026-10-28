import type { Metadata } from 'next'
import { accessOverview, avatarVersion } from '@zro/core'
import { Card, EmptyState, Pill, ProductMark } from '@zro/ui'
import { AccountFrame } from '@/components/account-frame'
import { revokeAppAction } from '@/lib/actions/oidc'
import { connectedAppsData } from '@/lib/data/hub'
import { ACCESS_LABEL, fmtDate, fmtDay, ROLE_LABEL } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Acessos' }

export default async function Acessos() {
  const auth = await requireOrgPage()
  const [avatar, orgs, apps] = await Promise.all([avatarVersion(db(), auth), accessOverview(db(), auth), connectedAppsData(auth)])
  return (
    <AccountFrame auth={auth} avatar={avatar} title="Acessos">
      <div className="access-orgs">
        {orgs.map((o) => (
          <article key={o.id} className="access-org">
            <header className="row row--between">
              <h2 className="access-org__name">{o.name}</h2>
              <span className="row">
                {o.active && <Pill tone="accent">ativa</Pill>}
                <Pill>{ROLE_LABEL[o.role] ?? o.role}</Pill>
              </span>
            </header>
            <p className="zro-mute">
              {o.plans === null
                ? 'Plano visível para quem cuida da cobrança'
                : o.plans.length
                  ? o.plans.map((p) => `${p.name}${p.until ? ` até ${fmtDay(p.until)}` : ''}`).join(' · ')
                  : 'Sem plano ativo'}
            </p>
            <ul className="access-org__apps">
              {o.products
                .filter((p) => p.access !== 'disabled')
                .map((p) => (
                  <li key={p.id} className={p.access === 'contracted' ? 'is-on' : 'is-off'} title={`${p.name}: ${ACCESS_LABEL[p.access]}`}>
                    <ProductMark productId={p.id} name={p.name} size={36} />
                    <span>{p.name}</span>
                    {p.access === 'closed' ? (
                      <span className="selo-dev">{ACCESS_LABEL.closed}</span>
                    ) : (
                      <span className="zro-sr-only">: {ACCESS_LABEL[p.access]}</span>
                    )}
                  </li>
                ))}
            </ul>
          </article>
        ))}
      </div>

      <Card title="Apps em que você entrou" id="apps">
        {apps.length ? (
          <ul className="list-rows">
            {apps.map((a) => (
              <li key={a.client_id as string} className="list-rows__item">
                <ProductMark productId={(a.product_id as string) ?? ''} name={a.name as string} size={30} />
                <span className="list-rows__main">
                  {a.name as string}
                  <span className="zro-faint">
                    {' '}
                    · desde {fmtDate((a.first_login_at ?? a.granted_at) as Date)}
                    {a.last_login_at ? ` · último acesso ${fmtDate(a.last_login_at as Date)}` : ''}
                  </span>
                </span>
                <form action={revokeAppAction}>
                  <input type="hidden" name="clientId" value={a.client_id as string} />
                  <button className="zro-btn zro-btn--danger zro-btn--small" type="submit">
                    Remover acesso<span className="zro-sr-only"> do {a.name as string}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhum app ainda">Ao abrir um app da família com esta conta, ele aparece aqui.</EmptyState>
        )}
      </Card>
    </AccountFrame>
  )
}

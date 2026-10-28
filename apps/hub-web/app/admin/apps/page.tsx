import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { requirePlatformAdmin } from '@zro/core'
import { EmptyState, Field, Notice, Pill, ProductMark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { Fold } from '@/components/admin/parts'
import { registerOAuthClientAction, setOAuthClientStatusAction } from '@/lib/actions/admin'
import { fmtDay } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Apps · Console', robots: { index: false, follow: false } }

/** Apps que usam "Entrar com Absolute ZRO" (login único). O técnico (client_id, endereços de retorno) fica recolhido. */
export default async function Apps() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const isAdmin = auth.user.platformRole === 'admin'
  const d = await db().asSystem('admin: apps do login único', async (tx) => ({
    clients: await tx`select c.id, c.name, c.product_id, c.kind, c.redirect_uris, c.allow_loopback, c.trusted, c.status, c.created_at,
                      (select count(*)::int from zro.app_accounts a where a.client_id = c.id) as accounts,
                      (select count(*)::int from zro.app_accounts a where a.client_id = c.id and a.last_login_at > now() - interval '7 days') as active7
               from zro.oauth_clients c order by c.status, (select count(*) from zro.app_accounts a where a.client_id = c.id) desc, c.name`,
    products: await tx`select id, name from zro.products order by step_order`,
  }))

  return (
    <div className="page adm-page">
      <header className="adm-head">
        <h1>Apps</h1>
        <p>Os apps que entram com a conta Absolute ZRO.</p>
      </header>
      {!isAdmin && <Notice title="Só leitura">Cadastrar e desativar exige papel admin.</Notice>}

      {d.clients.length ? (
        <ul className="app-cards">
          {d.clients.map((c, i) => {
            const on = c.status === 'active'
            return (
              <li key={c.id as string} className={`app-card${on ? '' : ' app-card--off'}`} style={{ '--i': i } as CSSProperties}>
                <div className="app-card__head">
                  <ProductMark productId={(c.product_id as string) ?? ''} name={c.name as string} size={44} />
                  <div className="app-card__who">
                    <strong>{c.name as string}</strong>
                    <span className="zro-faint">
                      {c.kind === 'public' ? 'Computador ou celular' : 'Site'}
                      {c.trusted ? ' · da família' : ''}
                    </span>
                  </div>
                  <Pill tone={on ? 'ok' : 'faint'}>{on ? 'Ativo' : 'Desativado'}</Pill>
                </div>
                <div className="app-card__nums">
                  <span>
                    <strong>{(c.accounts as number).toLocaleString('pt-BR')}</strong> {c.accounts === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                  <span>
                    <strong>{(c.active7 as number).toLocaleString('pt-BR')}</strong> em 7 dias
                  </span>
                </div>
                <details className="disclosure">
                  <summary>Detalhes técnicos</summary>
                  <dl className="kv">
                    <dt>client_id</dt>
                    <dd className="zro-mono">{c.id as string}</dd>
                    <dt>Tipo</dt>
                    <dd>{c.kind === 'public' ? 'Público (PKCE, sem segredo)' : 'Confidencial (com segredo)'}</dd>
                    <dt>Retornos</dt>
                    <dd className="zro-mono">
                      {(c.redirect_uris as string[]).map((u) => (
                        <div key={u}>{u}</div>
                      ))}
                      {c.allow_loopback ? <div className="zro-faint">qualquer porta em 127.0.0.1</div> : null}
                    </dd>
                    <dt>Cadastrado</dt>
                    <dd>{fmtDay(c.created_at as Date)}</dd>
                  </dl>
                </details>
                {isAdmin && (
                  <details className="adm-confirm">
                    <summary className="zro-btn zro-btn--small">{on ? 'Desativar…' : 'Reativar…'}</summary>
                    <ActionForm
                      action={setOAuthClientStatusAction}
                      submit={on ? 'Desativar e encerrar sessões' : 'Reativar'}
                      variant={on ? 'danger' : 'primary'}
                    >
                      {on && <p className="zro-mute">Ninguém entra mais por este app, e quem está dentro sai.</p>}
                      <input type="hidden" name="clientId" value={c.id as string} />
                      <input type="hidden" name="status" value={on ? 'disabled' : 'active'} />
                      <input className="zro-input" name="reason" placeholder="Motivo" aria-label={`Motivo para mudar ${c.name as string}`} required />
                    </ActionForm>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState title="Nenhum app cadastrado ainda." />
      )}

      {isAdmin && (
        <Fold title="Cadastrar app">
          <ActionForm action={registerOAuthClientAction} submit="Cadastrar">
            <p className="zro-mute">Site com servidor guarda segredo. App de computador ou celular entra sem segredo.</p>
            <div className="zro-form-row">
              <Field label="Nome que a pessoa vê" htmlFor="oc-name">
                <input className="zro-input" id="oc-name" name="name" required maxLength={80} />
              </Field>
              <Field label="Identificador" htmlFor="oc-id" hint="Ex.: sobedesce-web">
                <input className="zro-input" id="oc-id" name="clientId" required pattern="[a-z0-9][a-z0-9-]{2,62}" />
              </Field>
              <Field label="Produto" htmlFor="oc-product">
                <select className="zro-select" id="oc-product" name="productId" defaultValue="">
                  <option value="">Nenhum</option>
                  {d.products.map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {p.name as string}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo" htmlFor="oc-kind">
                <select className="zro-select" id="oc-kind" name="kind" defaultValue="confidential">
                  <option value="confidential">Site (com servidor)</option>
                  <option value="public">Computador ou celular</option>
                </select>
              </Field>
            </div>
            <Field label="Endereços de retorno" htmlFor="oc-uris" hint="Um por linha: https, http://127.0.0.1/caminho ou esquema do app.">
              <textarea className="zro-textarea" id="oc-uris" name="redirectUris" required rows={3} />
            </Field>
            <label className="switch-row">
              <input type="checkbox" name="allowLoopback" className="switch" /> Aceitar qualquer porta em 127.0.0.1 (computador)
            </label>
            <label className="switch-row">
              <input type="checkbox" name="trusted" className="switch" /> App da família (entra direto, sem a tela Permitir)
            </label>
            <Field label="Motivo" htmlFor="oc-reason">
              <input className="zro-input" id="oc-reason" name="reason" required />
            </Field>
          </ActionForm>
        </Fold>
      )}
    </div>
  )
}

import type { Metadata } from 'next'
import { PASSWORD_MIN } from '@zro/auth'
import { Card, EmptyState, Field, Notice, Pill, ProductMark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { changePasswordAction, logoutAction, resendVerifyAction, revokeSessionAction } from '@/lib/actions/auth'
import { revokeAppAction } from '@/lib/actions/oidc'
import { connectedAppsData, profileData } from '@/lib/data/hub'
import { fmtDate } from '@/lib/labels'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Perfil e segurança' }

export default async function Perfil() {
  const auth = await requireOrgPage()
  const [sessions, apps] = await Promise.all([profileData(auth), connectedAppsData(auth)])
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Perfil e segurança</h1>
        <p>Sua conta Absolute ZRO vale para todas as organizações de que você participa.</p>
      </div>
      <div className="grid grid--2">
        <Card title="Conta">
          <dl className="kv">
            <dt>Nome</dt>
            <dd>{auth.user.displayName}</dd>
            <dt>E-mail</dt>
            <dd>
              {auth.user.email} {auth.user.emailVerified ? <Pill tone="ok">confirmado</Pill> : <Pill tone="warn">não confirmado</Pill>}
            </dd>
          </dl>
          {!auth.user.emailVerified && (
            <ActionForm action={resendVerifyAction} submit="Reenviar link de confirmação" variant="ghost">
              <span className="zro-faint">O link vale por 48 horas.</span>
            </ActionForm>
          )}
          <Notice title="Verificação em duas etapas">Ainda não disponível. Está no roteiro de segurança (docs/roadmap.md).</Notice>
        </Card>
        <Card title="Trocar senha">
          <ActionForm action={changePasswordAction} submit="Trocar senha">
            <Field label="Senha atual" htmlFor="cur">
              <input className="zro-input" id="cur" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="Nova senha" htmlFor="nxt" hint={`Pelo menos ${PASSWORD_MIN} caracteres. As outras sessões serão encerradas.`}>
              <input className="zro-input" id="nxt" name="next" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
            </Field>
          </ActionForm>
        </Card>
      </div>
      <Card
        title="Sessões abertas"
        actions={
          <form action={logoutAction}>
            <button className="zro-btn zro-btn--small zro-btn--ghost" type="submit">
              Sair desta sessão
            </button>
          </form>
        }
      >
        <ul className="list-plain">
          {sessions.map((s) => (
            <li key={s.id as string} className="row row--between">
              <span>
                {s.id === auth.session.id ? <Pill tone="accent">esta sessão</Pill> : null}{' '}
                <span className="zro-mute">{((s.user_agent as string) || 'navegador desconhecido').slice(0, 80)}</span>
                <div className="zro-faint">
                  Entrou {fmtDate(s.created_at as Date)} · último uso {fmtDate(s.last_used_at as Date)} · expira {fmtDate(s.expires_at as Date)}
                </div>
              </span>
              {s.id !== auth.session.id && (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id as string} />
                  <button className="zro-btn zro-btn--danger zro-btn--small" type="submit">
                    Encerrar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Apps com acesso" id="apps">
        {apps.length ? (
          <ul className="list-rows">
            {apps.map((a) => (
              <li key={a.client_id as string} className="list-rows__item">
                <ProductMark productId={(a.product_id as string) ?? ''} name={a.name as string} size={30} />
                <span className="list-rows__main">
                  {a.name as string}
                  <span className="zro-faint"> · entrou com Absolute ZRO em {fmtDate(a.granted_at as Date)}</span>
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
          <EmptyState title="Nenhum app conectado">Quando você usar "Entrar com Absolute ZRO" num app da família, ele aparece aqui.</EmptyState>
        )}
      </Card>
    </div>
  )
}

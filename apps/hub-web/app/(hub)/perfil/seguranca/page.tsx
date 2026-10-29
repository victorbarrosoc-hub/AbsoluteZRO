import type { Metadata } from 'next'
import Link from 'next/link'
import { hasPassword, PASSWORD_MIN } from '@zro/auth'
import { avatarVersion } from '@zro/core'
import { Card, Field, Pill } from '@zro/ui'
import { CampoSenha } from '@zro/ui/senha'
import { AccountFrame } from '@/components/account-frame'
import { ActionForm } from '@/components/action-form'
import { requestEmailChangeAction } from '@/lib/actions/account'
import { changePasswordAction, logoutAction, resendVerifyAction, revokeSessionAction } from '@/lib/actions/auth'
import { profileData } from '@/lib/data/hub'
import { fmtDate } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Segurança' }

/** Nome curto do aparelho a partir do user agent (sem guardar nada além do que a sessão já tem). */
function device(ua: string): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  const app = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null
  return [app, os].filter(Boolean).join(' no ') || 'Navegador desconhecido'
}

export default async function Seguranca() {
  const auth = await requireOrgPage()
  const [avatar, sessions, withPassword] = await Promise.all([avatarVersion(db(), auth), profileData(auth), hasPassword(db(), auth.user.id)])
  return (
    <AccountFrame auth={auth} avatar={avatar} title="Segurança">
      <div className="grid grid--2">
        <Card title="E-mail" id="email">
          <p className="row">
            <strong>{auth.user.email}</strong>
            {auth.user.emailVerified ? <Pill tone="ok">confirmado</Pill> : <Pill tone="warn">não confirmado</Pill>}
          </p>
          {!auth.user.emailVerified && (
            <ActionForm action={resendVerifyAction} submit="Reenviar confirmação" variant="ghost">
              <span className="zro-faint">O link vale por 48 horas.</span>
            </ActionForm>
          )}
          <details className="account-more">
            <summary>Trocar e-mail</summary>
            <ActionForm action={requestEmailChangeAction} submit="Enviar link ao novo e-mail">
              <Field label="Novo e-mail" htmlFor="novo-email">
                <input className="zro-input" id="novo-email" name="email" type="email" autoComplete="email" required />
              </Field>
              <Field label="Senha atual" htmlFor="senha-email">
                <CampoSenha className="zro-input" id="senha-email" name="password" autoComplete="current-password" required />
              </Field>
            </ActionForm>
          </details>
        </Card>
        <Card title="Senha" id="senha">
          {withPassword ? (
            <details className="account-more">
              <summary>Trocar senha</summary>
              <ActionForm action={changePasswordAction} submit="Trocar senha">
                <Field label="Senha atual" htmlFor="cur">
                  <CampoSenha className="zro-input" id="cur" name="current" autoComplete="current-password" required />
                </Field>
                <Field label="Nova senha" htmlFor="nxt" hint={`Pelo menos ${PASSWORD_MIN} caracteres. As outras sessões serão encerradas.`}>
                  <CampoSenha className="zro-input" id="nxt" name="next" autoComplete="new-password" minLength={PASSWORD_MIN} required />
                </Field>
              </ActionForm>
            </details>
          ) : (
            <p className="zro-mute">
              Você entra pelo Google. <Link href="/esqueci-a-senha">Criar uma senha</Link>
            </p>
          )}
          <p className="zro-faint" title="Está no roteiro de segurança (docs/roadmap.md).">
            Verificação em duas etapas: em breve.
          </p>
        </Card>
      </div>
      <Card
        title="Onde você está conectado"
        id="sessoes"
        actions={
          <form action={logoutAction}>
            <button className="zro-btn zro-btn--small zro-btn--ghost" type="submit">
              Sair daqui
            </button>
          </form>
        }
      >
        <ul className="list-rows">
          {sessions.map((s) => {
            const here = s.id === auth.session.id
            const ua = (s.user_agent as string) || ''
            return (
              <li key={s.id as string} className="list-rows__item">
                <span className="list-rows__main" title={ua.slice(0, 200)}>
                  <strong>{device(ua)}</strong> {here && <Pill tone="accent">este aparelho</Pill>}
                  <span className="zro-faint"> · último uso {fmtDate(s.last_used_at as Date)}</span>
                </span>
                {!here && (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id as string} />
                    <button className="zro-btn zro-btn--danger zro-btn--small" type="submit">
                      Encerrar
                    </button>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
      <section className="excluir-zona" aria-labelledby="excluir-zona-titulo">
        <div className="excluir-zona__texto">
          <h2 id="excluir-zona-titulo" className="excluir-zona__titulo">
            Excluir conta
          </h2>
          <p className="zro-faint">Apaga a conta e o acesso a todos os apps.</p>
        </div>
        <Link className="zro-btn zro-btn--small zro-btn--danger" href="/perfil/excluir">
          Excluir…
        </Link>
      </section>
    </AccountFrame>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { avatarVersion } from '@zro/core'
import { Field } from '@zro/ui'
import { AccountFrame } from '@/components/account-frame'
import { ActionForm } from '@/components/action-form'
import { AvatarEditor } from '@/components/avatar-editor'
import { Icon, type IconName } from '@/components/icons'
import { avatarAction, removeAvatarAction, updateNameAction } from '@/lib/actions/account'
import { accountSummary, planCenterData } from '@/lib/data/hub'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Sua conta' }

function Tile({ href, icon, title, value }: { href: string; icon: IconName; title: string; value: string }) {
  return (
    <Link href={href} className="account-tile">
      <span className="account-tile__icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="account-tile__text">
        <strong>{title}</strong>
        <span className="zro-mute">{value}</span>
      </span>
      <Icon name="chevron" className="account-tile__go" />
    </Link>
  )
}

export default async function Perfil() {
  const auth = await requireOrgPage()
  const [avatar, sum, plan] = await Promise.all([avatarVersion(db(), auth), accountSummary(auth), planCenterData(auth)])
  const name = auth.user.displayName || auth.user.email
  const planName = plan.canManage ? plan.subscriptions.map((s) => s.name as string).join(' + ') || 'Sem plano' : 'Visível para quem cuida da cobrança'
  return (
    <AccountFrame auth={auth} avatar={avatar} title="Visão geral">
      <div className="account-card account-card--id">
        <AvatarEditor action={avatarAction} current={avatar ? `/api/v1/users/${auth.user.id}/avatar?v=${avatar}` : null} name={name} />
        <ActionForm action={updateNameAction} submit="Salvar" variant="ghost" className="zro-form account-name" inlineSubmit>
          <Field label="Nome" htmlFor="nome">
            <input className="zro-input" id="nome" name="name" defaultValue={auth.user.displayName} autoComplete="name" maxLength={120} required />
          </Field>
        </ActionForm>
        {avatar ? (
          <form action={removeAvatarAction}>
            <button className="zro-btn zro-btn--ghost zro-btn--small" type="submit">
              Remover foto
            </button>
          </form>
        ) : null}
      </div>
      {/* perfil único (0015): os apps leem nome, foto e e-mail daqui; cada um guarda só os dados próprios */}
      <p className="account-unico" title="Os apps leem nome, foto e e-mail desta conta ao abrir. Cada um guarda só os dados próprios dele.">
        Nome, foto e e-mail valem para todas as ferramentas da Absolute ZRO.
      </p>
      <div className="account-tiles">
        <Tile
          href="/perfil/seguranca"
          icon="lock"
          title="Segurança"
          value={`${auth.user.emailVerified ? 'E-mail confirmado' : 'Confirme o e-mail'} · ${sum.sessions} ${sum.sessions === 1 ? 'sessão' : 'sessões'}`}
        />
        <Tile href="/perfil/plano" icon="card" title="Plano" value={planName} />
        <Tile
          href="/perfil/acessos"
          icon="apps"
          title="Acessos"
          value={`${sum.tools} ${sum.tools === 1 ? 'ferramenta' : 'ferramentas'} · ${sum.orgs} ${sum.orgs === 1 ? 'organização' : 'organizações'}`}
        />
      </div>
    </AccountFrame>
  )
}

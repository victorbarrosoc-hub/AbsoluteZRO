import Link from 'next/link'
import { ZroSymbol, ZroWordmark } from '@zro/ui'
import { Avatar } from '@/components/avatar'
import { logoutAppAction } from '@/lib/actions/auth'

type Aba = 'ia' | 'apps'

/**
 * A barra lateral do app Absolute ZRO (computador e celular): a IA abre primeiro, depois os apps, os projetos, os
 * planos e a conta. No celular vira a barra de abas embaixo, e a marca com a conta sobe para o topo.
 */
export function PainelLado({ ativo, userId, nome, email, avatar }: { ativo: Aba; userId: string; nome: string; email: string; avatar: number | null }) {
  const item = (aba: Aba) => `painel__item${ativo === aba ? ' painel__item--ativo' : ''}`
  const atual = (aba: Aba) => (ativo === aba ? ('page' as const) : undefined)
  return (
    <aside className="painel__lado">
      <div className="painel__marca">
        <ZroSymbol size={28} />
        <ZroWordmark height={14} title="Absolute ZRO" />
      </div>
      <nav className="painel__nav" aria-label="Painel">
        <Link className={item('ia')} href="/app" aria-current={atual('ia')}>
          <span aria-hidden="true">✦</span> IA
        </Link>
        <Link className={item('apps')} href="/app/apps" aria-current={atual('apps')}>
          <span aria-hidden="true">◎</span> Apps
        </Link>
        <Link className="painel__item" href="/inicio">
          <span aria-hidden="true">▦</span> Projetos
        </Link>
        <Link className="painel__item" href="/planos">
          <span aria-hidden="true">◇</span> Planos
        </Link>
        <Link className="painel__item" href="/perfil">
          <span aria-hidden="true">○</span> Conta
        </Link>
      </nav>
      <div className="painel__conta">
        <Avatar userId={userId} name={nome} version={avatar} size={36} />
        <span className="painel__quem">
          <strong>{nome}</strong>
          <span>{email}</span>
        </span>
        <form action={logoutAppAction}>
          <button type="submit" className="painel__sair" title="Sair desta conta">
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}

/** Só no celular: a marca no topo e a conta no avatar. */
export function PainelMovel({ userId, nome, avatar }: { userId: string; nome: string; avatar: number | null }) {
  return (
    <div className="painel__movel">
      <span className="painel__movel-marca">
        <ZroSymbol size={24} />
        <ZroWordmark height={12} title="Absolute ZRO" />
      </span>
      <Link href="/perfil" className="painel__movel-conta" aria-label="Sua conta">
        <Avatar userId={userId} name={nome} version={avatar} size={32} />
      </Link>
    </div>
  )
}

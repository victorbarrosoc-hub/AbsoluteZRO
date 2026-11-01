import Link from 'next/link'
import { ZroSymbol, ZroWordmark } from '@zro/ui'
import { Avatar } from '@/components/avatar'
import { logoutAppAction } from '@/lib/actions/auth'

type Aba = 'apps' | 'z' | 'ajustes'

/** O anel da Z, fino (o mesmo desenho da entrada da Z nos apps da família). */
function AnelZ({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7.75" />
    </svg>
  )
}

/**
 * A barra lateral do app Absolute ZRO (computador e celular): os apps abrem primeiro (a tarefa), depois os projetos, os
 * planos e a conta. A Z (titular, 29/10/2026; Plano de Integração §7–8) não é aba nem a primeira tela: um item
 * discreto no pé da barra no computador e, no celular, o anel do topo (PainelMovel). No celular a barra vira a barra
 * de abas embaixo, e a marca com a conta sobe para o topo.
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
        <Link className={item('apps')} href="/app" aria-current={atual('apps')}>
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
        {/* Ajustes deste computador (Atualizar sozinho por app): só no app Absolute ZRO para computador */}
        <Link className={`${item('ajustes')} painel__item--no-app`} href="/app/ajustes" aria-current={atual('ajustes')}>
          <span aria-hidden="true">⚙︎</span> Ajustes
        </Link>
      </nav>
      <Link className={`painel__z${ativo === 'z' ? ' painel__z--ativo' : ''}`} href="/app/ia" aria-current={atual('z')} title="Z, a IA da Absolute ZRO">
        <AnelZ size={16} /> Z
      </Link>
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

/** Só no celular: a marca no topo, a Z num anel discreto e a conta no avatar. */
export function PainelMovel({ userId, nome, avatar, naZ = false }: { userId: string; nome: string; avatar: number | null; naZ?: boolean }) {
  return (
    <div className="painel__movel">
      <span className="painel__movel-marca">
        <ZroSymbol size={24} />
        <ZroWordmark height={12} title="Absolute ZRO" />
      </span>
      <span className="painel__movel-acoes">
        <Link
          href="/app/ia"
          className={`painel__movel-z${naZ ? ' painel__movel-z--ativo' : ''}`}
          aria-label="Z, a IA da Absolute ZRO"
          title="Z, a IA da Absolute ZRO"
          aria-current={naZ ? 'page' : undefined}
        >
          <AnelZ size={20} />
        </Link>
        <Link href="/perfil" className="painel__movel-conta" aria-label="Sua conta">
          <Avatar userId={userId} name={nome} version={avatar} size={32} />
        </Link>
      </span>
    </div>
  )
}

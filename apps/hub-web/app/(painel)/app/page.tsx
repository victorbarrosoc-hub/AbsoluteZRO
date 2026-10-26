import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { CSSProperties } from 'react'
import { productAccessFor } from '@zro/billing'
import { authorize, avatarVersion } from '@zro/core'
import { ProductMark, ZroSymbol, ZroWordmark } from '@zro/ui'
import { AppActions } from '@/components/app-actions'
import { productColor } from '@/components/app-tile'
import { Avatar } from '@/components/avatar'
import { PainelResumo } from '@/components/painel-resumo'
import { logoutAppAction } from '@/lib/actions/auth'
import { hasDesktopInstaller } from '@/lib/downloads'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Apps' }
export const dynamic = 'force-dynamic'

/** Uma linha por ferramenta, como na faixa da página inicial. */
const LINHA: Record<string, string> = {
  'carro-do-freela': 'Equipe e oportunidades',
  tpeasy: 'Teleprompter',
  sobedesce: 'Cópia e backup conferidos',
  synquei: 'Organização e sincronia',
  'ai-edit': 'Edição de vídeo',
  nossom: 'Tratamento de som',
  finishing: 'Cor e entrega',
}

/** Site oficial quando o catálogo ainda não tem o endereço. */
const SITE: Record<string, string> = {
  'ai-edit': 'https://aeon.absolutezro.com',
  finishing: 'https://revela.absolutezro.com',
}

/**
 * Painel do app Absolute ZRO para computador, no espírito do Creative Cloud: barra lateral com a conta, e as
 * ferramentas em cartões grandes com Instalar, Abrir e Atualizar (central do app) ou Abrir no navegador (apps da web).
 * Sem sessão, vai para o login do próprio app (/app/entrar).
 */
export default async function Painel() {
  const auth = await getAuth()
  if (!auth) redirect('/app/entrar')
  if (!auth.session.activeOrgId) redirect('/boas-vindas')
  const actor = await authorize(db(), auth)
  const [access, avatar] = await Promise.all([
    db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId)),
    avatarVersion(db(), auth),
  ])
  const nome = auth.user.displayName || auth.user.email
  const primeiro = nome.split(/\s+/)[0]
  const liberados = access.filter((a) => a.access === 'contracted').map((a) => a.productId)

  return (
    <div className="painel">
      <aside className="painel__lado">
        <div className="painel__marca">
          <ZroSymbol size={28} />
          <ZroWordmark height={14} title="Absolute ZRO" />
        </div>
        <nav className="painel__nav" aria-label="Painel">
          <a className="painel__item painel__item--ativo" href="#apps" aria-current="page">
            <span aria-hidden="true">◎</span> Apps
          </a>
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
          <Avatar userId={auth.user.id} name={nome} version={avatar} size={36} />
          <span className="painel__quem">
            <strong>{nome}</strong>
            <span>{auth.user.email}</span>
          </span>
          <form action={logoutAppAction}>
            <button type="submit" className="painel__sair" title="Sair desta conta">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <section className="painel__corpo" id="apps" aria-labelledby="painel-titulo">
        <header className="painel__topo">
          <h1 id="painel-titulo" className="painel__titulo">
            <span>Olá,</span> <strong>{primeiro}.</strong>
          </h1>
          <PainelResumo liberados={liberados} />
        </header>

        <ul className="painel__apps" aria-label="Ferramentas">
          {access.map((a, i) => {
            const instalavel = hasDesktopInstaller(a.productId)
            const abrir = a.ssoStartUrl || a.externalUrl || SITE[a.productId] || null
            return (
              <li key={a.productId} className="pcard" style={{ ...productColor(a.productId), '--i': i } as CSSProperties}>
                <span className="pcard__luz" aria-hidden="true" />
                <ProductMark productId={a.productId} name={a.name} size={64} />
                <div className="pcard__texto">
                  <h2>{a.name}</h2>
                  <p>{LINHA[a.productId] ?? a.roleInFlow}</p>
                </div>
                <div className="pcard__acoes">
                  {instalavel && <AppActions id={a.productId} nome={a.name} liberado={a.access === 'contracted'} web={abrir} />}
                  {/* no navegador (sem a central) e para os apps da web: abrir o app, já com a conta quando há login único */}
                  {abrir && (
                    <a
                      className={`zro-btn zro-btn--small${instalavel ? ' pcard__web' : ' zro-btn--primary'}`}
                      href={abrir}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {instalavel ? 'Abrir na web' : 'Abrir'}
                      <span className="zro-sr-only"> {a.name} (abre em nova aba)</span>
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

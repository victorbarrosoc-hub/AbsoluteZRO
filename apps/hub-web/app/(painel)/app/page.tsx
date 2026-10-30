import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { CSSProperties } from 'react'
import { productAccessFor } from '@zro/billing'
import { authorize, avatarVersion } from '@zro/core'
import { Pill, ProductMark } from '@zro/ui'
import { AppActions } from '@/components/app-actions'
import { productColor } from '@/components/app-tile'
import { PainelLado, PainelMovel } from '@/components/painel-lado'
import { PainelResumo } from '@/components/painel-resumo'
import { hasDesktopInstaller } from '@/lib/downloads'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Apps' }
export const dynamic = 'force-dynamic'

/** Uma linha por ferramenta, como na faixa da página inicial. */
const LINHA: Record<string, string> = {
  'carro-do-freela': 'Agenda e equipe',
  tpeasy: 'Teleprompter',
  sobedesce: 'Cópia e backup conferidos',
  synquei: 'Organização e sincronia',
  'ai-edit': 'Edição de vídeo',
  nossom: 'Tratamento de som',
  finishing: 'Cor e entrega',
  maestro: 'Gestão da produtora',
  relay: 'Conversão e exportação',
}

/** Site oficial quando o catálogo ainda não tem o endereço. */
const SITE: Record<string, string> = {
  'ai-edit': 'https://aeon.absolutezro.com',
  finishing: 'https://revela.absolutezro.com',
}

/**
 * Painel do app Absolute ZRO para computador, no espírito do Creative Cloud: barra lateral com a conta, e as
 * ferramentas em cartões grandes com Instalar, Abrir e Atualizar (central do app) ou Abrir no navegador (apps da web).
 * É a primeira tela do app (computador e Tela de Início do iPhone): a tarefa vem primeiro (titular, 29/10/2026; Plano
 * de Integração §7–8). A Z fica em /app/ia, num item discreto no pé da barra (no celular, no anel do topo).
 * Sem sessão, vai para o login do próprio app (/app/entrar). Gate de lançamento (ADR 0023) por canal: Instalar só com o
 * canal desktop aberto; Abrir (na web) só com o canal web aberto. Fechado nos dois fica só com o selo "Em
 * desenvolvimento". App só da web no ar (Maestro e Relay, sem app de computador ainda) abre na web, sem selo.
 */
export default async function Painel() {
  const auth = await getAuth()
  if (!auth) redirect('/app/entrar')
  if (!auth.session.activeOrgId) redirect('/boas-vindas')
  const actor = await authorize(db(), auth)
  const [access, naWeb, avatar] = await Promise.all([
    db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId, { channel: 'desktop' })),
    db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId, { channel: 'web' })),
    avatarVersion(db(), auth),
  ])
  const web = new Map(naWeb.map((w) => [w.productId, w]))
  const nome = auth.user.displayName || auth.user.email
  const primeiro = nome.split(/\s+/)[0]
  const liberados = access.filter((a) => a.access === 'contracted' || web.get(a.productId)?.access === 'contracted').map((a) => a.productId)

  return (
    <div className="painel">
      <PainelLado ativo="apps" userId={auth.user.id} nome={nome} email={auth.user.email} avatar={avatar} />

      <section className="painel__corpo" id="apps" aria-labelledby="painel-titulo">
        <PainelMovel userId={auth.user.id} nome={nome} avatar={avatar} />
        <header className="painel__topo">
          <h1 id="painel-titulo" className="painel__titulo">
            <span>Olá,</span> <strong>{primeiro}.</strong>
          </h1>
          <PainelResumo liberados={liberados} />
        </header>

        <ul className="painel__apps" aria-label="Ferramentas">
          {access.map((a, i) => {
            const fechadoNaWeb = (web.get(a.productId)?.access ?? 'closed') === 'closed'
            const fechado = a.access === 'closed' && fechadoNaWeb
            const instalavel = a.access !== 'closed' && hasDesktopInstaller(a.productId, new Set([a.productId]))
            const abrir = fechadoNaWeb ? null : a.ssoStartUrl || a.externalUrl || SITE[a.productId] || null
            return (
              <li key={a.productId} className="pcard" style={{ ...productColor(a.productId), '--i': i } as CSSProperties}>
                <span className="pcard__luz" aria-hidden="true" />
                <ProductMark productId={a.productId} name={a.name} size={64} />
                <div className="pcard__texto">
                  <h2>{a.name}</h2>
                  <p>{LINHA[a.productId] ?? a.roleInFlow}</p>
                </div>
                <div className="pcard__acoes">
                  {fechado && <Pill tone="faint">Em desenvolvimento</Pill>}
                  {instalavel && <AppActions id={a.productId} nome={a.name} liberado={a.access === 'contracted'} web={abrir} />}
                  {/* no navegador (sem a central) e para os apps da web: abrir o app, já com a conta quando há login único */}
                  {abrir && (
                    <a
                      className={`zro-btn zro-btn--small${instalavel ? ' pcard__web' : ' zro-btn--primary'}`}
                      href={abrir}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir{instalavel && <span className="pcard__na-web"> na web</span>}
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

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ONLINE_MINUTES, onlineAgora, papelNoConsole, podeVer, requirePlatformAdmin } from '@zro/core'
import { EmptyState, ProductMark, ZroSymbol } from '@zro/ui'
import { AtualizaSozinho } from '@/components/admin/atualiza-sozinho'
import { Face } from '@/components/admin/parts'
import { deviceLabel, fmtAgo } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Online agora · Console', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** Quem está online agora e onde: no HUB (com o aparelho) e em quais apps. Mesma regra do número da visão geral. */
export default async function OnlineAgoraPagina() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth || !podeVer(papelNoConsole(auth), 'visao')) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const pessoas = await db().asSystem('admin: quem está online', (tx) => onlineAgora(tx))
  const agora = Date.now()

  return (
    <div className="page adm-page">
      <AtualizaSozinho />
      <Link href="/admin" className="zro-faint">
        ← Visão geral
      </Link>
      <header className="adm-head">
        <h1>
          <span className={`adm-dot${pessoas.length ? ' adm-dot--live' : ''}`} aria-hidden="true" /> {pessoas.length.toLocaleString('pt-BR')} online
        </h1>
        <p title={`Movimento nos últimos ${ONLINE_MINUTES} minutos. Atualiza sozinho a cada 15 s.`}>Quem está aqui agora e onde.</p>
      </header>

      {pessoas.length ? (
        <ul className="adm-rows online-lista">
          {pessoas.map((p) => (
            <li key={p.userId}>
              <Link href={`/admin/pessoas/${p.userId}`} className="online-lista__quem">
                <Face name={p.name} avatarId={p.avatarId} online size={40} />
                <span className="online-lista__nome">
                  <strong>{p.name}</strong>
                  <span className="zro-faint">{fmtAgo(p.lastSeenAt, agora)}</span>
                </span>
              </Link>
              <ul className="online-lista__onde" aria-label={`Onde ${p.name} está`}>
                {p.hub && (
                  <li title={`HUB · ${fmtAgo(p.hub.lastSeenAt, agora)}`}>
                    <ZroSymbol size={18} />
                    <span>HUB</span>
                    <span className="zro-faint">{deviceLabel(p.hub.userAgent)}</span>
                  </li>
                )}
                {p.apps.map((a) => (
                  <li key={a.clientId} title={`${a.name} · ${fmtAgo(a.lastSeenAt, agora)}`}>
                    <ProductMark productId={a.productId ?? ''} name={a.name} size={18} />
                    <span>{a.name}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Ninguém online agora." />
      )}
    </div>
  )
}

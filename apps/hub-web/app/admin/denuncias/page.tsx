import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { denunciasSet, requirePlatformAdmin, type MotivoDenuncia } from '@zro/core'
import { EmptyState, Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { resolverDenunciaSetAction } from '@/lib/actions/admin'
import { fmtAgo } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Denúncias · Console', robots: { index: false, follow: false } }

const MOTIVO: Record<MotivoDenuncia, string> = { spam: 'Spam', assedio: 'Assédio', ofensa: 'Ofensa', golpe: 'Golpe', outro: 'Outro motivo' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Console › Denúncias do Set (ADR 0032): o mínimo que a pessoa mandou (motivo, detalhe, a mensagem se houver) e quantas
 * denúncias abertas a pessoa denunciada tem. Resolver fica na auditoria. Suspender a conta segue em Pessoas.
 */
export default async function Denuncias({ searchParams }: Props) {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const resolvidas = (await searchParams).ver === 'resolvidas'
  const lista = await db().asSystem('admin: denúncias do Set', (tx) => denunciasSet(tx, { estado: resolvidas ? 'resolvida' : 'aberta' }))

  return (
    <div className="page adm-page">
      <header className="adm-head adm-head--row">
        <div>
          <h1>Denúncias</h1>
          <p>O que chegou pelo Set: o motivo e a mensagem denunciada, nada mais.</p>
        </div>
        <Link className="zro-btn zro-btn--small zro-btn--ghost" href={resolvidas ? '/admin/denuncias' : '/admin/denuncias?ver=resolvidas'}>
          {resolvidas ? 'Ver abertas' : 'Ver resolvidas'}
        </Link>
      </header>

      {lista.length ? (
        <ul className="adm-rows">
          {lista.map((d) => (
            <li key={d.id} data-denuncia={d.id}>
              <div className="adm-denuncia">
                <p className="adm-denuncia__quem">
                  <Link href={`/admin/pessoas/${d.denunciado.id}`}>
                    <strong>{d.denunciado.nome}</strong>
                    {d.denunciado.arroba ? <span className="zro-faint"> @{d.denunciado.arroba}</span> : null}
                  </Link>
                  <Pill tone="warn">{MOTIVO[d.motivo]}</Pill>
                  {d.contra > 1 ? <Pill tone="danger">{d.contra} abertas</Pill> : null}
                </p>
                {d.mensagem ? <blockquote className="adm-denuncia__msg">{d.mensagem}</blockquote> : null}
                {d.detalhe ? <p className="zro-mute">“{d.detalhe}”</p> : null}
                <p className="zro-faint">
                  De {d.denunciante.nome}
                  {d.denunciante.arroba ? ` (@${d.denunciante.arroba})` : ''} · {fmtAgo(d.criadaEm)}
                </p>
              </div>
              {d.estado === 'aberta' ? (
                <ActionForm action={resolverDenunciaSetAction} submit="Resolver">
                  <input type="hidden" name="id" value={d.id} />
                </ActionForm>
              ) : (
                <Pill tone="ok">Resolvida</Pill>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={resolvidas ? 'Nenhuma denúncia resolvida ainda.' : 'Nenhuma denúncia aberta.'} />
      )}
    </div>
  )
}

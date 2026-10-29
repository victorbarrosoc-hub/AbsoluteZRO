import type { Metadata } from 'next'
import { listMembers, listMyOrganizations, meusConvites } from '@zro/core'
import { Card, Field, Notice, Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { Avatar } from '@/components/avatar'
import { BuscaConvite } from '@/components/pessoas/busca-convite'
import { MembroMenu } from '@/components/pessoas/membro-menu'
import { changeRoleAction, createOrgAction, inviteAction, removeMemberAction, revokeInviteAction } from '@/lib/actions/org'
import { buscarPessoasAction, convidarArrobaAction, responderConviteAction } from '@/lib/actions/perfil'
import { fmtDate, ROLE_LABEL } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Equipe' }

const ROLES = ['admin', 'manager', 'editor', 'viewer', 'billing'] as const

export default async function Equipe({ searchParams }: { searchParams: Promise<{ convidar?: string }> }) {
  const auth = await requireOrgPage()
  const convidar = String((await searchParams).convidar ?? '').slice(0, 40)
  const [{ actor, members, invitations }, orgs, convites] = await Promise.all([
    listMembers(db(), auth),
    listMyOrganizations(db(), auth),
    auth.user.emailVerified ? meusConvites(db(), auth) : Promise.resolve([]),
  ])
  const isAdmin = actor.role === 'owner' || actor.role === 'admin'
  const papeisConvite = ROLES.filter((r) => r !== 'admin' || actor.role === 'owner').map((r) => ({ valor: r, nome: ROLE_LABEL[r]! }))
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Equipe</h1>
        <p>Quem trabalha com você nesta organização.</p>
      </div>

      {convites.length ? (
        <Card title="Convites para você">
          <ul className="list-plain">
            {convites.map((c) => (
              <li key={c.id} className="row row--between">
                <span>
                  <strong>{c.organizacao}</strong>
                  <span className="zro-faint">
                    {' '}
                    · {ROLE_LABEL[c.papel]}
                    {c.projeto ? ` em ${c.projeto}` : ''} · de {c.convidou}
                  </span>
                </span>
                <form action={responderConviteAction} className="row">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="zro-btn zro-btn--small" type="submit" name="resposta" value="recusar">
                    Recusar
                  </button>
                  <button className="zro-btn zro-btn--primary zro-btn--small" type="submit" name="resposta" value="aceitar">
                    Aceitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Pessoas">
        <ul className="pmembros" aria-label="Pessoas da organização">
          {members.map((m) => {
            const id = m.id as string
            const nome = (m.display_name as string) || (m.email as string)
            const podeMexer = isAdmin && id !== actor.userId && (m.role !== 'owner' || actor.role === 'owner')
            const papeis = [...(actor.role === 'owner' ? ['owner'] : []), ...ROLES, ...(m.role === 'guest' ? ['guest'] : [])].map((r) => ({
              valor: r,
              nome: ROLE_LABEL[r]!,
            }))
            return (
              <li key={id} className="pmembro">
                <span className="pmembro__foto-wrap">
                  <Avatar userId={id} name={nome} version={m.foto_em ? (m.foto_em as Date).getTime() : null} size={40} />
                </span>
                <span className="pmembro__miolo">
                  <span className="pmembro__nome">
                    {m.arroba ? <a href={`/pessoas/@${m.arroba as string}`}>{nome}</a> : nome}
                    {id === actor.userId ? <span className="zro-faint"> · você</span> : null}
                  </span>
                  <span className="pmembro__sub">{[m.arroba ? `@${m.arroba as string}` : null, m.email as string].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="pmembro__papel" title={`Desde ${fmtDate(m.created_at as Date)}`}>
                  <Pill tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role as string]}</Pill>
                </span>
                {podeMexer ? (
                  <MembroMenu userId={id} nome={nome} papel={m.role as string} papeis={papeis} mudarPapel={changeRoleAction} remover={removeMemberAction} />
                ) : (
                  <span aria-hidden="true" style={{ width: 36 }} />
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      {isAdmin && (
        <div className="grid grid--2">
          <Card title="Convidar">
            {!auth.user.emailVerified ? (
              <Notice tone="warn" title="Confirme seu e-mail para convidar pessoas." />
            ) : (
              <BuscaConvite
                inicial={convidar}
                papeis={papeisConvite}
                buscar={buscarPessoasAction}
                convidarArroba={convidarArrobaAction}
                convidarEmail={inviteAction}
              />
            )}
          </Card>
          <Card title="Convites pendentes">
            {invitations.length ? (
              <ul className="list-plain">
                {invitations.map((i) => (
                  <li key={i.id as string} className="row row--between">
                    <span>
                      {i.email as string} <Pill>{ROLE_LABEL[i.role as string]}</Pill>
                      <span className="zro-faint"> · vence {fmtDate(i.expires_at as Date)}</span>
                    </span>
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="invitationId" value={i.id as string} />
                      <button className="zro-btn zro-btn--danger zro-btn--small" type="submit">
                        Cancelar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="zro-faint">Nenhum convite pendente.</p>
            )}
          </Card>
        </div>
      )}

      <Card title="Papéis">
        <details className="disclosure">
          <summary>O que cada papel pode</summary>
          <dl className="kv">
            <dt>Dono</dt>
            <dd>Tudo, inclusive transferir a posse. Toda organização tem pelo menos um.</dd>
            <dt>Administração</dt>
            <dd>Equipe, convites e todos os projetos.</dd>
            <dt>Gestão</dt>
            <dd>Todos os projetos e seus participantes.</dd>
            <dt>Edição</dt>
            <dd>Cria e edita projetos da organização (e os restritos em que foi incluída).</dd>
            <dt>Leitura</dt>
            <dd>Vê projetos, não altera.</dd>
            <dt>Financeiro</dt>
            <dd>Assinatura e consumo; não vê projetos.</dd>
          </dl>
        </details>
      </Card>

      <Card title="Suas organizações">
        <ul className="list-plain">
          {orgs.map((o) => (
            <li key={o.id} className="row row--between">
              <span>
                {o.name} {o.active && <Pill tone="accent">ativa</Pill>}
              </span>
              <span className="zro-faint">{ROLE_LABEL[o.role]}</span>
            </li>
          ))}
        </ul>
        <details className="disclosure">
          <summary>Criar outra organização</summary>
          <ActionForm action={createOrgAction} submit="Criar">
            <Field label="Nome" htmlFor="new-org">
              <input className="zro-input" id="new-org" name="name" required maxLength={120} />
            </Field>
          </ActionForm>
        </details>
      </Card>
    </div>
  )
}

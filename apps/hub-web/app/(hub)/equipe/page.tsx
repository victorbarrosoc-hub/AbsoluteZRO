import type { Metadata } from 'next'
import { listMembers, listMyOrganizations } from '@zro/core'
import { Card, Field, Notice, Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { changeRoleAction, createOrgAction, inviteAction, removeMemberAction, revokeInviteAction } from '@/lib/actions/org'
import { fmtDate, ROLE_LABEL } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Equipe' }

const ROLES = ['admin', 'manager', 'editor', 'viewer', 'billing'] as const

export default async function Equipe() {
  const auth = await requireOrgPage()
  const [{ actor, members, invitations }, orgs] = await Promise.all([listMembers(db(), auth), listMyOrganizations(db(), auth)])
  const isAdmin = actor.role === 'owner' || actor.role === 'admin'
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Equipe</h1>
        <p>Quem participa desta organização e o que cada papel pode fazer. O acesso às ferramentas segue o plano da organização.</p>
      </div>
      <Card title="Pessoas">
        <div className="zro-table-wrap" tabIndex={0} role="region" aria-label="Tabela">
          <table className="zro-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Papel</th>
                <th>Desde</th>
                {isAdmin && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id as string}>
                  <td>
                    <strong>{(m.display_name as string) || '—'}</strong>
                    <div className="zro-faint">{m.email as string}</div>
                  </td>
                  <td>
                    <Pill tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role as string]}</Pill>
                  </td>
                  <td className="zro-faint">{fmtDate(m.created_at as Date)}</td>
                  {isAdmin && (
                    <td>
                      {m.id !== actor.userId && (m.role !== 'owner' || actor.role === 'owner') ? (
                        <div className="stack">
                          <ActionForm action={changeRoleAction} submit="Mudar papel" variant="ghost" className="row" inlineSubmit>
                            <input type="hidden" name="userId" value={m.id as string} />
                            <select className="zro-select" name="role" defaultValue={m.role as string} aria-label="Novo papel">
                              {[...(actor.role === 'owner' ? ['owner'] : []), ...ROLES, ...(m.role === 'guest' ? ['guest'] : [])].map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          </ActionForm>
                          <ActionForm action={removeMemberAction} submit="Remover" variant="danger" className="">
                            <input type="hidden" name="userId" value={m.id as string} />
                          </ActionForm>
                        </div>
                      ) : (
                        <span className="zro-faint">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isAdmin && (
        <div className="grid grid--2">
          <Card title="Convidar">
            {!auth.user.emailVerified ? (
              <Notice tone="warn" title="Confirme seu e-mail para convidar pessoas." />
            ) : (
              <ActionForm action={inviteAction} submit="Criar convite">
                <Field label="E-mail" htmlFor="inv-email">
                  <input className="zro-input" id="inv-email" name="email" type="email" required />
                </Field>
                <Field label="Papel" htmlFor="inv-role">
                  <select className="zro-select" id="inv-role" name="role" defaultValue="editor">
                    {ROLES.filter((r) => r !== 'admin' || actor.role === 'owner').map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
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

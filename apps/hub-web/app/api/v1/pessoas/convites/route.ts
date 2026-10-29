import { convidarPorArroba, ESCOPO_PESSOAS, type OrgRole } from '@zro/core'
import { DomainError } from '@zro/observability'
import { readJson, route } from '@/lib/api'
import { avisarConvitePorArroba, exigirApp } from '@/lib/pessoas'

const PAPEIS = ['admin', 'manager', 'editor', 'viewer', 'billing'] as const

/**
 * POST /api/v1/pessoas/convites { arroba, papel } — convida o @ para a organização do token (dono ou administração;
 * administrador só o dono). A pessoa aceita na Absolute ZRO antes de entrar; o e-mail dela nunca volta. Só com o
 * token do app (escopo zro.pessoas). Contrato: docs/integration-contracts/pessoas.md.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    const b = (await readJson(req, 10_000)) as Record<string, unknown> | null
    const arroba = typeof b?.arroba === 'string' ? b.arroba : ''
    const papel = typeof b?.papel === 'string' ? b.papel : 'editor'
    if (!(PAPEIS as readonly string[]).includes(papel)) throw new DomainError('invalid_input', 'Papel inválido.')
    const r = await convidarPorArroba(db, exigirApp(auth), { arroba, role: papel as Exclude<OrgRole, 'owner' | 'guest'> })
    const aviso = await avisarConvitePorArroba(r.invitationId, r.token)
    return Response.json(
      { convite: { id: r.invitationId, arroba: r.arroba, papel, aviso: aviso.enviado ? 'email' : 'central' } },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  },
  { bearer: ESCOPO_PESSOAS, mutation: true },
)

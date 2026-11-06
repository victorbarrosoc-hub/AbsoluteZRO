import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { acessoAoRadio } from '@/lib/radio'
import { pedirIceServers } from '@/lib/radio/nucleo'

/**
 * GET /api/v1/radio/ice — os servidores de conexão do rádio para este aparelho: STUN e, com a chave TURN da Cloudflare
 * (CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN, só no servidor), credenciais temporárias de 6 h para a voz passar
 * entre redes que não se alcançam direto (4G com CGNAT). Rádio do set (ADR 0042), não lançado: fora do gate, 404.
 */
export const GET = route(async ({ db, auth }) => {
  if (!(await acessoAoRadio(db, auth))) throw new DomainError('not_found', 'Não encontrado.')
  return json({ ok: true, ...(await pedirIceServers(process.env)) })
})

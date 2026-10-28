/**
 * Gate de lançamento (ADR 0023): o que o HUB faz com sessões emitidas antes do gate existir. Os clientes do login
 * único dos produtos fechados já entregaram refresh tokens (30 dias) e consentimentos a qualquer conta; a partir do
 * gate o HUB não renova nem aceita esses tokens, mas revogar o que existe deixa o estado do banco igual à regra e
 * encerra os access tokens de 10 min na hora (o consentimento é conferido a cada pedido).
 *
 * `npm run db:release:revoke` (scripts/release-revoke.ts) chama isto: prévia por padrão, `--apply` para executar.
 * Nunca roda sozinho em produção: pede motivo e deixa uma linha de auditoria por cliente.
 */
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'

export type ReleaseRevokeReport = {
  apply: boolean
  clients: { clientId: string; productId: string; refreshTokens: number; consents: number }[]
  refreshTokens: number
  consents: number
}

/**
 * Refresh tokens e consentimentos dos clientes de produtos fechados (estado fora de released/public_beta ou sem
 * linha) para toda conta que NÃO passa em zro.release_allows(produto, conta, 'sso'). Contas listadas ficam intactas.
 */
export async function revokeClosedProductAccess(
  tx: Queryable,
  input: { reason: string; apply: boolean; productId?: string | null; actorUserId?: string | null },
): Promise<ReleaseRevokeReport> {
  if (!input.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  const productId = input.productId ?? null
  const clients = await tx`
    with fechados as (
      select c.id as client_id, c.product_id
      from zro.oauth_clients c left join zro.product_release r on r.product_id = c.product_id
      where c.product_id is not null and (r.product_id is null or r.state not in ('released', 'public_beta'))
        and (${productId}::text is null or c.product_id = ${productId})
    )
    select f.client_id, f.product_id,
      (select count(*) from zro.oauth_refresh_tokens t
        where t.client_id = f.client_id and t.revoked_at is null and not zro.release_allows(f.product_id, t.user_id, 'sso'))::int as refresh_tokens,
      (select count(*) from zro.oauth_consents k
        where k.client_id = f.client_id and k.revoked_at is null and not zro.release_allows(f.product_id, k.user_id, 'sso'))::int as consents
    from fechados f order by f.product_id, f.client_id`
  const report: ReleaseRevokeReport = {
    apply: input.apply,
    clients: clients.map((c) => ({
      clientId: c.client_id as string,
      productId: c.product_id as string,
      refreshTokens: c.refresh_tokens as number,
      consents: c.consents as number,
    })),
    refreshTokens: 0,
    consents: 0,
  }
  for (const c of report.clients) {
    report.refreshTokens += c.refreshTokens
    report.consents += c.consents
  }
  if (!input.apply) return report
  for (const c of report.clients) {
    if (!c.refreshTokens && !c.consents) continue
    await tx`update zro.oauth_refresh_tokens t set revoked_at = now()
             where t.client_id = ${c.clientId} and t.revoked_at is null and not zro.release_allows(${c.productId}, t.user_id, 'sso')`
    await tx`update zro.oauth_consents k set revoked_at = now()
             where k.client_id = ${c.clientId} and k.revoked_at is null and not zro.release_allows(${c.productId}, k.user_id, 'sso')`
    await audit(tx, {
      actorUserId: input.actorUserId ?? null,
      actorKind: input.actorUserId ? 'admin' : 'system',
      action: 'release.tokens_revoked',
      targetType: 'oauth_client',
      targetId: c.clientId,
      metadata: { product: c.productId, refreshTokens: c.refreshTokens, consents: c.consents, reason: input.reason.trim().slice(0, 500) },
    })
  }
  return report
}

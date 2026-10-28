/**
 * Gate de lançamento (ADR 0023): revoga refresh tokens e consentimentos dos clientes do login único dos produtos
 * FECHADOS para toda conta que não está em zro.product_release_access. Sessões emitidas antes do gate deixam de
 * renovar de qualquer jeito (o HUB confere a regra a cada pedido); isto só deixa o banco igual à regra e encerra os
 * access tokens de 10 min na hora.
 *
 *   DATABASE_URL=... npm run db:release:revoke -- --reason "gate de lançamento (ADR 0023)" [--product nossom] [--apply]
 *
 * Prévia por padrão: mostra quantos por cliente e não muda nada. Só --apply executa, e cada cliente ganha uma linha de
 * auditoria (release.tokens_revoked) com o motivo. Em produção, só com autorização do proprietário
 * (docs/operations/deployment-checklist.md).
 */
import { parseArgs } from 'node:util'
import { revokeClosedProductAccess } from '@zro/core'
import { createDatabase } from '@zro/db'

const { values } = parseArgs({
  options: {
    reason: { type: 'string' },
    apply: { type: 'boolean', default: false },
    product: { type: 'string' },
  },
})
if (!values.reason?.trim()) {
  console.error('Informe o motivo: --reason "..." (fica na auditoria).')
  process.exit(2)
}
if (values.product && !/^[a-z0-9-]{1,40}$/.test(values.product)) {
  console.error('--product: id do produto em zro.products (ex.: nossom).')
  process.exit(2)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}
const db = createDatabase(url, { max: 1, prepare: process.env.DATABASE_PREPARE !== 'false' })
try {
  const r = await db.asSystem(values.apply ? 'release: revogar sessões de produtos fechados' : 'release: prévia da revogação', (tx) =>
    revokeClosedProductAccess(tx, { reason: values.reason!, apply: !!values.apply, productId: values.product ?? null }),
  )
  if (!r.clients.length) console.log('Nenhum cliente de produto fechado cadastrado no login único.')
  for (const c of r.clients) console.log(`${c.productId} · ${c.clientId}: ${c.refreshTokens} refresh token(s), ${c.consents} consentimento(s)`)
  console.log(
    r.apply
      ? `Revogados: ${r.refreshTokens} refresh token(s) e ${r.consents} consentimento(s). Auditoria gravada.`
      : `Prévia: ${r.refreshTokens} refresh token(s) e ${r.consents} consentimento(s) seriam revogados. Nada mudou; rode com --apply para executar.`,
  )
} finally {
  await db.close()
}

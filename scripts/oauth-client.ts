/**
 * Cadastra (ou recadastra) um app confidencial da família no login único com um segredo gerado fora do HUB. O segredo
 * chega SÓ pela variável OAUTH_CLIENT_SECRET (nunca por argumento, nunca no repositório) e o banco guarda só o sha256;
 * o mesmo valor vai como ZRO_CLIENT_SECRET (sensível) no projeto Vercel do app.
 *
 *   OAUTH_CLIENT_SECRET=... DATABASE_URL=... npm run db:client:maestro            # prévia: confere e não grava
 *   OAUTH_CLIENT_SECRET=... DATABASE_URL=... npm run db:client:maestro -- --apply # grava e registra na auditoria
 *
 * Genérico: tsx scripts/oauth-client.ts --id <client_id> --name <nome> --product <produto> --redirect <https://…> [--trusted] [--apply]
 * Alternativa sem script: Administração › Login único no console (o HUB gera o segredo e mostra uma vez).
 */
import { parseArgs } from 'node:util'
import { upsertConfidentialClient } from '@zro/auth'
import { createDatabase } from '@zro/db'

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    product: { type: 'string' },
    redirect: { type: 'string', multiple: true },
    trusted: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    reason: { type: 'string', default: 'cadastro do app no login único' },
  },
})
const falta = (['id', 'name', 'product'] as const).filter((k) => !values[k]?.trim())
if (falta.length || !values.redirect?.length) {
  console.error(`Faltam: ${[...falta.map((k) => `--${k}`), ...(values.redirect?.length ? [] : ['--redirect'])].join(', ')}.`)
  process.exit(2)
}
const secret = process.env.OAUTH_CLIENT_SECRET?.trim() ?? ''
if (secret.length < 32) {
  console.error('Defina OAUTH_CLIENT_SECRET com pelo menos 32 caracteres (openssl rand -base64 48). Ele não vai para o banco, só o sha256.')
  process.exit(2)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}
const db = createDatabase(url, { max: 1, prepare: process.env.DATABASE_PREPARE !== 'false' })
try {
  const r = await db
    .asSystem(values.apply ? 'login único: cadastrar app' : 'login único: prévia do cadastro', async (tx) => {
      const out = await upsertConfidentialClient(tx, {
        id: values.id!.trim(),
        name: values.name!.trim(),
        productId: values.product!.trim(),
        redirectUris: values.redirect!,
        secret,
        trusted: !!values.trusted,
        reason: values.reason!,
      })
      if (!values.apply) throw Object.assign(new Error('prévia'), { preview: out })
      return out
    })
    .catch((e: unknown) => {
      if (e && typeof e === 'object' && 'preview' in e)
        return { ...(e as { preview: Awaited<ReturnType<typeof upsertConfidentialClient>> }).preview, preview: true }
      throw e
    })
  const como = 'preview' in r ? 'Prévia (nada gravado; rode com --apply):' : 'Gravado:'
  console.log(
    `${como} ${r.clientId} ${r.created ? 'novo' : 'atualizado'} · escopos ${r.scopes.join(' ')} · ${values.trusted ? 'da família (sem tela Permitir)' : 'pede consentimento'}`,
  )
} finally {
  await db.close()
}

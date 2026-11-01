/**
 * GET /marca/<produto>: o ícone de um app que ainda não lançou (revisão de 01/11/2026: app fechado não aparece em lugar
 * nenhum para o público). Os arquivos ficam fora de public/ (apps/hub-web/marca-fechada, servidos por
 * lib/marca-fechada.ts) e só saem para quem o produto existe (zro.release_visible: a administração da plataforma ou a
 * lista do titular). Qualquer outro pedido é 404, sem dizer se o app existe. `<ProductMark>` aponta para cá quando o
 * produto não tem ícone público.
 */
import { releaseVisibleFor } from '@zro/billing'
import { MARCA_FECHADA } from '@/lib/marca-fechada'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

const nada = () => new Response('Não encontrado', { status: 404, headers: { 'cache-control': 'no-store' } })

export async function GET(_req: Request, ctx: { params: Promise<{ produto: string }> }) {
  const { produto } = await ctx.params
  const svg = /^[a-z0-9-]{1,40}$/.test(produto) ? MARCA_FECHADA[produto] : undefined
  if (!svg) return nada()
  const auth = await getAuth()
  if (!auth) return nada()
  const visivel = await db().asSystem('site: marca de app fechado', (tx) => releaseVisibleFor(tx, auth.user.id))
  if (!visivel.has(produto)) return nada()
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // é de quem pode ver: nada de cache compartilhado
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

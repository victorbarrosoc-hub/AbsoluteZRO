import { ofertaAtual } from '@zro/billing'
import { route } from '@/lib/api'
import { appOrigin } from '@/lib/env'
import { stripeConfig } from '@/lib/stripe'

/**
 * A oferta à venda (ADR 0040), para os apps mostrarem o mesmo preço do HUB: Zero, Órbita, Absoluto, o Avulso de cada
 * app aberto ao público e as recargas da Z, mensal e anual. Sem dado de pessoa, cacheável (5 min). `vendas` diz se o
 * pagamento online está aberto; `assinar` é o endereço do HUB que leva ao checkout (a pessoa entra e confirma lá).
 */
export const GET = route(async ({ db }) => {
  const oferta = await db.asSystem('api: oferta', (tx) => ofertaAtual(tx))
  return Response.json(
    { vendas: stripeConfig() !== null, assinar: `${appOrigin}/perfil/plano#assinar`, ...oferta },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600', 'Access-Control-Allow-Origin': '*' } },
  )
})

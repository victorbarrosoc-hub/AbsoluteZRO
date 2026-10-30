import { destinatariosDeEntrega, ESCOPO_ENVIAR_ENTREGA } from '@zro/integrations'
import { route } from '@/lib/api'
import { paraApi } from '@/lib/set'

/**
 * GET `?destino=tpeasy`: para quem o app de origem pode mandar (Criação F8): a própria pessoa e quem da organização ativa
 * já usa o TPeasy. Só nome e foto (endereço inteiro); nunca e-mail. Exige o TPeasy no plano (403 sem ele).
 */
export const GET = route(async ({ db, auth, req }) => paraApi(await destinatariosDeEntrega(db, auth, new URL(req.url).searchParams.get('destino'))), {
  bearer: ESCOPO_ENVIAR_ENTREGA.maestro,
})

import { buscarSons, ESCOPO_SONS, sonsConfigDoAmbiente } from '@zro/core'
import { route } from '@/lib/api'

/** GET /api/v1/sons/buscar?q&pagina — efeitos sonoros livres para uso comercial (Openverse). Escopo zro.sons. */
export const GET = route(
  ({ auth, req }) => {
    const q = new URL(req.url).searchParams
    return buscarSons(sonsConfigDoAmbiente(), auth, { q: q.get('q'), pagina: q.get('pagina') })
  },
  { bearer: ESCOPO_SONS },
)

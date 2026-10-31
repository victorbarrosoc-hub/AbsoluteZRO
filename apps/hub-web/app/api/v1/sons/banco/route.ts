import { bancoConfigDoAmbiente, ESCOPO_SONS, listarBanco } from '@zro/core'
import { route } from '@/lib/api'

/** GET /api/v1/sons/banco?pasta&q&pagina&conta — uma página da pasta do Drive com os sons da pessoa (pelo SOBEDESCE). Escopo zro.sons. */
export const GET = route(
  ({ db, auth, req }) => {
    const q = new URL(req.url).searchParams
    return listarBanco(db, auth, { pasta: q.get('pasta'), q: q.get('q'), pagina: q.get('pagina'), conta: q.get('conta') }, bancoConfigDoAmbiente())
  },
  { bearer: ESCOPO_SONS },
)

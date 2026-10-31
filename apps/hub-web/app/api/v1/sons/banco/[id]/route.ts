import { baixarDoBanco, bancoConfigDoAmbiente, ESCOPO_SONS } from '@zro/core'
import { route } from '@/lib/api'

/** GET /api/v1/sons/banco/{id}?conta — o arquivo de um som do banco da pessoa no Drive (só áudio, até 25 MB). Escopo zro.sons. */
export const GET = route<{ id: string }>(
  ({ db, auth, req }, { id }) => baixarDoBanco(db, auth, id, { conta: new URL(req.url).searchParams.get('conta') }, bancoConfigDoAmbiente()),
  { bearer: ESCOPO_SONS },
)

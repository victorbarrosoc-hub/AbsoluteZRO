import { publicarVersao } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/**
 * "Publicar para os clientes": só com a trava `publicar_config` ligada, `{"confirmar": "publicar"}` e auditoria. Com a
 * trava desligada, responde 403 e nada muda.
 */
export const POST = route<{ numero: string }>(
  async ({ db, auth, req }, { numero }) => json(await publicarVersao(db, auth, numero, await readJson(req, 2_000))),
  {
    mutation: true,
  },
)

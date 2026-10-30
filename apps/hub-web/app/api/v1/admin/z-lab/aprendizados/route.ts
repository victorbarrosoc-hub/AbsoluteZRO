import { adminDoLab, guardarAprendizado } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/**
 * "Guardar" do cartão de aprendizado (Laboratório da Z): só com `confirmar: true`. Entra no rascunho (o Testar usa no
 * próximo turno); os clientes só recebem numa versão salva e publicada. Auditado.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    adminDoLab(auth)
    return json(await guardarAprendizado(db, auth, await readJson(req, 20_000)), 201)
  },
  { mutation: true },
)

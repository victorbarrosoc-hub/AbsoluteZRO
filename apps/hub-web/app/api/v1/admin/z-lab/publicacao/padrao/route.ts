import { despublicar } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/** Volta a Z dos clientes para o padrão do código (`{"confirmar": "padrao"}`, auditado). */
export const POST = route(
  async ({ db, auth, req }) => {
    await despublicar(db, auth, await readJson(req, 2_000))
    return json({ ok: true })
  },
  { mutation: true },
)

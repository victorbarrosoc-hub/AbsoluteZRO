import { mudarRecurso } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/**
 * Liga ou desliga um recurso novo da Z para os clientes, por plano (`voz`, `ditado`, `anexos`, `publicar_config`).
 * Pede `{"confirmar": true}` e fica na auditoria. Tudo nasce desligado.
 */
export const PUT = route<{ recurso: string }>(
  async ({ db, auth, req }, { recurso }) => json({ recurso: await mudarRecurso(db, auth, recurso, await readJson(req, 8_000)) }),
  { mutation: true },
)

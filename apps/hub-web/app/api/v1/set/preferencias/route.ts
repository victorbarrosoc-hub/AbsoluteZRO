import { ESCOPO_SET, salvarPreferenciasSet, type QuemVe } from '@zro/core'
import { route } from '@/lib/api'
import { corpo } from '@/lib/set'

/** PUT /api/v1/set/preferencias { invisivel?, quemVe?, mostrarVisto? } — invisível apaga a presença na hora. */
export const PUT = route(
  async ({ db, auth, req }) => {
    const b = await corpo(req)
    return {
      preferencias: await salvarPreferenciasSet(db, auth, {
        invisivel: typeof b.invisivel === 'boolean' ? b.invisivel : undefined,
        quemVe: typeof b.quemVe === 'string' ? (b.quemVe as QuemVe) : undefined,
        mostrarVisto: typeof b.mostrarVisto === 'boolean' ? b.mostrarVisto : undefined,
      }),
    }
  },
  { bearer: ESCOPO_SET, mutation: true },
)

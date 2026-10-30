import { restaurarVersao } from '@zro/core'
import { json, route } from '@/lib/api'
import { iaModelo } from '@/lib/ia/modelo'

/** "Restaurar": a versão volta para o rascunho. A versão continua igual e nada é apagado. */
export const POST = route<{ numero: string }>(async ({ db, auth }, { numero }) => json({ rascunho: await restaurarVersao(db, auth, numero, iaModelo()) }), {
  mutation: true,
})

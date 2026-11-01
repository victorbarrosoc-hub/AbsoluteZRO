import { baixarSomZro, ESCOPO_SONS } from '@zro/core'
import { route } from '@/lib/api'

/** GET /api/v1/sons/zro/{id} — o arquivo de uma versão de um som da Absolute ZRO. Escopo zro.sons. */
export const GET = route<{ id: string }>(({ db, auth }, { id }) => baixarSomZro(db, auth, id), { bearer: ESCOPO_SONS })

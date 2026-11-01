import { ESCOPO_SONS, listarSonsZro } from '@zro/core'
import { route } from '@/lib/api'

/** GET /api/v1/sons/zro — os sons originais da Absolute ZRO: categorias e cada som com as versões (sem o áudio). Escopo zro.sons. */
export const GET = route(({ db, auth }) => listarSonsZro(db, auth), { bearer: ESCOPO_SONS })

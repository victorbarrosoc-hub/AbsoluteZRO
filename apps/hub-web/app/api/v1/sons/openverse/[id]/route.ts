import { baixarSom, ESCOPO_SONS, sonsConfigDoAmbiente } from '@zro/core'
import { route } from '@/lib/api'

/** GET /api/v1/sons/openverse/{id} — o arquivo do som (só fontes e licenças aceitas, até 25 MB). Escopo zro.sons. */
export const GET = route<{ id: string }>(({ auth }, { id }) => baixarSom(sonsConfigDoAmbiente(), auth, id), { bearer: ESCOPO_SONS })

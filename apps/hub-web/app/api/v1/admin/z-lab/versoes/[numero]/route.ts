import { configDaVersao } from '@zro/core'
import { json, route } from '@/lib/api'
import { iaModelo } from '@/lib/ia/modelo'

/** A configuração de uma versão salva (para comparar com o rascunho). */
export const GET = route<{ numero: string }>(async ({ db, auth }, { numero }) => json({ config: await configDaVersao(db, auth, numero, iaModelo()) }))

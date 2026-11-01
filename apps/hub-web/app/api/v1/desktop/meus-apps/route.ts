import { route } from '@/lib/api'
import { meusApps } from '@/lib/meus-apps'

/**
 * Os apps de computador desta conta (a central "Absolute ZRO" lê daqui, com a sessão dela; ADR 0036): só o que a conta
 * pode instalar, com a versão mais nova, o tamanho e o SHA-256 de cada arquivo, e o que o plano não inclui (bloqueado,
 * com o plano que inclui). Gate de lançamento, organização ativa e entitlement conferidos no servidor (authorize).
 * Sem sessão: 401, e a central pede para entrar.
 */
export const dynamic = 'force-dynamic'

export const GET = route(async ({ db, auth }) => meusApps(db, auth))

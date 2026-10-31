import 'server-only'
/**
 * Console › Apps › SOBEDESCE: o pedido ao SOBEDESCE é assinado com `iss` = a origem pública do HUB. Fora das rotas do
 * login (lib/oidc, lib/api), o emissor só é definido se este módulo for carregado: sem ele, o pedido sairia como
 * localhost e o SOBEDESCE recusaria (401). Página e ação do console usam só daqui.
 */
import { lerAcessoDrive, mudarAcessoDrive } from '@zro/core'
import { createLogger } from '@zro/observability'
import './oidc'

const log = createLogger('sobedesce-console')

export async function lerDriveDoSobedesce(...a: Parameters<typeof lerAcessoDrive>) {
  try {
    return await lerAcessoDrive(...a)
  } catch (e) {
    log.warn('sobedesce.console_falhou', { erro: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

export const mudarDriveDoSobedesce = (...a: Parameters<typeof mudarAcessoDrive>) => mudarAcessoDrive(...a)

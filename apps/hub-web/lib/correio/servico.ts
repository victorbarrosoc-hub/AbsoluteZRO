/** O que as rotas do Correio dividem: a configuração do ambiente, exigida na hora. */
import { DomainError } from '@zro/observability'
import { configDoCorreio, type ConfigCorreio } from './config'

export function exigirConfig(env: Record<string, string | undefined> = process.env): ConfigCorreio {
  const { config, faltam } = configDoCorreio(env)
  if (!config) throw new DomainError('upstream_unavailable', 'Correio não configurado.', { faltam })
  return config
}

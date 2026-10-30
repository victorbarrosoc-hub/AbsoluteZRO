// Banco do Relay (schema `relay` no Supabase da Absolute ZRO, db/migrations/). Uma porta só para as rotas da pessoa:
// `comoPessoa` abre a transação, informa quem é (sub da Absolute ZRO) e a organização ativa, e assume o papel
// `relay_app`, que não é dono das tabelas: o RLS vale sempre, mesmo se a checagem da rota falhar.
// Sem RELAY_DATABASE_URL (papel dono, pooler de transação), a nuvem fica desligada e o painel segue no aparelho.

import postgres from 'postgres'

export const PAPEL_APP = 'relay_app'
export const urlDoBanco = () => (process.env.RELAY_DATABASE_URL || '').trim()
export const nuvemLigada = () => /^postgres(ql)?:\/\//.test(urlDoBanco())

const g = globalThis
/** Conexão do processo (uma por função quente). Pooler em modo transação: sem prepared statements. */
export function banco() {
  const url = urlDoBanco()
  if (g.__relayBanco?.url === url) return g.__relayBanco.sql
  g.__relayBanco = { url, sql: postgres(url, { max: Number(process.env.RELAY_DATABASE_POOL_MAX) || 2, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} }) }
  return g.__relayBanco.sql
}

/** Fecha a conexão do processo (testes). */
export async function fecharBanco() {
  const b = g.__relayBanco
  g.__relayBanco = undefined
  await b?.sql.end({ timeout: 5 })
}

/** Roda `fn(tx)` como a pessoa: { sub, org } vêm da sessão do Relay (rl_conta), nunca do pedido. */
export async function comoPessoa({ sub, org = null }, fn) {
  if (typeof sub !== 'string' || !sub || sub.length > 200) throw new Error('comoPessoa: sub inválido')
  if (org != null && (typeof org !== 'string' || org.length > 100)) throw new Error('comoPessoa: org inválida')
  return banco().begin(async (tx) => {
    await tx`select set_config('relay.user_sub', ${sub}, true), set_config('relay.org_id', ${org ?? ''}, true)`
    await tx.unsafe(`set local role ${PAPEL_APP}`)
    return fn(tx)
  })
}

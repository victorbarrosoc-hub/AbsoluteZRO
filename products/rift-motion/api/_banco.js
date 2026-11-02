// Banco do Rift (schema `rift` no Supabase da Absolute ZRO, db/migrations/). Uma porta só para as rotas da pessoa:
// `comoPessoa` abre a transação, informa quem é (sub da Absolute ZRO) e a organização ativa, e assume o papel
// `rift_app`, que não é dono das tabelas: o RLS vale sempre, mesmo se a checagem da rota falhar.
// Sem RIFT_DATABASE_URL (papel dono `rift`, pooler de transação), a nuvem fica desligada e o painel segue no aparelho.

import postgres from 'postgres'

export const PAPEL_APP = 'rift_app'
export const urlDoBanco = () => (process.env.RIFT_DATABASE_URL || '').trim()
export const nuvemLigada = () => /^postgres(ql)?:\/\//.test(urlDoBanco())

const g = globalThis
/** Conexão do processo (uma por função quente). Pooler em modo transação: sem prepared statements. */
export function banco() {
  const url = urlDoBanco()
  if (g.__riftBanco?.url === url) return g.__riftBanco.sql
  g.__riftBanco = { url, sql: postgres(url, { max: Number(process.env.RIFT_DATABASE_POOL_MAX) || 2, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} }) }
  return g.__riftBanco.sql
}

/** Fecha a conexão do processo (testes). */
export async function fecharBanco() {
  const b = g.__riftBanco
  g.__riftBanco = undefined
  await b?.sql.end({ timeout: 5 })
}

/** Roda `fn(tx)` como a pessoa: { sub, org } vêm da sessão do Rift (rf_conta), nunca do pedido. */
export async function comoPessoa({ sub, org = null }, fn) {
  if (typeof sub !== 'string' || !sub || sub.length > 200) throw new Error('comoPessoa: sub inválido')
  if (org != null && (typeof org !== 'string' || org.length > 100)) throw new Error('comoPessoa: org inválida')
  return banco().begin(async (tx) => {
    await tx`select set_config('rift.user_sub', ${sub}, true), set_config('rift.org_id', ${org ?? ''}, true)`
    await tx.unsafe(`set local role ${PAPEL_APP}`)
    return fn(tx)
  })
}

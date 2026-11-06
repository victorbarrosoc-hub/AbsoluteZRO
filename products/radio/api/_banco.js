// Banco do rádio (schema `radio` no Supabase da Absolute ZRO, db/migrations/). Uma porta só para as rotas da pessoa:
// `comoPessoa` abre a transação, informa quem é (sub da Absolute ZRO) e assume o papel `radio_app`, que não é dono das
// tabelas: o RLS vale sempre, mesmo se a checagem da rota falhar.
// Sem RADIO_DATABASE_URL (papel dono `radio`, pooler de transação), as rotas respondem 503.

import postgres from 'postgres'

export const PAPEL_APP = 'radio_app'
export const urlDoBanco = () => (process.env.RADIO_DATABASE_URL || '').trim()
export const nuvemLigada = () => /^postgres(ql)?:\/\//.test(urlDoBanco())

const g = globalThis
/** Conexão do processo (uma por função quente). Pooler em modo transação: sem prepared statements. */
export function banco() {
  const url = urlDoBanco()
  if (g.__radioBanco?.url === url) return g.__radioBanco.sql
  g.__radioBanco = { url, sql: postgres(url, { max: Number(process.env.RADIO_DATABASE_POOL_MAX) || 2, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} }) }
  return g.__radioBanco.sql
}

/** Fecha a conexão do processo (testes). */
export async function fecharBanco() {
  const b = g.__radioBanco
  g.__radioBanco = undefined
  await b?.sql.end({ timeout: 5 })
}

/** Roda `fn(tx)` como a pessoa: o sub vem da sessão (api/_sessao.js), nunca do pedido. */
export async function comoPessoa({ sub }, fn) {
  if (typeof sub !== 'string' || !sub || sub.length > 200) throw new Error('comoPessoa: sub inválido')
  return banco().begin(async (tx) => {
    await tx`select set_config('radio.user_sub', ${sub}, true)`
    await tx.unsafe(`set local role ${PAPEL_APP}`)
    return fn(tx)
  })
}

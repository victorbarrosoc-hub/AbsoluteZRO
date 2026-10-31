// Migrador do schema `relay` (db/migrations/*.sql, em ordem). Cada arquivo roda numa transação e fica registrado em
// relay.migracoes com o sha256: arquivo já aplicado que mudou é recusado (migração nova = arquivo novo).
// `RELAY_DATABASE_URL=… node scripts/migrar.mjs` com o papel dono do schema (no Supabase: `relay`).

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

export const PASTA = fileURLToPath(new URL('../db/migrations/', import.meta.url))

export function migracoes(pasta = PASTA) {
  return readdirSync(pasta)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((nome) => {
      const sql = readFileSync(join(pasta, nome), 'utf8')
      return { nome, sql, sha: createHash('sha256').update(sql).digest('hex') }
    })
}

/** Aplica o que falta. Devolve os nomes aplicados agora. */
export async function migrar(url, { pasta = PASTA, log = () => {} } = {}) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
  const feitas = []
  try {
    // no Supabase o schema nasce com o administrador (authorization relay); `create schema if not exists` pediria
    // permissão de criar no banco inteiro mesmo com ele já existindo
    if (!(await sql`select 1 from pg_namespace where nspname = 'relay'`).length) await sql`create schema relay`
    await sql`create table if not exists relay.migracoes (nome text primary key, sha text not null, aplicada timestamptz not null default now())`
    const aplicadas = new Map((await sql`select nome, sha from relay.migracoes`).map((r) => [r.nome, r.sha]))
    for (const m of migracoes(pasta)) {
      const antes = aplicadas.get(m.nome)
      if (antes && antes !== m.sha) throw new Error(`${m.nome} já foi aplicada e mudou: crie um arquivo novo`)
      if (antes) continue
      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql)
        await tx`insert into relay.migracoes (nome, sha) values (${m.nome}, ${m.sha})`
      })
      feitas.push(m.nome)
      log(`aplicada ${m.nome}`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
  return feitas
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const url = process.env.RELAY_DATABASE_URL
  if (!url) {
    console.error('Falta RELAY_DATABASE_URL (papel dono do schema relay).')
    process.exit(1)
  }
  const feitas = await migrar(url, { log: console.log })
  console.log(feitas.length ? `${feitas.length} migração(ões) aplicada(s)` : 'nada a aplicar')
}

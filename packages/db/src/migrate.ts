/**
 * Aplica infra/migrations/*.sql em ordem, uma vez cada, no banco NOVO do HUB.
 * Cada arquivo roda numa transação; o checksum impede editar uma migration já aplicada.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sql } from './index'

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../infra/migrations')

export type MigrationResult = { applied: string[]; skipped: string[] }

export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
  const result: MigrationResult = { applied: [], skipped: [] }
  await sql.unsafe(`create schema if not exists zro;
    create table if not exists zro.schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`)
  await sql`select pg_advisory_lock(hashtext('zro-hub-migrations'))`
  try {
    for (const file of files) {
      const body = fs.readFileSync(path.join(dir, file), 'utf8')
      const checksum = createHash('sha256').update(body).digest('hex')
      const [done] = await sql`select checksum from zro.schema_migrations where name = ${file}`
      if (done) {
        if (done.checksum !== checksum) throw new Error(`A migration ${file} já aplicada foi alterada. Crie uma nova migration.`)
        result.skipped.push(file)
        continue
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body)
        await tx`insert into zro.schema_migrations (name, checksum) values (${file}, ${checksum})`
      })
      result.applied.push(file)
    }
  } finally {
    await sql`select pg_advisory_unlock(hashtext('zro-hub-migrations'))`
  }
  return result
}

/** Banco descartável para testes de integração: cria, migra e devolve a conexão. */
import { createDatabase, type Database } from './index'
import { migrate } from './migrate'
import postgres from 'postgres'

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_test'

/** Recria o banco de teste do zero (só aceita nomes que terminam em _test). */
export async function resetTestDatabase(url = TEST_DATABASE_URL): Promise<void> {
  const u = new URL(url)
  const name = u.pathname.slice(1)
  if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error(`Recuso recriar "${name}": o banco de teste precisa terminar em _test.`)
  u.pathname = '/postgres'
  const admin = postgres(u.toString(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`drop database if exists ${name} with (force)`)
    await admin.unsafe(`create database ${name}`)
  } finally {
    await admin.end()
  }
  const db = createDatabase(url, { max: 1 })
  try {
    await migrate(db.sql)
  } finally {
    await db.close()
  }
}

export function testDatabase(): Database {
  return createDatabase(TEST_DATABASE_URL, { max: 5 })
}

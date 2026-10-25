import { describe, expect, it } from 'vitest'
import { normalizeDatabaseUrl } from '../src/index'

describe('normalizeDatabaseUrl', () => {
  it('tira parâmetros que o pooler recusa e mantém sslmode', () => {
    const u = new URL(
      normalizeDatabaseUrl('postgres://u:p@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x&pgbouncer=true'),
    )
    expect([...u.searchParams.entries()]).toEqual([['sslmode', 'require']])
    expect(u.port).toBe('6543')
    expect(u.username).toBe('u')
  })

  it('exige TLS em banco remoto sem sslmode', () => {
    expect(new URL(normalizeDatabaseUrl('postgres://u:p@db.exemplo.supabase.co:5432/postgres')).searchParams.get('sslmode')).toBe('require')
  })

  it('não mexe no banco local', () => {
    expect(normalizeDatabaseUrl('postgres://postgres:postgres@localhost:5432/zro_dev')).toBe('postgres://postgres:postgres@localhost:5432/zro_dev')
  })
})

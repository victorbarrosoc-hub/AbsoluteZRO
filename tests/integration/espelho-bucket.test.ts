// 0060: o bucket `apps` do espelho (ADR 0043). No banco de teste não há Supabase Storage: a migração não faz nada (já
// rodou no global-setup). Aqui um `storage.buckets` e um `storage.objects` mínimos, com o RLS ligado como no Supabase,
// para conferir o que ela grava: público para ler, 1 GB, só dmg/exe/json, idempotente e NENHUMA policy (anon e
// authenticated não gravam; só as chaves S3 do GitHub Actions, que passam por cima do RLS).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'

const SQL = readFileSync(path.resolve(__dirname, '../../infra/migrations/0060_espelho_dos_apps.sql'), 'utf8')

let db: Database

beforeAll(async () => {
  db = testDatabase()
})
afterAll(async () => {
  await db.sql.unsafe('drop schema if exists storage cascade')
  await db.close()
})

describe('0060 · bucket apps do espelho', () => {
  it('sem Supabase Storage: não faz nada e não falha', async () => {
    await db.sql.unsafe('drop schema if exists storage cascade')
    await db.sql.unsafe(SQL)
    const [r] = await db.sql`select to_regclass('storage.buckets') is null as sem`
    expect(r!.sem).toBe(true)
  })

  it('com Storage: bucket público, 1 GB, só instaladores e versao.json, sem policy; rodar de novo corrige e não duplica', async () => {
    await db.sql.unsafe(`create schema storage;
      create table storage.buckets (id text primary key, name text not null, owner uuid, public boolean default false,
        file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
      alter table storage.objects enable row level security;`)
    await db.sql.unsafe(SQL)
    // alguém mexeu no painel: a migração de novo volta para os valores certos
    await db.sql`update storage.buckets set public = false, file_size_limit = 10 where id = 'apps'`
    await db.sql.unsafe(SQL)
    const linhas = await db.sql`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets`
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ id: 'apps', name: 'apps', public: true, file_size_limit: '1073741824' })
    expect([...(linhas[0]!.allowed_mime_types as string[])].sort()).toEqual(
      [
        'application/json',
        'application/octet-stream',
        'application/vnd.microsoft.portable-executable',
        'application/x-apple-diskimage',
        'application/x-msdownload',
      ].sort(),
    )
    const policies = await db.sql`select policyname from pg_policies where schemaname = 'storage'`
    expect(policies).toEqual([])
    // e o arquivo da migração não abre escrita para ninguém
    expect(SQL).not.toMatch(/create\s+policy|grant\s+(insert|update|delete|all)/i)
  })
})

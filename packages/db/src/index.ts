/**
 * Acesso ao banco NOVO do HUB. Duas portas, e só duas:
 *
 * - `asUser(ctx, fn)`: toda operação de usuário. Abre a transação, informa usuário e organização ativa
 *   (set_config local) e assume o papel `zro_app`, que não é dono das tabelas: o RLS de
 *   infra/migrations/0002_rls.sql vale sempre, mesmo se a checagem do servidor falhar.
 * - `asSystem(motivo, fn)`: autenticação, webhooks assinados, worker e console de administração depois da
 *   checagem de papel de plataforma. Roda como dono (sem RLS); o motivo vai para o log.
 */
import postgres from 'postgres'

export type Sql = postgres.Sql<Record<string, unknown>>
export type Tx = postgres.TransactionSql<Record<string, unknown>>
/** Qualquer coisa que execute SQL: a conexão ou uma transação aberta. */
export type Queryable = Sql | Tx

export type UserContext = {
  userId: string
  /** Organização ativa já validada pelo servidor (vínculo ativo). null antes do onboarding. */
  orgId: string | null
}

export type Database = {
  sql: Sql
  asUser<T>(ctx: UserContext, fn: (tx: Tx) => Promise<T>): Promise<T>
  asSystem<T>(reason: string, fn: (tx: Tx) => Promise<T>): Promise<T>
  close(): Promise<void>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createDatabase(
  url: string,
  options: { max?: number; prepare?: boolean; onSystem?: (reason: string) => void } = {},
): Database {
  const sql = postgres(url, {
    max: options.max ?? 10,
    // Pooler em modo transação (Supabase) não aceita prepared statements nomeados.
    prepare: options.prepare ?? true,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  }) as unknown as Sql

  async function asUser<R>(ctx: UserContext, fn: (tx: Tx) => Promise<R>): Promise<R> {
    if (!UUID.test(ctx.userId)) throw new Error('asUser: userId inválido')
    if (ctx.orgId !== null && !UUID.test(ctx.orgId)) throw new Error('asUser: orgId inválido')
    return (await sql.begin(async (tx) => {
      await tx`select set_config('zro.user_id', ${ctx.userId}, true), set_config('zro.org_id', ${ctx.orgId ?? ''}, true)`
      await tx.unsafe('set local role zro_app')
      return fn(tx as Tx)
    })) as R
  }

  async function asSystem<R>(reason: string, fn: (tx: Tx) => Promise<R>): Promise<R> {
    options.onSystem?.(reason)
    return (await sql.begin((tx) => fn(tx as Tx))) as R
  }

  return { sql, asUser, asSystem, close: () => sql.end({ timeout: 5 }) }
}

let shared: Database | null = null

/** Conexão compartilhada do processo (Next.js e worker). Exige DATABASE_URL. */
export function getDatabase(): Database {
  if (shared) return shared
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não configurada. Veja .env.example e README.md.')
  const g = globalThis as unknown as { __zroDb?: Database }
  g.__zroDb ??= createDatabase(url, {
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    prepare: process.env.DATABASE_PREPARE !== 'false',
  })
  shared = g.__zroDb
  return shared
}

/** Erros do Postgres que o domínio trata (violação de unicidade, RLS, checagem). */
export function pgErrorCode(err: unknown): string | null {
  return typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : null
}

export const PG = {
  uniqueViolation: '23505',
  checkViolation: '23514',
  foreignKeyViolation: '23503',
  insufficientPrivilege: '42501',
  rlsViolation: '42501',
} as const

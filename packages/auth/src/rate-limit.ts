/**
 * Limite de tentativas por chave numa janela (tabela rate_limit_attempts, só o sistema acessa).
 * Mesmo desenho do SOBEDESCE (web/src/lib/auth/limite.ts): login por e-mail+IP, por conta e por IP.
 */
import type { Queryable } from '@zro/db'

export type Rule = { max: number; windowMs: number }

export const RULES = {
  loginEmail: { max: 8, windowMs: 15 * 60_000 },
  loginIp: { max: 40, windowMs: 15 * 60_000 },
  loginAccount: { max: 30, windowMs: 60 * 60_000 },
  signupIp: { max: 10, windowMs: 60 * 60_000 },
  resetEmail: { max: 3, windowMs: 60 * 60_000 },
  emailChange: { max: 5, windowMs: 60 * 60_000 },
  inviteAccept: { max: 20, windowMs: 15 * 60_000 },
  accountDelete: { max: 5, windowMs: 60 * 60_000 },
} satisfies Record<string, Rule>

export async function withinLimit(tx: Queryable, key: string, rule: Rule): Promise<boolean> {
  const since = new Date(Date.now() - rule.windowMs)
  const [row] = await tx`select count(*)::int as n from zro.rate_limit_attempts where key = ${key} and at >= ${since}`
  return ((row?.n as number) ?? 0) < rule.max
}

export async function registerAttempt(tx: Queryable, ...keys: string[]): Promise<void> {
  if (!keys.length) return
  await tx`insert into zro.rate_limit_attempts ${tx(keys.map((key) => ({ key })))}`
  if (Math.random() < 0.02) await tx`delete from zro.rate_limit_attempts where at < now() - interval '1 day'`
}

export async function clearAttempts(tx: Queryable, key: string): Promise<void> {
  await tx`delete from zro.rate_limit_attempts where key = ${key}`
}

export const LIMIT_MESSAGE = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'

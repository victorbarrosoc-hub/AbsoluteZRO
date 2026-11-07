import 'server-only'
import type { Authenticated } from '@zro/auth'
import { authorize, type Actor } from '@zro/core'
import type { Database, Tx } from '@zro/db'
import { isDomainError } from '@zro/observability'
import { nomeLimpo } from './nucleo'

/**
 * O RADION dentro do HUB (ADR 0042; titular, 05/11/2026: "usa o do ecossistema"): absolutezro.com/radio, com a
 * conta e o banco do HUB. As regras moram em products/radio/api/_nucleo.js (cópia em ./nucleo.ts) e os dados no schema
 * `radio` (um schema por app, nunca dentro de `zro`). Não lançado: só passa quem o gate deixa (admin da plataforma ou
 * a lista de acesso), pelo authorize() na ordem do PRD §5.2.
 */
export const PRODUTO_RADIO = 'radio'

/** A pessoa passa no gate do rádio? Devolve o ator (sessão, organização ativa, lançamento) ou null. */
export async function acessoAoRadio(db: Database, auth: Authenticated | null): Promise<Actor | null> {
  try {
    return await authorize(db, auth, { release: { productId: PRODUTO_RADIO, channel: 'web' } })
  } catch (e) {
    if (isDomainError(e)) return null
    throw e
  }
}

/** Quem fala no rádio: o id da conta (o `sub` do login único) e o nome de exibição. */
export function pessoaDoRadio(actor: Actor): { sub: string; nome: string } {
  const u = actor.auth.user
  return { sub: actor.userId, nome: nomeLimpo(u.displayName) || nomeLimpo(u.email.split('@')[0]) || 'Pessoa' }
}

/**
 * Roda `fn` como a pessoa no banco do rádio: transação própria, radio.user_sub = a conta e o papel `radio_app` (sem
 * login, não é dono, sem BYPASSRLS): o RLS do schema `radio` vale sempre. O papel do HUB só assume, nunca lê como dono.
 */
export async function noRadio<T>(db: Database, sub: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.sql.begin(async (tx) => {
    await tx`select set_config('radio.user_sub', ${sub}, true)`
    await tx.unsafe('set local role radio_app')
    return fn(tx as unknown as Tx)
  }) as Promise<T>
}

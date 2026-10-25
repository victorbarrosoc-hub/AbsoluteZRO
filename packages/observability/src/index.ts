/**
 * Logs estruturados com dados pessoais minimizados e trilha de auditoria (PRD §5.2, §9.3).
 * O log nunca leva e-mail, token, cookie, senha nem IP em claro.
 */
import { createHmac } from 'node:crypto'
import type { Queryable } from '@zro/db'

type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const SENSITIVE_KEY = /pass(word)?|senha|token|secret|cookie|authorization|signature|email|e-mail|ip$|^ip|phone|telefone/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi

/** Remove o que é pessoal ou secreto antes de qualquer saída. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[profundo]'
  if (typeof value === 'string') return value.replace(EMAIL, '[e-mail]').replace(BEARER, '$1[token]')
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) }
  if (value && typeof value === 'object') {
    const out: Fields = {}
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[omitido]' : redact(v, depth + 1)
    return out
  }
  return value
}

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger(scope: string, sink: (line: string) => void = (l) => process.stdout.write(l + '\n')) {
  const min = ORDER[(process.env.LOG_LEVEL as Level) || 'info'] ?? ORDER.info
  const write = (level: Level, event: string, fields: Fields = {}) => {
    if (ORDER[level] < min) return
    sink(JSON.stringify({ t: new Date().toISOString(), level, scope, event, ...(redact(fields) as Fields) }))
  }
  return {
    debug: (event: string, fields?: Fields) => write('debug', event, fields),
    info: (event: string, fields?: Fields) => write('info', event, fields),
    warn: (event: string, fields?: Fields) => write('warn', event, fields),
    error: (event: string, fields?: Fields) => write('error', event, fields),
  }
}
export type Logger = ReturnType<typeof createLogger>

/** IP vira um identificador estável e não reversível (HMAC com segredo do servidor). */
export function hashIp(ip: string | null | undefined, secret = process.env.ZRO_IP_HASH_SECRET || ''): string | null {
  if (!ip) return null
  if (!secret) return null // sem segredo configurado, não guarda nada
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32)
}

export type AuditEntry = {
  orgId?: string | null
  actorUserId?: string | null
  actorKind?: 'user' | 'system' | 'provider' | 'admin'
  action: string
  targetType?: string | null
  targetId?: string | null
  ipHash?: string | null
  metadata?: Fields
}

/**
 * Grava na auditoria dentro da transação em curso. Em `asUser` a política exige actor = a própria pessoa;
 * em `asSystem` vale qualquer ator (webhook, worker, console).
 */
export async function audit(tx: Queryable, e: AuditEntry): Promise<void> {
  const metadata = (redact(e.metadata ?? {}) as Fields) ?? {}
  await tx`
    insert into zro.audit_logs (org_id, actor_user_id, actor_kind, action, target_type, target_id, ip_hash, metadata)
    values (${e.orgId ?? null}, ${e.actorUserId ?? null}, ${e.actorKind ?? 'user'}, ${e.action},
            ${e.targetType ?? null}, ${e.targetId ?? null}, ${e.ipHash ?? null}, ${tx.json(metadata as never)})`
}

export { DomainError, isDomainError, type ErrorCode } from './errors'

/** Identificadores e tokens aleatórios. O banco guarda só o sha256 dos tokens. */
import { createHash, randomBytes } from 'node:crypto'

/** Token opaco: 32 bytes em base64url (43 caracteres), com prefixo de finalidade. */
export function newToken(prefix: 'zs' | 'zv' | 'zr' | 'zi'): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export const TOKEN_FORMAT = {
  session: /^zs_[A-Za-z0-9_-]{43}$/,
  verify: /^zv_[A-Za-z0-9_-]{43}$/,
  reset: /^zr_[A-Za-z0-9_-]{43}$/,
  invite: /^zi_[A-Za-z0-9_-]{43}$/,
} as const

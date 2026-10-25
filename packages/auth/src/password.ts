/**
 * Senhas com scrypt (node:crypto), sal aleatório por senha. Formato guardado: scrypt$N$r$p$sal$hash.
 * Replicado de SOBEDESCE web/src/lib/auth/senha.ts (commit 21f3a63, ver products/sobedesce/SOURCE_MANIFEST.md).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const N = 32768
const R = 8
const P = 1
const KEYLEN = 64

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 }
  return new Promise((ok, fail) => scryptCb(password.normalize('NFKC'), salt, KEYLEN, opts, (e, key) => (e ? fail(e) : ok(key))))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, N, R, P)
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$')
}

/** Confere em tempo constante. Formato desconhecido: false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [n, r, p] = parts.slice(1, 4).map(Number) as [number, number, number]
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0) || n > 1 << 20 || r > 32 || p > 16) return false
  const salt = Buffer.from(parts[4]!, 'base64url')
  const expected = Buffer.from(parts[5]!, 'base64url')
  if (expected.length !== KEYLEN) return false
  const actual = await scrypt(password, salt, n, r, p)
  return timingSafeEqual(actual, expected)
}

/** Hash de uma senha que não existe: login com e-mail desconhecido gasta o mesmo tempo. */
let decoy: Promise<string> | null = null
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(16).toString('base64url'))
  return decoy
}

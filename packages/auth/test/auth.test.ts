import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testDatabase } from '@zro/db/testing'
import type { Database } from '@zro/db'
import { authenticate, changePassword, hashPassword, requestPasswordReset, resetPassword, revokeSessionByToken, signIn, signUp, verifyEmail, verifyPassword } from '../src/index'
import { expectCode } from '../../../tests/integration/helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const email = () => `conta-${Math.random().toString(36).slice(2, 10)}@teste.absolutezro.local`

describe('senha', () => {
  it('scrypt confere e recusa', async () => {
    const h = await hashPassword('uma senha longa')
    expect(h.startsWith('scrypt$32768$8$1$')).toBe(true)
    expect(await verifyPassword('uma senha longa', h)).toBe(true)
    expect(await verifyPassword('outra senha', h)).toBe(false)
    expect(await verifyPassword('x', 'md5$abc')).toBe(false)
  })
})

describe('conta e sessão', () => {
  it('cadastro normaliza e-mail, cria sessão e exige confirmação', async () => {
    const e = email()
    const r = await signUp(db, { email: `  ${e.toUpperCase()} `, password: 'senha-forte-123', displayName: 'Ana' })
    const a = await authenticate(db, r.session.token)
    expect(a?.user.email).toBe(e)
    expect(a?.user.emailVerified).toBe(false)
    expect(await verifyEmail(db, r.verifyToken)).toBe(true)
    expect(await verifyEmail(db, r.verifyToken)).toBe(false) // uso único
    expect((await authenticate(db, r.session.token))?.user.emailVerified).toBe(true)
  })

  it('e-mail repetido e senha curta são recusados', async () => {
    const e = email()
    await signUp(db, { email: e, password: 'senha-forte-123', displayName: 'Bia' })
    await expectCode(signUp(db, { email: e, password: 'senha-forte-123', displayName: 'Bia' }), 'conflict')
    await expectCode(signUp(db, { email: email(), password: 'curta', displayName: 'Bia' }), 'invalid_input')
  })

  it('login: mesma mensagem para e-mail inexistente e senha errada; limite por e-mail+IP', async () => {
    const e = email()
    await signUp(db, { email: e, password: 'senha-forte-123', displayName: 'Caio' })
    const a = await expectCode(signIn(db, { email: e, password: 'errada-errada' }, { ipHash: 'ip-teste-1' }), 'unauthenticated')
    const b = await expectCode(signIn(db, { email: email(), password: 'errada-errada' }, { ipHash: 'ip-teste-1' }), 'unauthenticated')
    expect((a as unknown as Error).message).toBe((b as unknown as Error).message)
    for (let i = 0; i < 8; i++) await signIn(db, { email: e, password: 'errada' + i }, { ipHash: 'ip-teste-2' }).catch(() => {})
    await expectCode(signIn(db, { email: e, password: 'senha-forte-123' }, { ipHash: 'ip-teste-2' }), 'rate_limited')
    const ok = await signIn(db, { email: e, password: 'senha-forte-123' }, { ipHash: 'ip-teste-3' })
    expect(await authenticate(db, ok.token)).not.toBeNull()
  })

  it('sair revoga na hora; token malformado nem consulta', async () => {
    const r = await signUp(db, { email: email(), password: 'senha-forte-123', displayName: 'Dani' })
    await revokeSessionByToken(db, r.session.token)
    expect(await authenticate(db, r.session.token)).toBeNull()
    expect(await authenticate(db, 'qualquer-coisa')).toBeNull()
  })

  it('sessão vencida não vale', async () => {
    const r = await signUp(db, { email: email(), password: 'senha-forte-123', displayName: 'Eva' })
    await db.asSystem('teste', (tx) => tx`update zro.sessions set expires_at = now() - interval '1 second' where user_id = ${r.userId}`)
    expect(await authenticate(db, r.session.token)).toBeNull()
  })

  it('redefinir senha encerra todas as sessões; trocar senha mantém a atual', async () => {
    const e = email()
    const r = await signUp(db, { email: e, password: 'senha-forte-123', displayName: 'Fábio' })
    const other = await signIn(db, { email: e, password: 'senha-forte-123' })
    const reset = await requestPasswordReset(db, e)
    expect(reset?.token).toBeTruthy()
    expect(await requestPasswordReset(db, email())).toBeNull()
    await resetPassword(db, reset!.token, 'nova-senha-forte-456')
    expect(await authenticate(db, r.session.token)).toBeNull()
    expect(await authenticate(db, other.token)).toBeNull()
    await expectCode(resetPassword(db, reset!.token, 'outra-senha-forte'), 'invalid_input')
    const s1 = await signIn(db, { email: e, password: 'nova-senha-forte-456' })
    const s2 = await signIn(db, { email: e, password: 'nova-senha-forte-456' })
    const a1 = (await authenticate(db, s1.token))!
    await changePassword(db, a1.user.id, a1.session.id, 'nova-senha-forte-456', 'terceira-senha-forte')
    expect(await authenticate(db, s1.token)).not.toBeNull()
    expect(await authenticate(db, s2.token)).toBeNull()
  })
})

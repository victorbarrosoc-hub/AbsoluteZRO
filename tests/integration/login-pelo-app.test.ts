// Entrar com o Google pelo navegador do sistema, para os apps de computador (ADR 0041, migração 0057): código de uso
// único, 60 s, vinculado ao desafio PKCE e ao state, esquema só de uma lista fechada, sem open redirect.
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticate,
  DESKTOP_LOGIN_APPS,
  DESKTOP_LOGIN_TTL_MS,
  desktopLoginReturnUrl,
  hashToken,
  issueDesktopLoginCode,
  parseDesktopLoginRequest,
  redeemDesktopLoginCode,
  safeLocalPath,
  type DesktopLoginRequest,
} from '@zro/auth'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { expectCode, newUser } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const VERIFIER = 'v'.repeat(43)
const challengeOf = (v: string) => createHash('sha256').update(v).digest('base64url')
const STATE = 's'.repeat(32)

const pedido = (extra: Partial<DesktopLoginRequest> = {}): DesktopLoginRequest => ({
  app: 'relay',
  state: STATE,
  challenge: challengeOf(VERIFIER),
  next: '/oauth/authorize?client_id=relay-web',
  ...extra,
})

const emitir = (userId: string, req = pedido(), now = Date.now()) => db.asSystem('teste', (tx) => issueDesktopLoginCode(tx, userId, req, now))
const trocar = (code: string, extra: Partial<{ verifier: string; state: string; app: string }> = {}, now = Date.now()) =>
  redeemDesktopLoginCode(db, { code, verifier: VERIFIER, state: STATE, app: 'relay', ...extra }, {}, now)

describe('pedido do app: lista fechada e formato', () => {
  it('aceita só os esquemas da lista e monta o deep link com o esquema dela', () => {
    expect([...DESKTOP_LOGIN_APPS].sort()).toEqual(['absolutezro', 'carrodofreela', 'maestro', 'relay', 'rift', 'tpeasy'])
    for (const app of DESKTOP_LOGIN_APPS) {
      const r = parseDesktopLoginRequest({ app, state: STATE, challenge: challengeOf(VERIFIER) })
      expect(r.ok).toBe(true)
    }
    const url = desktopLoginReturnUrl('relay', 'zd_x', STATE)
    expect(url).toBe(`relay://entrar-app?code=zd_x&state=${STATE}`)
  })

  it('recusa protocolo fora da lista (javascript:, https, outro app, vazio, maiúsculas)', () => {
    for (const app of ['javascript', 'https', 'http', 'file', 'evil', 'Relay', 'relay://', 'relay:evil', 'sobedesce', '', 'relay.exe']) {
      const r = parseDesktopLoginRequest({ app, state: STATE, challenge: challengeOf(VERIFIER) })
      expect(r.ok, app).toBe(false)
    }
    expect(() => desktopLoginReturnUrl('evil' as never, 'zd_x', STATE)).toThrow()
  })

  it('recusa state e challenge fora do formato', () => {
    const base = { app: 'relay', state: STATE, challenge: challengeOf(VERIFIER) }
    for (const ruim of [
      { state: 'curto' },
      { state: 'a b'.repeat(8) },
      { state: '' },
      { challenge: 'curto' },
      { challenge: `${challengeOf(VERIFIER)}=` },
      { challenge: '' },
    ]) {
      expect(parseDesktopLoginRequest({ ...base, ...ruim }).ok, JSON.stringify(ruim)).toBe(false)
    }
    expect(parseDesktopLoginRequest(new URLSearchParams({ ...base })).ok).toBe(true)
  })

  it('next: só caminho do próprio HUB (open redirect vira null)', () => {
    for (const ruim of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com/x',
      'javascript:alert(1)',
      'evil.com',
      '/a\r\nSet-Cookie: x=1',
      '/a\u0000b',
      '/' + 'a'.repeat(2001),
    ]) {
      expect(safeLocalPath(ruim), ruim).toBeNull()
      const r = parseDesktopLoginRequest({ app: 'relay', state: STATE, challenge: challengeOf(VERIFIER), next: ruim })
      expect(r.ok && r.req.next, ruim).toBeNull()
    }
    expect(safeLocalPath('/oauth/authorize?client_id=x&state=y')).toBe('/oauth/authorize?client_id=x&state=y')
  })
})

describe('código de uso único', () => {
  it('troca o código por uma sessão do HUB da própria pessoa, uma vez só', async () => {
    const u = await newUser(db, 'login-app')
    const code = await emitir(u.userId)
    expect(code).toMatch(/^zd_[A-Za-z0-9_-]{43}$/)
    const r = await trocar(code)
    expect(r.userId).toBe(u.userId)
    expect(r.next).toBe('/oauth/authorize?client_id=relay-web')
    const auth = await authenticate(db, r.token)
    expect(auth?.user.id).toBe(u.userId)
    // reuso: a segunda troca falha e não cria outra sessão
    const antes = await db.sql`select count(*)::int as n from zro.sessions where user_id = ${u.userId}`
    await expectCode(trocar(code), 'unauthenticated')
    const depois = await db.sql`select count(*)::int as n from zro.sessions where user_id = ${u.userId}`
    expect(depois[0]!.n).toBe(antes[0]!.n)
  })

  it('o banco guarda só o sha256 do código', async () => {
    const u = await newUser(db, 'login-app-hash')
    const code = await emitir(u.userId)
    const [row] = await db.sql`select * from zro.desktop_login_codes where user_id = ${u.userId}`
    expect(row!.code_hash).toBe(hashToken(code))
    expect(JSON.stringify(row)).not.toContain(code)
    expect(row!.app).toBe('relay')
  })

  it('expira em 60 s', async () => {
    const u = await newUser(db, 'login-app-expira')
    const agora = Date.now()
    const code = await emitir(u.userId, pedido(), agora)
    const [row] = await db.sql`select expires_at from zro.desktop_login_codes where user_id = ${u.userId}`
    expect((row!.expires_at as Date).getTime() - agora).toBe(DESKTOP_LOGIN_TTL_MS)
    expect(DESKTOP_LOGIN_TTL_MS).toBe(60_000)
    await expectCode(trocar(code, {}, agora + DESKTOP_LOGIN_TTL_MS + 1_000), 'unauthenticated')
    // vencido, também fica gasto
    await expectCode(trocar(code, {}, agora), 'unauthenticated')
  })

  it('dentro dos 60 s ainda vale', async () => {
    const u = await newUser(db, 'login-app-janela')
    const agora = Date.now()
    const code = await emitir(u.userId, pedido(), agora)
    await expect(trocar(code, {}, agora + 59_000)).resolves.toMatchObject({ userId: u.userId })
  })

  it('verifier errado (PKCE): recusa e queima o código', async () => {
    const u = await newUser(db, 'login-app-pkce')
    const code = await emitir(u.userId)
    await expectCode(trocar(code, { verifier: 'x'.repeat(43) }), 'unauthenticated')
    // quem interceptou o deep link não tem o verifier; o app de verdade também não consegue mais: entra de novo
    await expectCode(trocar(code), 'unauthenticated')
  })

  it('state errado: recusa e queima o código', async () => {
    const u = await newUser(db, 'login-app-state')
    const code = await emitir(u.userId)
    await expectCode(trocar(code, { state: 'z'.repeat(32) }), 'unauthenticated')
    await expectCode(trocar(code), 'unauthenticated')
  })

  it('código de outro app: recusa (o código de um app não abre outro)', async () => {
    const u = await newUser(db, 'login-app-outro')
    const code = await emitir(u.userId, pedido({ app: 'maestro' }))
    await expectCode(trocar(code, { app: 'relay' }), 'unauthenticated')
    const code2 = await emitir(u.userId, pedido({ app: 'maestro' }))
    await expect(trocar(code2, { app: 'maestro' })).resolves.toMatchObject({ userId: u.userId })
  })

  it('código inventado, fora do formato ou verifier curto', async () => {
    await expectCode(trocar('zd_' + 'A'.repeat(43)), 'unauthenticated')
    await expectCode(trocar('lixo'), 'unauthenticated')
    await expectCode(trocar(''), 'unauthenticated')
    const u = await newUser(db, 'login-app-formato')
    const code = await emitir(u.userId)
    await expectCode(trocar(code, { verifier: 'curto' }), 'unauthenticated')
    // verifier fora do formato nem encosta no código: ele continua valendo para o app de verdade
    await expect(trocar(code)).resolves.toMatchObject({ userId: u.userId })
  })

  it('conta suspensa não entra', async () => {
    const u = await newUser(db, 'login-app-suspensa')
    const code = await emitir(u.userId)
    await db.asSystem('teste', (tx) => tx`update zro.users set status = 'suspended' where id = ${u.userId}`)
    await expectCode(trocar(code), 'unauthenticated')
  })

  it('o banco recusa app fora da lista, state/challenge malformados e next com //host', async () => {
    const u = await newUser(db, 'login-app-check')
    const ins = (over: Record<string, unknown>) =>
      db.asSystem(
        'teste',
        (tx) =>
          tx`insert into zro.desktop_login_codes (code_hash, user_id, app, state, code_challenge, next, expires_at)
           values (${hashToken(String(Math.random()))}, ${u.userId}, ${(over.app as string) ?? 'relay'}, ${(over.state as string) ?? STATE},
                   ${(over.challenge as string) ?? challengeOf(VERIFIER)}, ${(over.next as string | null) ?? null}, now() + interval '1 minute')`,
      )
    await expect(ins({ app: 'evil' })).rejects.toThrow()
    await expect(ins({ state: 'curto' })).rejects.toThrow()
    await expect(ins({ challenge: 'curto' })).rejects.toThrow()
    await expect(ins({ next: '//evil.com' })).rejects.toThrow()
    await expect(ins({})).resolves.toBeDefined()
  })
})

describe('isolamento (RLS)', () => {
  it('pessoa comum (zro_app) não lê nem grava códigos de entrada, nem os dela', async () => {
    const a = await newUser(db, 'login-app-rls-a')
    const b = await newUser(db, 'login-app-rls-b')
    await emitir(a.userId)
    const ctx = { userId: a.userId, orgId: null }
    for (const q of [
      'select * from zro.desktop_login_codes limit 1',
      `insert into zro.desktop_login_codes (code_hash, user_id, app, state, code_challenge, expires_at) values ('x', '${a.userId}', 'relay', '${STATE}', '${challengeOf(VERIFIER)}', now())`,
      `update zro.desktop_login_codes set used_at = now() where user_id = '${b.userId}'`,
      `delete from zro.desktop_login_codes where user_id = '${a.userId}'`,
    ]) {
      await expect(
        db.asUser(ctx, (tx) => tx.unsafe(q)),
        q,
      ).rejects.toThrow(/permission denied/)
    }
  })

  it('a tabela tem RLS ligada', async () => {
    const [t] = await db.sql`select relrowsecurity from pg_class where oid = 'zro.desktop_login_codes'::regclass`
    expect(t!.relrowsecurity).toBe(true)
  })
})

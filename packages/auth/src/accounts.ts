/** Cadastro, login, confirmação de e-mail e troca de senha da conta central Absolute ZRO. */
import type { Database } from '@zro/db'
import { pgErrorCode, PG } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { normalizarArroba } from './arroba'
import { validarArroba } from './arroba-reservadas'
import { decoyHash, hashPassword, verifyPassword } from './password'
import { clearAttempts, LIMIT_MESSAGE, registerAttempt, RULES, withinLimit } from './rate-limit'
import { normalizeEmail, validateDisplayName, validateEmail, validatePassword } from './rules'
import { createSession, revokeOtherSessions } from './sessions'
import { hashToken, newToken, TOKEN_FORMAT } from './tokens'

const VERIFY_TTL_MS = 48 * 3_600_000
const RESET_TTL_MS = 60 * 60_000

export type RequestMeta = { ipHash?: string | null; userAgent?: string | null }

export async function signUp(
  db: Database,
  input: { email: string; password: string; displayName: string; arroba?: string | null; arrobaFlexivel?: boolean },
  meta: RequestMeta = {},
): Promise<{ userId: string; verifyToken: string; session: { token: string; expiresAt: Date } }> {
  const email = normalizeEmail(input.email)
  const problem = validateEmail(email) ?? validatePassword(input.password) ?? validateDisplayName(input.displayName)
  if (problem) throw new DomainError('invalid_input', problem)
  // O @ escolhido no cadastro (0029). Sem ele, a conta nasce com a sugestão do banco e a pessoa troca no Perfil.
  const arroba = input.arroba ? normalizarArroba(input.arroba) : null
  const arrobaRuim = arroba !== null ? validarArroba(arroba) : null
  if (arrobaRuim) throw new DomainError('invalid_input', `@: ${arrobaRuim}`, { campo: 'arroba' })
  const passwordHash = await hashPassword(input.password)
  const ipKey = meta.ipHash ? `signup-ip:${meta.ipHash}` : null
  if (ipKey) {
    const allowed = await db.asSystem('auth: limite de cadastro', async (tx) => {
      if (!(await withinLimit(tx, ipKey, RULES.signupIp))) return false
      await registerAttempt(tx, ipKey)
      return true
    })
    if (!allowed) throw new DomainError('rate_limited', LIMIT_MESSAGE)
  }
  return db.asSystem('auth: cadastro', async (tx) => {
    let userId: string
    try {
      const [u] = await tx.savepoint((sp) => sp`insert into zro.users (email, display_name) values (${email}, ${input.displayName.trim()}) returning id`)
      userId = u!.id as string
    } catch (e) {
      if (pgErrorCode(e) === PG.uniqueViolation) throw new DomainError('conflict', 'Já existe uma conta com esse e-mail. Entre ou redefina a senha.')
      throw e
    }
    if (arroba) {
      try {
        await tx.savepoint(async (sp) => {
          await sp`select set_config('zro.user_id', ${userId}, true)`
          await sp`select zro.trocar_arroba(${arroba})`
        })
      } catch (e) {
        if (pgErrorCode(e) !== PG.uniqueViolation) throw e
        // A pessoa aceitou a sugestão sem mexer e alguém já tem: fica a do banco (o mesmo nome com um número).
        if (!input.arrobaFlexivel) throw new DomainError('conflict', `O @${arroba} já é de outra pessoa. Escolha outro.`, { campo: 'arroba' })
        await tx`update zro.perfis set arroba_sugerida = false where user_id = ${userId}`
      }
      await tx`select set_config('zro.user_id', '', true)`
    }
    await tx`insert into zro.auth_credentials (user_id, password_hash) values (${userId}, ${passwordHash})`
    const verifyToken = newToken('zv')
    await tx`insert into zro.auth_tokens (user_id, purpose, token_hash, expires_at)
             values (${userId}, 'verify_email', ${hashToken(verifyToken)}, ${new Date(Date.now() + VERIFY_TTL_MS)})`
    const session = await createSession(tx, userId, meta)
    await audit(tx, { actorUserId: userId, actorKind: 'user', action: 'account.created', targetType: 'user', targetId: userId, ipHash: meta.ipHash })
    return { userId, verifyToken, session }
  })
}

/** Mesma resposta para e-mail inexistente e senha errada; limites por e-mail+IP, por IP e por conta. */
export async function signIn(
  db: Database,
  input: { email: string; password: string },
  meta: RequestMeta = {},
): Promise<{ userId: string; token: string; expiresAt: Date }> {
  const email = normalizeEmail(input.email)
  const ip = meta.ipHash ?? 'sem-ip'
  const keyPair = `login:${email}:${ip}`
  const keyIp = `login-ip:${ip}`
  const keyAccount = `login-account:${email}`
  const wrong = () => new DomainError('unauthenticated', 'E-mail ou senha incorretos.')

  const found = await db.asSystem('auth: login (limites e credencial)', async (tx) => {
    const ok =
      (await withinLimit(tx, keyPair, RULES.loginEmail)) &&
      (await withinLimit(tx, keyIp, RULES.loginIp)) &&
      (await withinLimit(tx, keyAccount, RULES.loginAccount))
    if (!ok) throw new DomainError('rate_limited', LIMIT_MESSAGE)
    const [row] = await tx`
      select u.id, c.password_hash from zro.users u join zro.auth_credentials c on c.user_id = u.id
      where u.email = ${email} and u.status = 'active'`
    return row ? { id: row.id as string, hash: row.password_hash as string } : null
  })

  const valid = found ? await verifyPassword(input.password, found.hash) : (await verifyPassword(input.password, await decoyHash()), false)
  if (!valid || !found) {
    // Registra a tentativa numa transação que confirma; só depois responde o erro.
    await db.asSystem('auth: login recusado', (tx) => registerAttempt(tx, keyPair, keyIp, keyAccount))
    throw wrong()
  }
  return db.asSystem('auth: login (sessão)', async (tx) => {
    await clearAttempts(tx, keyPair)
    const s = await createSession(tx, found.id, meta)
    await audit(tx, { actorUserId: found.id, action: 'session.created', targetType: 'session', targetId: s.id, ipHash: meta.ipHash })
    return { userId: found.id, token: s.token, expiresAt: s.expiresAt }
  })
}

export async function verifyEmail(db: Database, token: string): Promise<boolean> {
  if (!TOKEN_FORMAT.verify.test(token)) return false
  return db.asSystem('auth: confirmar e-mail', async (tx) => {
    const [t] = await tx`
      update zro.auth_tokens set used_at = now()
      where token_hash = ${hashToken(token)} and purpose = 'verify_email' and used_at is null and expires_at > now()
      returning user_id`
    if (!t) return false
    await tx`update zro.users set email_verified_at = coalesce(email_verified_at, now()) where id = ${t.user_id as string}`
    await audit(tx, { actorUserId: t.user_id as string, action: 'account.email_verified', targetType: 'user', targetId: t.user_id as string })
    return true
  })
}

/** Gera um novo link de confirmação (o anterior continua valendo até expirar). */
export async function newVerifyToken(db: Database, userId: string): Promise<string> {
  const token = newToken('zv')
  await db.asSystem(
    'auth: novo link de confirmação',
    (tx) =>
      tx`insert into zro.auth_tokens (user_id, purpose, token_hash, expires_at) values (${userId}, 'verify_email', ${hashToken(token)}, ${new Date(Date.now() + VERIFY_TTL_MS)})`,
  )
  return token
}

/** Sempre a mesma resposta para o cliente; devolve o token só para o servidor mandar por e-mail. */
export async function requestPasswordReset(db: Database, rawEmail: string): Promise<{ email: string; token: string } | null> {
  const email = normalizeEmail(rawEmail)
  if (validateEmail(email)) return null
  return db.asSystem('auth: pedir nova senha', async (tx) => {
    const key = `reset:${email}`
    if (!(await withinLimit(tx, key, RULES.resetEmail))) return null
    await registerAttempt(tx, key)
    const [u] = await tx`select id from zro.users where email = ${email} and status = 'active'`
    if (!u) return null
    const token = newToken('zr')
    await tx`insert into zro.auth_tokens (user_id, purpose, token_hash, expires_at)
             values (${u.id as string}, 'reset_password', ${hashToken(token)}, ${new Date(Date.now() + RESET_TTL_MS)})`
    return { email, token }
  })
}

/** Nova senha por link: encerra todas as sessões abertas. */
export async function resetPassword(db: Database, token: string, newPassword: string): Promise<void> {
  const problem = validatePassword(newPassword)
  if (problem) throw new DomainError('invalid_input', problem)
  if (!TOKEN_FORMAT.reset.test(token)) throw new DomainError('invalid_input', 'Link inválido ou vencido.')
  const hash = await hashPassword(newPassword)
  await db.asSystem('auth: redefinir senha', async (tx) => {
    const [t] = await tx`
      update zro.auth_tokens set used_at = now()
      where token_hash = ${hashToken(token)} and purpose = 'reset_password' and used_at is null and expires_at > now()
      returning user_id`
    if (!t) throw new DomainError('invalid_input', 'Link inválido ou vencido.')
    const userId = t.user_id as string
    // quem só entrava pelo Google ainda não tem senha: o link cria a primeira (antes, o update não achava linha, o link
    // era gasto e a senha nova não valia)
    await tx`insert into zro.auth_credentials (user_id, password_hash) values (${userId}, ${hash})
             on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`
    await revokeOtherSessions(tx, userId, null)
    await audit(tx, { actorUserId: userId, action: 'account.password_reset', targetType: 'user', targetId: userId })
  })
}

/** A conta tem senha? (Quem só entra pelo Google não tem até criar uma pelo "Esqueci a senha".) */
export async function hasPassword(db: Database, userId: string): Promise<boolean> {
  const [row] = await db.asSystem('auth: conta tem senha', (tx) => tx`select 1 from zro.auth_credentials where user_id = ${userId}`)
  return Boolean(row)
}

/**
 * Pede a troca de e-mail: confere a senha e devolve um link de uso único para o servidor mandar ao endereço NOVO.
 * Nada muda até a confirmação; o e-mail atual continua valendo.
 */
export async function requestEmailChange(db: Database, userId: string, password: string, rawEmail: string): Promise<{ email: string; token: string }> {
  const email = normalizeEmail(rawEmail)
  const problem = validateEmail(email)
  if (problem) throw new DomainError('invalid_input', problem)
  const key = `email-change:${userId}`
  const [row] = await db.asSystem('auth: trocar e-mail (limite e credencial)', async (tx) => {
    if (!(await withinLimit(tx, key, RULES.emailChange))) throw new DomainError('rate_limited', LIMIT_MESSAGE)
    return tx`select u.email, c.password_hash from zro.users u left join zro.auth_credentials c on c.user_id = u.id where u.id = ${userId}`
  })
  if (!row) throw new DomainError('unauthenticated', 'Entre na sua conta.')
  if (!row.password_hash) throw new DomainError('invalid_input', 'Sua conta entra pelo Google. Crie uma senha em "Esqueci a senha" antes de trocar o e-mail.')
  if (!(await verifyPassword(password, row.password_hash as string))) {
    await db.asSystem('auth: trocar e-mail recusado', (tx) => registerAttempt(tx, key))
    throw new DomainError('unauthenticated', 'Senha incorreta.')
  }
  if (email === row.email) throw new DomainError('invalid_input', 'Esse já é o seu e-mail.')
  return db.asSystem('auth: pedir troca de e-mail', async (tx) => {
    await registerAttempt(tx, key)
    const [taken] = await tx`select 1 from zro.users where email = ${email}`
    if (taken) throw new DomainError('conflict', 'Esse e-mail já está em outra conta.')
    const token = newToken('zm')
    await tx`insert into zro.auth_tokens (user_id, purpose, token_hash, expires_at, new_email)
             values (${userId}, 'change_email', ${hashToken(token)}, ${new Date(Date.now() + VERIFY_TTL_MS)}, ${email})`
    await audit(tx, { actorUserId: userId, action: 'account.email_change_requested', targetType: 'user', targetId: userId })
    return { email, token }
  })
}

/**
 * Confirma a troca pelo link mandado ao endereço novo. O e-mail novo já nasce confirmado, os links de nova senha
 * pendentes (mandados ao endereço antigo) deixam de valer e as outras trocas pedidas são descartadas.
 * Devolve o endereço antigo, para o aviso de segurança.
 */
export async function confirmEmailChange(db: Database, token: string): Promise<{ userId: string; oldEmail: string; email: string } | null> {
  if (!TOKEN_FORMAT.changeEmail.test(token)) return null
  return db.asSystem('auth: confirmar troca de e-mail', async (tx) => {
    const [t] = await tx`
      update zro.auth_tokens set used_at = now()
      where token_hash = ${hashToken(token)} and purpose = 'change_email' and used_at is null and expires_at > now()
      returning user_id, new_email`
    if (!t) return null
    const userId = t.user_id as string
    const email = t.new_email as string
    const [u] = await tx`select email from zro.users where id = ${userId} and status = 'active' for update`
    if (!u) return null
    try {
      await tx.savepoint((sp) => sp`update zro.users set email = ${email}, email_verified_at = now() where id = ${userId}`)
    } catch (e) {
      if (pgErrorCode(e) === PG.uniqueViolation)
        throw new DomainError('conflict', 'Esse e-mail passou a ser de outra conta. Peça a troca de novo com outro endereço.')
      throw e
    }
    await tx`update zro.auth_tokens set used_at = now() where user_id = ${userId} and used_at is null and purpose in ('reset_password', 'change_email')`
    await audit(tx, { actorUserId: userId, action: 'account.email_changed', targetType: 'user', targetId: userId })
    return { userId, oldEmail: u.email as string, email }
  })
}

export async function changePassword(db: Database, userId: string, sessionId: string, current: string, next: string): Promise<void> {
  const problem = validatePassword(next)
  if (problem) throw new DomainError('invalid_input', problem)
  const [row] = await db.asSystem('auth: ler credencial', (tx) => tx`select password_hash from zro.auth_credentials where user_id = ${userId}`)
  if (!row || !(await verifyPassword(current, row.password_hash as string))) throw new DomainError('unauthenticated', 'Senha atual incorreta.')
  const hash = await hashPassword(next)
  await db.asSystem('auth: trocar senha', async (tx) => {
    await tx`update zro.auth_credentials set password_hash = ${hash}, updated_at = now() where user_id = ${userId}`
    await revokeOtherSessions(tx, userId, sessionId)
    await audit(tx, { actorUserId: userId, action: 'account.password_changed', targetType: 'user', targetId: userId })
  })
}

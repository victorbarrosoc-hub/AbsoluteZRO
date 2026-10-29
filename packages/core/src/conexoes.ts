/**
 * Conexões da conta Absolute ZRO (ADR 0026, pedido do titular em 29/10/2026): como o Apple ID com o iCloud, a pessoa
 * conecta o Google Agenda UMA vez no HUB e os apps da família usam por aqui (API em ./agenda.ts). Este módulo cuida da
 * ida e volta ao Google (OAuth com PKCE S256, state e nonce), dos tokens cifrados e da permissão por app.
 *
 * - Chave: `ZRO_CONEXOES_KEY` (32 bytes aleatórios, base64 ou hex). Dela saem, por HKDF-SHA256 com rótulos distintos,
 *   a chave dos tokens e a do cookie da ida ao Google. Sem ela a função recusa com clareza ("indisponível"), nunca
 *   guarda token em claro.
 * - Tokens: AES-256-GCM com contexto (AAD) amarrado à pessoa e ao campo: copiar o valor para outra linha não abre.
 *   Nunca vão para log, resposta ou auditoria.
 * - O id_token vem direto do endpoint de token do Google por TLS, com o client_secret (OIDC Core §3.1.3.7): conferimos
 *   iss, aud, exp e nonce, como no "Entrar com o Google" (packages/auth/src/google.ts).
 * - Renovação no servidor, com a linha travada. `invalid_grant` = o Google não aceita mais: a conexão vira
 *   `reconectar`, os tokens saem e o app recebe 409 `sem_conexao` (motivo `reconectar`).
 * Tudo da pessoa roda em `asUser` (RLS por user_id, migration 0026); só o limite de pedidos usa `asSystem`.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import type { Authenticated } from '@zro/auth'
import type { Database, Tx, UserContext } from '@zro/db'
import { audit, DomainError } from '@zro/observability'

export const ESCOPO_AGENDA = 'zro.agenda'
export const GOOGLE_ESCOPOS_AGENDA = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const
/** Apps da família que já usam a Agenda pelo HUB (fase 1). Outro app entra aqui quando usar de verdade. */
export const APPS_COM_AGENDA = ['maestro'] as const

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const PENDENTE_TTL_MS = 10 * 60_000

// ───────────── chave e cifra ─────────────

export type ChaveConexoes = { tokens: Buffer; cookie: Buffer }

/** A chave das Conexões, derivada de ZRO_CONEXOES_KEY. null = não configurada (a função recusa). */
export function chaveDasConexoes(env: Record<string, string | undefined> = process.env): ChaveConexoes | null {
  const raw = env.ZRO_CONEXOES_KEY?.trim()
  if (!raw) return null
  let ikm: Buffer
  if (/^[0-9a-f]{64,}$/i.test(raw)) ikm = Buffer.from(raw, 'hex')
  else {
    const b = Buffer.from(raw, 'base64')
    ikm = b.length >= 32 ? b : Buffer.from(raw, 'utf8')
  }
  if (ikm.length < 32) return null
  const derivar = (info: string) => Buffer.from(hkdfSync('sha256', ikm, 'absolute-zro/conexoes', info, 32))
  return { tokens: derivar('zro.conexoes.tokens/v1'), cookie: derivar('zro.conexoes.cookie/v1') }
}

/** AES-256-GCM: `v1.<iv>.<cifrado>.<tag>` em base64url. O contexto entra como AAD. */
export function selar(chave: Buffer, texto: string, contexto: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave, iv)
  c.setAAD(Buffer.from(contexto, 'utf8'))
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), ct.toString('base64url'), c.getAuthTag().toString('base64url')].join('.')
}

/** Abre o que `selar` fechou com a mesma chave e o mesmo contexto; qualquer outra coisa = null. */
export function abrir(chave: Buffer, selado: string | null | undefined, contexto: string): string | null {
  if (!selado) return null
  const [v, iv, ct, tag] = selado.split('.')
  if (v !== 'v1' || !iv || ct === undefined || !tag) return null
  try {
    const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'))
    d.setAAD(Buffer.from(contexto, 'utf8'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

const ctxToken = (userId: string, campo: 'refresh' | 'access') => `conexao:${userId}:google:${campo}`

// ───────────── Google ─────────────

export type GoogleAgendaConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  authUrl: string
  tokenUrl: string
  revokeUrl: string
  /** Base da API (https://www.googleapis.com). */
  apiBase: string
  /** Onde a pessoa conecta (a página /conexoes do HUB): vai no 409 `sem_conexao`. */
  conexoesUrl: string
  fetch?: typeof fetch
  timeoutMs?: number
}

/** Endereços do Google; `base` (só fora de produção, nos testes) troca todos por um Google falso. */
export function googleUrls(base?: string | null): Pick<GoogleAgendaConfig, 'authUrl' | 'tokenUrl' | 'revokeUrl' | 'apiBase'> {
  if (base) {
    const b = base.replace(/\/$/, '')
    return { authUrl: `${b}/o/oauth2/v2/auth`, tokenUrl: `${b}/token`, revokeUrl: `${b}/revoke`, apiBase: b }
  }
  return {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    apiBase: 'https://www.googleapis.com',
  }
}

/** Pedido em andamento: vai num cookie httpOnly cifrado, curto, só em /conexoes/google; preso à pessoa que começou. */
export type ConexaoPendente = { state: string; nonce: string; verifier: string; uid: string; exp: number }

export function inicioConexaoGoogle(cfg: GoogleAgendaConfig, userId: string, agora = Date.now()): { url: string; pendente: ConexaoPendente } {
  const pendente: ConexaoPendente = {
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    uid: userId,
    exp: agora + PENDENTE_TTL_MS,
  }
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: ['openid', 'email', ...GOOGLE_ESCOPOS_AGENDA].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: pendente.state,
    nonce: pendente.nonce,
    code_challenge: createHash('sha256').update(pendente.verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })
  return { url: `${cfg.authUrl}?${q.toString()}`, pendente }
}

const CTX_COOKIE = 'conexoes:google:pendente'
export const selarPendente = (chave: ChaveConexoes, p: ConexaoPendente) => selar(chave.cookie, JSON.stringify(p), CTX_COOKIE)

export function abrirPendente(chave: ChaveConexoes, raw: string | null | undefined, agora = Date.now()): ConexaoPendente | null {
  const t = abrir(chave.cookie, raw, CTX_COOKIE)
  if (!t) return null
  try {
    const p = JSON.parse(t) as ConexaoPendente
    if (typeof p.state !== 'string' || typeof p.nonce !== 'string' || typeof p.verifier !== 'string' || typeof p.uid !== 'string') return null
    return typeof p.exp === 'number' && p.exp > agora ? p : null
  } catch {
    return null
  }
}

/** Motivo curto que a tela /conexoes traduz (nunca texto livre na URL). */
export type MotivoConexao = 'cancelado' | 'expirou' | 'escopo' | 'google' | 'sem_refresh' | 'indisponivel'
export const falhaConexao = (motivo: MotivoConexao, msg: string) => new DomainError('external_resource_denied', msg, { motivo })

/** O erro que o app recebe sem conexão (ou com a conexão pedindo para conectar de novo). */
export const semConexao = (cfg: Pick<GoogleAgendaConfig, 'conexoesUrl'>, motivo: 'nenhuma' | 'reconectar') =>
  new DomainError(
    'sem_conexao',
    motivo === 'reconectar' ? 'O Google pediu para conectar a Agenda de novo na Absolute ZRO.' : 'Conecte o Google Agenda na sua conta Absolute ZRO.',
    { motivo, conectar: cfg.conexoesUrl },
  )

type Resposta = { status: number; corpo: Record<string, unknown> | null }

async function pedir(cfg: GoogleAgendaConfig, url: string, init: RequestInit): Promise<Resposta> {
  let res: Response
  try {
    res = await (cfg.fetch ?? fetch)(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000) })
  } catch {
    throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
  }
  const texto = await res.text().catch(() => '')
  let corpo: Record<string, unknown> | null = null
  try {
    corpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : null
  } catch {
    corpo = null
  }
  return { status: res.status, corpo }
}

const form = (o: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(o).toString(),
})

function claimsDoIdToken(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export type TokensGoogle = { sub: string; email: string; escopos: string[]; refreshToken: string | null; accessToken: string; expiraEm: Date }

/** Volta do Google: confere state, troca o código (PKCE) e confere o id_token e as permissões dadas. */
export async function trocarCodigoGoogle(
  cfg: GoogleAgendaConfig,
  pendente: ConexaoPendente,
  retorno: { code: string | null; state: string | null; error: string | null },
  agora = Date.now(),
): Promise<TokensGoogle> {
  if (retorno.error === 'access_denied') throw falhaConexao('cancelado', 'Conexão com o Google cancelada.')
  if (retorno.error) throw falhaConexao('google', 'O Google não completou a conexão. Tente de novo.')
  if (!retorno.state || retorno.state !== pendente.state) throw falhaConexao('expirou', 'O pedido expirou. Comece de novo.')
  if (!retorno.code) throw falhaConexao('google', 'O Google não completou a conexão. Tente de novo.')
  const r = await pedir(
    cfg,
    cfg.tokenUrl,
    form({
      grant_type: 'authorization_code',
      code: retorno.code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: pendente.verifier,
    }),
  )
  const b = r.corpo
  if (r.status !== 200 || !b || typeof b.id_token !== 'string' || typeof b.access_token !== 'string')
    throw falhaConexao('google', 'O Google não completou a conexão. Tente de novo.')
  const c = claimsDoIdToken(b.id_token)
  const audOk = c && (c.aud === cfg.clientId || (Array.isArray(c.aud) && c.aud.includes(cfg.clientId)))
  if (
    !c ||
    !audOk ||
    !GOOGLE_ISSUERS.includes(c.iss as string) ||
    typeof c.exp !== 'number' ||
    c.exp * 1000 < agora - 60_000 ||
    c.nonce !== pendente.nonce ||
    typeof c.sub !== 'string' ||
    !c.sub ||
    c.sub.length > 255
  )
    throw falhaConexao('google', 'O Google não completou a conexão. Tente de novo.')
  const email = typeof c.email === 'string' ? c.email.trim().toLowerCase().slice(0, 320) : ''
  if (!email.includes('@')) throw falhaConexao('google', 'O Google não informou o e-mail da conta.')
  const escopos = String(b.scope ?? '')
    .split(/\s+/)
    .filter(Boolean)
  // Consentimento granular: a pessoa pode desmarcar uma permissão na tela do Google.
  if (GOOGLE_ESCOPOS_AGENDA.some((s) => !escopos.includes(s))) throw falhaConexao('escopo', 'Marque as permissões da Agenda para conectar.')
  const vida = Math.min(Math.max(Number(b.expires_in) || 0, 60), 3600)
  return {
    sub: c.sub,
    email,
    escopos: escopos.filter((s) => s.startsWith('https://www.googleapis.com/auth/calendar')),
    refreshToken: typeof b.refresh_token === 'string' && b.refresh_token ? b.refresh_token : null,
    accessToken: b.access_token,
    expiraEm: new Date(agora + vida * 1000),
  }
}

/** Renova o access token. `invalido` = o Google não aceita mais o refresh token (invalid_grant). */
export async function renovarAcessoGoogle(
  cfg: GoogleAgendaConfig,
  refreshToken: string,
  agora = Date.now(),
): Promise<{ invalido: true } | { invalido: false; accessToken: string; expiraEm: Date; refreshToken: string | null }> {
  const r = await pedir(
    cfg,
    cfg.tokenUrl,
    form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret }),
  )
  if (r.status === 400 && (r.corpo?.error === 'invalid_grant' || r.corpo?.error === 'unauthorized_client')) return { invalido: true }
  if (r.status !== 200 || typeof r.corpo?.access_token !== 'string')
    throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
  const vida = Math.min(Math.max(Number(r.corpo.expires_in) || 0, 60), 3600)
  return {
    invalido: false,
    accessToken: r.corpo.access_token,
    expiraEm: new Date(agora + vida * 1000),
    refreshToken: typeof r.corpo.refresh_token === 'string' && r.corpo.refresh_token ? r.corpo.refresh_token : null,
  }
}

/** Revoga no Google (RFC 7009 do Google). Falha de rede não impede desconectar: devolve false. */
export async function revogarNoGoogle(cfg: GoogleAgendaConfig, token: string): Promise<boolean> {
  try {
    const r = await pedir(cfg, cfg.revokeUrl, form({ token }))
    return r.status === 200 || r.status === 400
  } catch {
    return false
  }
}

// ───────────── armazenamento ─────────────

const ctxDe = (auth: Authenticated): UserContext => ({ userId: auth.user.id, orgId: auth.session.activeOrgId })

/** Grava (ou troca) a conexão da pessoa, com os tokens cifrados. Conta Google diferente = agendas voltam à principal. */
export async function guardarConexaoGoogle(db: Database, chave: ChaveConexoes, auth: Authenticated, t: TokensGoogle): Promise<void> {
  const ctx = ctxDe(auth)
  await db.asUser(ctx, async (tx) => {
    const [atual] = await tx`select conta_sub, refresh_token_enc from zro.conexoes where provedor = 'google' for update`
    const mesmaConta = atual?.conta_sub === t.sub
    const refresh = t.refreshToken ?? (mesmaConta ? abrir(chave.tokens, atual?.refresh_token_enc as string, ctxToken(ctx.userId, 'refresh')) : null)
    if (!refresh) throw falhaConexao('sem_refresh', 'O Google não deixou a conexão ficar ativa. Tente de novo.')
    const rt = selar(chave.tokens, refresh, ctxToken(ctx.userId, 'refresh'))
    const at = selar(chave.tokens, t.accessToken, ctxToken(ctx.userId, 'access'))
    await tx`
      insert into zro.conexoes (user_id, provedor, conta_email, conta_sub, escopos, refresh_token_enc, access_token_enc, access_expira_em)
      values (${ctx.userId}, 'google', ${t.email}, ${t.sub}, ${t.escopos}, ${rt}, ${at}, ${t.expiraEm})
      on conflict (user_id, provedor) do update set
        conta_email = excluded.conta_email, escopos = excluded.escopos, refresh_token_enc = excluded.refresh_token_enc,
        access_token_enc = excluded.access_token_enc, access_expira_em = excluded.access_expira_em, estado = 'ativa', atualizada_em = now(),
        calendarios = case when zro.conexoes.conta_sub = excluded.conta_sub then zro.conexoes.calendarios else array['primary'] end,
        conta_sub = excluded.conta_sub`
    await audit(tx, {
      actorUserId: ctx.userId,
      action: 'conexao.ligada',
      targetType: 'conexao',
      targetId: 'google',
      metadata: { provedor: 'google', servico: 'agenda', troca: !!atual, outra_conta: !!atual && !mesmaConta },
    })
  })
}

export type ConexaoGoogle = {
  id: string
  contaEmail: string
  estado: 'ativa' | 'reconectar'
  calendarios: string[]
  criadaEm: Date
  usadaEm: Date | null
}

const linhaParaConexao = (r: Record<string, unknown>): ConexaoGoogle => ({
  id: r.id as string,
  contaEmail: r.conta_email as string,
  estado: r.estado as ConexaoGoogle['estado'],
  calendarios: r.calendarios as string[],
  criadaEm: r.criada_em as Date,
  usadaEm: (r.usada_em as Date) ?? null,
})

/**
 * O access token válido da pessoa: o guardado, se vale mais um minuto; senão renova com a linha travada. `forcar`
 * renova mesmo assim (o Google recusou o guardado com 401). invalid_grant: a conexão vira `reconectar` (gravado antes
 * de recusar) e o pedido recebe 409 `sem_conexao`.
 */
export async function acessoGoogle(
  db: Database,
  cfg: GoogleAgendaConfig,
  chave: ChaveConexoes,
  ctx: UserContext,
  o: { forcar?: boolean; agora?: number } = {},
): Promise<{ conexao: ConexaoGoogle; token: string }> {
  const agora = o.agora ?? Date.now()
  type Saida = { erro: 'nenhuma' | 'reconectar' } | { conexao: ConexaoGoogle; token: string }
  const r = await db.asUser(ctx, async (tx): Promise<Saida> => {
    const [l] = await tx`select * from zro.conexoes where provedor = 'google' for update`
    if (!l) return { erro: 'nenhuma' as const }
    if (l.estado !== 'ativa') return { erro: 'reconectar' as const }
    const conexao = linhaParaConexao(l)
    const at = abrir(chave.tokens, l.access_token_enc as string, ctxToken(ctx.userId, 'access'))
    if (!o.forcar && at && l.access_expira_em && (l.access_expira_em as Date).getTime() - 60_000 > agora) return { conexao, token: at }
    const rt = abrir(chave.tokens, l.refresh_token_enc as string, ctxToken(ctx.userId, 'refresh'))
    const novo = rt ? await renovarAcessoGoogle(cfg, rt, agora) : ({ invalido: true } as const)
    if (novo.invalido) {
      await marcarReconectar(tx, ctx, rt ? 'invalid_grant' : 'chave')
      return { erro: 'reconectar' as const }
    }
    await tx`
      update zro.conexoes set access_token_enc = ${selar(chave.tokens, novo.accessToken, ctxToken(ctx.userId, 'access'))},
             access_expira_em = ${novo.expiraEm}, atualizada_em = now()
             ${novo.refreshToken ? tx`, refresh_token_enc = ${selar(chave.tokens, novo.refreshToken, ctxToken(ctx.userId, 'refresh'))}` : tx``}
       where provedor = 'google'`
    return { conexao, token: novo.accessToken }
  })
  if ('erro' in r) throw semConexao(cfg, r.erro)
  return r
}

async function marcarReconectar(tx: Tx, ctx: UserContext, motivo: 'invalid_grant' | 'chave' | 'permissao'): Promise<void> {
  await tx`
    update zro.conexoes set estado = 'reconectar', refresh_token_enc = null, access_token_enc = null, access_expira_em = null, atualizada_em = now()
     where provedor = 'google'`
  await audit(tx, { actorUserId: ctx.userId, action: 'conexao.reconectar', targetType: 'conexao', targetId: 'google', metadata: { motivo } })
}

/** O Google tirou a permissão (403 insufficientPermissions): a conexão pede para conectar de novo. */
export async function conexaoPerdeuPermissao(db: Database, ctx: UserContext): Promise<void> {
  await db.asUser(ctx, (tx) => marcarReconectar(tx, ctx, 'permissao'))
}

/** Chamada à API do Google com o token da pessoa: 401 renova uma vez e tenta de novo. */
export async function noGoogle(
  db: Database,
  cfg: GoogleAgendaConfig,
  chave: ChaveConexoes,
  ctx: UserContext,
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  caminho: string,
  corpo?: unknown,
): Promise<Resposta & { conexao: ConexaoGoogle }> {
  const chamar = (token: string) =>
    pedir(cfg, `${cfg.apiBase}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
  let a = await acessoGoogle(db, cfg, chave, ctx)
  let r = await chamar(a.token)
  if (r.status === 401) {
    a = await acessoGoogle(db, cfg, chave, ctx, { forcar: true })
    r = await chamar(a.token)
    if (r.status === 401) {
      await db.asUser(ctx, (tx) => marcarReconectar(tx, ctx, 'invalid_grant'))
      throw semConexao(cfg, 'reconectar')
    }
  }
  if (r.status === 403 || r.status === 429) {
    const erros = ((r.corpo?.error as Record<string, unknown> | undefined)?.errors as { reason?: string }[] | undefined) ?? []
    const razao = erros[0]?.reason ?? ''
    if (r.status === 429 || /rateLimit/i.test(razao)) throw new DomainError('rate_limited', 'O Google pediu uma pausa. Tente de novo em instantes.')
    if (razao === 'insufficientPermissions') {
      await conexaoPerdeuPermissao(db, ctx)
      throw semConexao(cfg, 'reconectar')
    }
  }
  if (r.status >= 500) throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
  return { ...r, conexao: a.conexao }
}

// ───────────── tela /conexoes ─────────────

export type AppDaConexao = { app: string; nome: string; ativo: boolean; usadoEm: Date | null }
export type MinhasConexoes = { google: ConexaoGoogle | null; apps: AppDaConexao[] }

/** O que a tela mostra. Apps: os que usam a Agenda e a pessoa já abriu, mais qualquer um que já usou. */
export async function minhasConexoes(db: Database, auth: Authenticated): Promise<MinhasConexoes> {
  return db.asUser(ctxDe(auth), async (tx) => {
    const [l] = await tx`select id, conta_email, estado, calendarios, criada_em, usada_em from zro.conexoes where provedor = 'google'`
    const google = l ? linhaParaConexao(l) : null
    const apps = await tx`
      with candidatos as (
        select distinct a.product_id as app from zro.app_accounts a where a.product_id = any (${[...APPS_COM_AGENDA]}::text[])
        union
        select ca.app from zro.conexao_apps ca join zro.conexoes c on c.id = ca.conexao_id where c.provedor = 'google'
      )
      select k.app, p.name as nome, coalesce(ca.ativo, true) as ativo, ca.usado_em
        from candidatos k join zro.products p on p.id = k.app
        left join zro.conexao_apps ca on ca.app = k.app and ca.conexao_id = ${google?.id ?? null}::uuid
       order by p.name`
    return {
      google,
      apps: apps.map((a) => ({ app: a.app as string, nome: a.nome as string, ativo: !!a.ativo, usadoEm: (a.usado_em as Date) ?? null })),
    }
  })
}

export type Calendario = { id: string; nome: string; principal: boolean; cor: string | null; escolhido: boolean }

/** As agendas da conta Google (calendarList). A principal entra como `primary`. */
export async function calendariosGoogle(db: Database, cfg: GoogleAgendaConfig, chave: ChaveConexoes, auth: Authenticated): Promise<Calendario[]> {
  const r = await noGoogle(db, cfg, chave, ctxDe(auth), 'GET', '/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=100')
  if (r.status !== 200) throw new DomainError('upstream_unavailable', 'Não deu para ler suas agendas agora.')
  const itens = Array.isArray(r.corpo?.items) ? (r.corpo.items as Record<string, unknown>[]) : []
  const escolhidos = new Set(r.conexao.calendarios)
  return itens
    .filter((c) => typeof c.id === 'string' && c.deleted !== true)
    .slice(0, 100)
    .map((c) => {
      const principal = c.primary === true
      const id = principal ? 'primary' : (c.id as string)
      return {
        id,
        nome: String(c.summaryOverride ?? c.summary ?? 'Agenda').slice(0, 120),
        principal,
        cor: typeof c.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(c.backgroundColor) ? c.backgroundColor : null,
        escolhido: escolhidos.has(id),
      }
    })
    .sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Quais agendas contam (só as que a conta Google tem; ao menos uma). */
export async function escolherCalendarios(db: Database, cfg: GoogleAgendaConfig, chave: ChaveConexoes, auth: Authenticated, ids: string[]): Promise<string[]> {
  const existentes = new Set((await calendariosGoogle(db, cfg, chave, auth)).map((c) => c.id))
  const escolha = [...new Set(ids)].filter((id) => existentes.has(id)).slice(0, 20)
  if (!escolha.length) throw new DomainError('invalid_input', 'Escolha ao menos uma agenda.')
  await db.asUser(ctxDe(auth), async (tx) => {
    await tx`update zro.conexoes set calendarios = ${escolha}, atualizada_em = now() where provedor = 'google'`
    await audit(tx, { actorUserId: auth.user.id, action: 'conexao.agendas', targetType: 'conexao', targetId: 'google', metadata: { n: escolha.length } })
  })
  return escolha
}

/** Liga ou desliga um app na conexão da pessoa. */
export async function alternarAppDaConexao(db: Database, auth: Authenticated, app: string, ativo: boolean): Promise<void> {
  if (!/^[a-z0-9-]{1,40}$/.test(app)) throw new DomainError('invalid_input', 'App inválido.')
  await db.asUser(ctxDe(auth), async (tx) => {
    const [c] = await tx`select id from zro.conexoes where provedor = 'google'`
    if (!c) throw new DomainError('not_found', 'Conecte o Google Agenda primeiro.')
    const [p] = await tx`select 1 from zro.products where id = ${app}`
    if (!p) throw new DomainError('invalid_input', 'App inválido.')
    await tx`
      insert into zro.conexao_apps (conexao_id, app, ativo) values (${c.id as string}, ${app}, ${ativo})
      on conflict (conexao_id, app) do update set ativo = excluded.ativo, atualizado_em = now()`
    await audit(tx, { actorUserId: auth.user.id, action: 'conexao.app', targetType: 'conexao', targetId: 'google', metadata: { app, ativo } })
  })
}

/** Desconectar: revoga no Google (melhor esforço) e apaga a conexão e os tokens. */
export async function desconectarGoogle(
  db: Database,
  cfg: GoogleAgendaConfig | null,
  chave: ChaveConexoes | null,
  auth: Authenticated,
): Promise<{ revogadaNoGoogle: boolean }> {
  const ctx = ctxDe(auth)
  const tokens = await db.asUser(ctx, async (tx) => {
    const [l] = await tx`select refresh_token_enc, access_token_enc from zro.conexoes where provedor = 'google'`
    if (!l) return null
    return {
      rt: chave ? abrir(chave.tokens, l.refresh_token_enc as string, ctxToken(ctx.userId, 'refresh')) : null,
      at: chave ? abrir(chave.tokens, l.access_token_enc as string, ctxToken(ctx.userId, 'access')) : null,
    }
  })
  if (!tokens) return { revogadaNoGoogle: false }
  const alvo = tokens.rt ?? tokens.at
  const revogadaNoGoogle = !!(cfg && alvo) && (await revogarNoGoogle(cfg, alvo))
  await db.asUser(ctx, async (tx) => {
    await tx`delete from zro.conexoes where provedor = 'google'`
    await audit(tx, {
      actorUserId: ctx.userId,
      action: 'conexao.desligada',
      targetType: 'conexao',
      targetId: 'google',
      metadata: { revogada_no_google: revogadaNoGoogle },
    })
  })
  return { revogadaNoGoogle }
}

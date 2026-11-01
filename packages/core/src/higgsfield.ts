/**
 * Higgsfield nas Conexões (pedido do titular, 01/11/2026; migration 0051). Como o Google Agenda (ADR 0026): a pessoa
 * conecta a conta da Higgsfield UMA vez na conta Absolute ZRO e os apps da família (AEON, Rift Motion) geram imagem e
 * vídeo com os créditos do plano dela, pelo HUB, com o token da pessoa (escopo `zro.higgsfield`). O desenho vem do Rift
 * Motion (products/rift-motion/api/_higgsfield.js): três opções de gasto com o preço que a Higgsfield informa antes,
 * prévias em imagem (bem mais baratas) antes de animar, e o saldo e o extrato da conta.
 *
 * - Login: OAuth (código + PKCE S256) no servidor de login da Higgsfield; o HUB se registra como app na primeira vez
 *   (registro dinâmico, RFC 7591) e guarda o client_id em `zro.apps_oauth_externos`. Os tokens só cifrados
 *   (ZRO_CONEXOES_KEY, contexto amarrado à pessoa e ao campo), renovados no servidor com a linha travada; a
 *   Higgsfield recusando o refresh = `reconectar`.
 * - As ferramentas são as do MCP da Higgsfield (balance, transactions, generate_image, generate_video, media_upload,
 *   media_confirm, jobs_wait), com o token da pessoa. Nada aqui inventa estado nem preço: o que o app mostra é o que a
 *   Higgsfield respondeu. Sem preço ou sem saldo que cubra, não gera.
 * - Cada pedido fica em `zro.ia_geracoes` com o custo informado antes (o "quanto já foi usado" por app e no mês). Gerar
 *   só acontece quando a pessoa toca em gerar no app; nunca repete sozinho um pedido que pode ter saído.
 * - O arquivo vai do aparelho direto para o armazenamento da Higgsfield (URL pré-assinada) e o resultado volta da CDN
 *   dela para o aparelho: o HUB só segura a credencial e o registro.
 */
import { createHash, randomBytes } from 'node:crypto'
import { registerAttempt, withinLimit, type Authenticated, type Rule } from '@zro/auth'
import type { Database, Tx, UserContext } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { authorize } from './authz'
import { abrir, selar, type ChaveConexoes } from './conexoes'

export const ESCOPO_HIGGSFIELD = 'zro.higgsfield'
/** Apps da família que geram com a Higgsfield pelo HUB. */
export const APPS_COM_HIGGSFIELD = ['ai-edit', 'rift-motion'] as const
export const HIGGSFIELD_LOGIN = 'https://clerk.higgsfield.ai'
export const HIGGSFIELD_MCP = 'https://mcp.higgsfield.ai/mcp'
const ESCOPOS = 'openid email offline_access'
const PENDENTE_TTL_MS = 10 * 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_GERACAO = /^[a-z0-9]{12}$/
const IMG_URL = /^https:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i
const VID_URL = /^https:\/\/\S+\.(mp4|mov|webm)(\?\S*)?$/i

export const LIMITE_HF_LEITURA: Rule = { max: 120, windowMs: 10 * 60_000 }
/** Acompanhar um pedido (uma leitura a cada poucos segundos enquanto a Higgsfield gera): balde próprio, mais largo. */
export const LIMITE_HF_ANDAMENTO: Rule = { max: 600, windowMs: 10 * 60_000 }
export const LIMITE_HF_GERACAO: Rule = { max: 30, windowMs: 10 * 60_000 }

export type HiggsfieldConfig = {
  login: string
  mcp: string
  /** A volta do login: <hub>/conexoes/higgsfield/retorno */
  redirectUri: string
  /** Onde a pessoa conecta (o app manda para cá): <hub>/conexoes */
  conexoesUrl: string
  fetch?: typeof fetch
  timeoutMs?: number
}
export type AmbienteHiggsfield = { cfg: HiggsfieldConfig; chave: ChaveConexoes }

/** Os endereços da Higgsfield (ou de um servidor falso nos testes). */
export const higgsfieldUrls = (base?: string | null): Pick<HiggsfieldConfig, 'login' | 'mcp'> =>
  base ? { login: base.replace(/\/$/, ''), mcp: `${base.replace(/\/$/, '')}/mcp` } : { login: HIGGSFIELD_LOGIN, mcp: HIGGSFIELD_MCP }

// ───────────── as três opções e as prévias ─────────────

export type OpcaoHiggsfield = {
  id: 'rapido' | 'equilibrado' | 'maximo'
  nome: string
  desc: string
  modelo: string
  segundos: { curto: number; longo: number }
  extra: Record<string, unknown>
}

/**
 * As três opções de gasto (imagem → vídeo, sem som: o som vem do editor e do NOSSOM). O custo de cada uma vem da
 * Higgsfield na hora (`get_cost`), nunca de uma tabela daqui. As mesmas do Rift Motion.
 */
export const OPCOES_HIGGSFIELD: readonly OpcaoHiggsfield[] = Object.freeze([
  { id: 'rapido', nome: 'Rápido', desc: 'Prévia ágil para testar a ideia', modelo: 'grok_video_v15_lite', segundos: { curto: 5, longo: 10 }, extra: {} },
  {
    id: 'equilibrado',
    nome: 'Equilibrado',
    desc: 'Movimento de cinema, ótimo custo',
    modelo: 'kling2_6',
    segundos: { curto: 5, longo: 10 },
    extra: { sound: false },
  },
  {
    id: 'maximo',
    nome: 'Máxima qualidade',
    desc: 'Mais detalhe, física e acabamento',
    modelo: 'kling3_0',
    segundos: { curto: 5, longo: 10 },
    extra: { mode: 'pro', sound: 'off' },
  },
])
export const opcaoHiggsfield = (id: unknown) => OPCOES_HIGGSFIELD.find((o) => o.id === id) ?? null
/** As telas antes do vídeo: o modelo mais barato que aceita a imagem de referência (GPT Image 2.5 Flare, baixa). */
export const IMAGEM_HIGGSFIELD = Object.freeze({ modelo: 'gpt_image_2_5', extra: { variant: 'flare', quality: 'low' } })
export const PROPORCOES = ['16:9', '9:16', '1:1', '4:5'] as const
export const DURACOES = ['curto', 'longo'] as const
export const QUANTIDADES_IMAGEM = [1, 2, 4] as const

const ESTADOS: Record<string, EstadoGeracao> = {
  queued: 'na_fila',
  pending: 'na_fila',
  in_progress: 'gerando',
  processing: 'gerando',
  running: 'gerando',
  completed: 'pronto',
  succeeded: 'pronto',
  done: 'pronto',
  failed: 'falhou',
  error: 'falhou',
  nsfw: 'recusado',
  canceled: 'cancelado',
  cancelled: 'cancelado',
}
export type EstadoGeracao = 'na_fila' | 'gerando' | 'pronto' | 'falhou' | 'recusado' | 'cancelado'
export const estadoHiggsfield = (s: unknown): EstadoGeracao | null => ESTADOS[String(s ?? '').toLowerCase()] ?? null
export const terminal = (e: EstadoGeracao) => e === 'pronto' || e === 'falhou' || e === 'recusado' || e === 'cancelado'

/** Começo do mês no fuso de Fortaleza (UTC−3, sem horário de verão), como a franquia do ecossistema. */
export function inicioDoMes(agora = new Date()): Date {
  const local = new Date(agora.getTime() - 3 * 3_600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3, 0, 0))
}

// ───────────── erros ─────────────

export const semConexaoHiggsfield = (cfg: Pick<HiggsfieldConfig, 'conexoesUrl'>, motivo: 'nenhuma' | 'reconectar') =>
  new DomainError(
    'sem_conexao',
    motivo === 'reconectar' ? 'A Higgsfield pediu para conectar de novo na sua conta Absolute ZRO.' : 'Conecte a Higgsfield na sua conta Absolute ZRO.',
    { motivo, conectar: cfg.conexoesUrl, provedor: 'higgsfield' },
  )
const foraDoAr = () => new DomainError('upstream_unavailable', 'A Higgsfield não respondeu agora. Tente de novo.')
class Recusada extends Error {}

// ───────────── chamadas à Higgsfield ─────────────

async function pedir(cfg: HiggsfieldConfig, url: string, init: RequestInit): Promise<Response> {
  try {
    return await (cfg.fetch ?? fetch)(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(cfg.timeoutMs ?? 25_000) })
  } catch {
    throw foraDoAr()
  }
}

/** O registro do HUB como app na Higgsfield, um por endereço de volta (registro dinâmico, RFC 7591). */
export async function clienteHiggsfield(db: Database, cfg: HiggsfieldConfig): Promise<string> {
  const [r] = await db.asSystem(
    'higgsfield: cliente',
    (tx) => tx`select client_id from zro.apps_oauth_externos where servico = 'higgsfield' and redirect = ${cfg.redirectUri}`,
  )
  if (r) return r.client_id as string
  const res = await pedir(cfg, `${cfg.login}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Absolute ZRO',
      redirect_uris: [cfg.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: ESCOPOS,
    }),
  })
  const d = (await res.json().catch(() => null)) as { client_id?: unknown } | null
  if (!res.ok || typeof d?.client_id !== 'string' || d.client_id.length > 200)
    throw new DomainError('upstream_unavailable', 'A Higgsfield não aceitou o registro da Absolute ZRO.')
  const clientId = d.client_id
  await db.asSystem(
    'higgsfield: cliente',
    (tx) => tx`
    insert into zro.apps_oauth_externos (servico, redirect, client_id) values ('higgsfield', ${cfg.redirectUri}, ${clientId})
    on conflict (servico, redirect) do update set client_id = excluded.client_id`,
  )
  return clientId
}

export type PendenteHiggsfield = { state: string; verifier: string; uid: string; exp: number; clientId: string }
const CTX_PENDENTE = 'zro.conexoes.higgsfield.pendente'

/** A ida ao login da Higgsfield: state e PKCE S256, presos à pessoa que começou (cookie cifrado de 10 min). */
export function inicioConexaoHiggsfield(
  cfg: HiggsfieldConfig,
  clientId: string,
  userId: string,
  agora = Date.now(),
): { url: string; pendente: PendenteHiggsfield } {
  const pendente: PendenteHiggsfield = {
    state: randomBytes(24).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    uid: userId,
    exp: agora + PENDENTE_TTL_MS,
    clientId,
  }
  const u = new URL(`${cfg.login}/oauth/authorize`)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', cfg.redirectUri)
  u.searchParams.set('scope', ESCOPOS)
  u.searchParams.set('state', pendente.state)
  u.searchParams.set('code_challenge', createHash('sha256').update(pendente.verifier).digest('base64url'))
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('resource', cfg.mcp)
  return { url: u.toString(), pendente }
}
export const selarPendenteHiggsfield = (chave: ChaveConexoes, p: PendenteHiggsfield) => selar(chave.cookie, JSON.stringify(p), CTX_PENDENTE)
export function abrirPendenteHiggsfield(chave: ChaveConexoes, raw: string | null | undefined, agora = Date.now()): PendenteHiggsfield | null {
  const t = abrir(chave.cookie, raw, CTX_PENDENTE)
  if (!t) return null
  try {
    const p = JSON.parse(t) as PendenteHiggsfield
    return p && typeof p.state === 'string' && typeof p.verifier === 'string' && typeof p.uid === 'string' && typeof p.clientId === 'string' && p.exp > agora
      ? p
      : null
  } catch {
    return null
  }
}

type Tokens = { access: string; refresh: string | null; expiraEm: Date; idToken: string | null }

async function token(cfg: HiggsfieldConfig, corpo: Record<string, string>): Promise<Tokens> {
  const res = await pedir(cfg, `${cfg.login}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo).toString(),
  })
  const d = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (res.status === 400 || res.status === 401) throw new Recusada()
  if (!res.ok || typeof d?.access_token !== 'string') throw foraDoAr()
  return {
    access: d.access_token,
    refresh: typeof d.refresh_token === 'string' ? d.refresh_token : (corpo.refresh_token ?? null),
    expiraEm: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000),
    idToken: typeof d.id_token === 'string' ? d.id_token : null,
  }
}

/** E-mail e sub do id_token só como rótulo na tela ("conectada como …"). Não decidem nada. */
function rotuloDoIdToken(idToken: string | null): { email: string | null; sub: string | null } {
  try {
    const d = JSON.parse(Buffer.from(String(idToken).split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>
    return { email: typeof d.email === 'string' ? d.email.slice(0, 120) : null, sub: typeof d.sub === 'string' ? d.sub.slice(0, 200) : null }
  } catch {
    return { email: null, sub: null }
  }
}

const ctxToken = (userId: string, campo: 'refresh' | 'access') => `conexao:${userId}:higgsfield:${campo}`
const ctxDe = (auth: Authenticated): UserContext => ({ userId: auth.user.id, orgId: auth.session.activeOrgId })

/** A volta do login: confere state e pessoa, troca o código (PKCE) e guarda a conexão com os tokens cifrados. */
export async function concluirConexaoHiggsfield(
  db: Database,
  amb: AmbienteHiggsfield,
  auth: Authenticated,
  pendente: PendenteHiggsfield | null,
  q: { code: string | null; state: string | null; error: string | null },
): Promise<void> {
  if (!pendente || pendente.uid !== auth.user.id || !q.state || q.state !== pendente.state)
    throw new DomainError('external_resource_denied', 'O login da Higgsfield expirou. Tente de novo.', { motivo: 'expirou' })
  if (q.error || !q.code) throw new DomainError('external_resource_denied', 'A conexão com a Higgsfield foi cancelada.', { motivo: 'cancelado' })
  let t: Tokens
  try {
    t = await token(amb.cfg, {
      grant_type: 'authorization_code',
      code: q.code,
      redirect_uri: amb.cfg.redirectUri,
      client_id: pendente.clientId,
      code_verifier: pendente.verifier,
      resource: amb.cfg.mcp,
    })
  } catch (e) {
    if (e instanceof Recusada) throw new DomainError('external_resource_denied', 'A Higgsfield não aceitou o login. Tente de novo.', { motivo: 'higgsfield' })
    throw e
  }
  if (!t.refresh) throw new DomainError('external_resource_denied', 'A Higgsfield não deixou a conexão ficar ativa. Tente de novo.', { motivo: 'sem_refresh' })
  const { email, sub } = rotuloDoIdToken(t.idToken)
  const ctx = ctxDe(auth)
  await db.asUser(ctx, async (tx) => {
    const [atual] = await tx`select id from zro.conexoes where provedor = 'higgsfield' for update`
    await tx`
      insert into zro.conexoes (user_id, provedor, conta_email, conta_sub, escopos, refresh_token_enc, access_token_enc, access_expira_em, cliente)
      values (${ctx.userId}, 'higgsfield', ${email || 'Conta Higgsfield'}, ${sub || 'higgsfield'}, ${ESCOPOS.split(' ')},
              ${selar(amb.chave.tokens, t.refresh!, ctxToken(ctx.userId, 'refresh'))}, ${selar(amb.chave.tokens, t.access, ctxToken(ctx.userId, 'access'))}, ${t.expiraEm}, ${pendente.clientId})
      on conflict (user_id, provedor) do update set
        conta_email = excluded.conta_email, conta_sub = excluded.conta_sub, escopos = excluded.escopos, refresh_token_enc = excluded.refresh_token_enc,
        access_token_enc = excluded.access_token_enc, access_expira_em = excluded.access_expira_em, cliente = excluded.cliente, estado = 'ativa', atualizada_em = now()`
    await audit(tx, {
      actorUserId: ctx.userId,
      action: 'conexao.ligada',
      targetType: 'conexao',
      targetId: 'higgsfield',
      metadata: { provedor: 'higgsfield', troca: !!atual },
    })
  })
}

async function marcarReconectar(tx: Tx, ctx: UserContext, motivo: string): Promise<void> {
  await tx`
    update zro.conexoes set estado = 'reconectar', refresh_token_enc = null, access_token_enc = null, access_expira_em = null, atualizada_em = now()
     where provedor = 'higgsfield'`
  await audit(tx, { actorUserId: ctx.userId, action: 'conexao.reconectar', targetType: 'conexao', targetId: 'higgsfield', metadata: { motivo } })
}

/** O access token válido da pessoa: o guardado, se vale mais dois minutos; senão renova com a linha travada. */
async function acesso(db: Database, amb: AmbienteHiggsfield, ctx: UserContext, forcar = false): Promise<string> {
  type Saida = { erro: 'nenhuma' | 'reconectar' } | { token: string }
  const r = await db.asUser(ctx, async (tx): Promise<Saida> => {
    const [l] = await tx`select * from zro.conexoes where provedor = 'higgsfield' for update`
    if (!l) return { erro: 'nenhuma' }
    if (l.estado !== 'ativa') return { erro: 'reconectar' }
    const at = abrir(amb.chave.tokens, l.access_token_enc as string, ctxToken(ctx.userId, 'access'))
    if (!forcar && at && l.access_expira_em && (l.access_expira_em as Date).getTime() - 120_000 > Date.now()) return { token: at }
    const rt = abrir(amb.chave.tokens, l.refresh_token_enc as string, ctxToken(ctx.userId, 'refresh'))
    if (!rt || !l.cliente) {
      await marcarReconectar(tx, ctx, 'chave')
      return { erro: 'reconectar' }
    }
    let novo: Tokens
    try {
      novo = await token(amb.cfg, { grant_type: 'refresh_token', refresh_token: rt, client_id: l.cliente as string, resource: amb.cfg.mcp })
    } catch (e) {
      if (!(e instanceof Recusada)) throw e
      await marcarReconectar(tx, ctx, 'invalid_grant')
      return { erro: 'reconectar' }
    }
    await tx`
      update zro.conexoes set access_token_enc = ${selar(amb.chave.tokens, novo.access, ctxToken(ctx.userId, 'access'))}, access_expira_em = ${novo.expiraEm},
             refresh_token_enc = ${selar(amb.chave.tokens, novo.refresh ?? rt, ctxToken(ctx.userId, 'refresh'))}, atualizada_em = now()
       where provedor = 'higgsfield'`
    return { token: novo.access }
  })
  if ('erro' in r) throw semConexaoHiggsfield(amb.cfg, r.erro)
  return r.token
}

// ───────────── MCP da Higgsfield ─────────────

let rpcId = 0
type Mensagem = {
  id?: number
  result?: { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean }
  error?: { message?: string }
}

/** Uma sessão no MCP da Higgsfield com o token da pessoa (várias ferramentas na mesma sessão). */
export class SessaoHiggsfield {
  private sid: string | null = null
  constructor(
    private cfg: HiggsfieldConfig,
    private token: string,
  ) {}

  private async rpc(corpo: Record<string, unknown>): Promise<Mensagem | null> {
    const res = await pedir(this.cfg, this.cfg.mcp, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
        ...(this.sid ? { 'Mcp-Session-Id': this.sid } : {}),
      },
      body: JSON.stringify(corpo),
    })
    if (res.status === 401 || res.status === 403) throw new Recusada()
    this.sid = res.headers.get('mcp-session-id') || this.sid
    if (res.status === 202 || corpo.id === undefined) return null
    const texto = await res.text()
    if (!res.ok) throw new DomainError('upstream_unavailable', 'A Higgsfield recusou o pedido.')
    let msg: Mensagem | null = null
    if (/text\/event-stream/i.test(res.headers.get('content-type') || '')) {
      for (const linha of texto.split(/\r?\n/)) {
        if (!linha.startsWith('data:')) continue
        try {
          const d = JSON.parse(linha.slice(5).trim()) as Mensagem
          if (d && d.id === corpo.id) msg = d
        } catch {
          // linha de evento que não é JSON: ignora
        }
      }
    } else
      try {
        msg = JSON.parse(texto) as Mensagem
      } catch {
        // fica null: cai no erro de formato abaixo
      }
    if (!msg) throw new DomainError('upstream_unavailable', 'Resposta da Higgsfield fora do formato.')
    return msg
  }

  async abrir(): Promise<this> {
    const ini = await this.rpc({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'absolute-zro', version: '1.0.0' } },
    })
    if (ini?.error) throw new DomainError('upstream_unavailable', 'A Higgsfield recusou a conexão.')
    await this.rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
    return this
  }

  /** Chama uma ferramenta e devolve o JSON do resultado. Erro da ferramenta vira recusa com a mensagem dela. */
  async chamar(nome: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const msg = (await this.rpc({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: nome, arguments: args } }))!
    if (msg.error) throw new DomainError('invalid_input', String(msg.error.message || 'A Higgsfield recusou o pedido.').slice(0, 300))
    const res = msg.result || {}
    const texto = (res.content || [])
      .filter((c) => c?.type === 'text')
      .map((c) => c.text)
      .join('\n')
    if (res.isError) throw new DomainError('invalid_input', texto.slice(0, 300) || 'A Higgsfield recusou o pedido.')
    if (res.structuredContent && typeof res.structuredContent === 'object') return res.structuredContent as Record<string, unknown>
    try {
      return JSON.parse(texto) as Record<string, unknown>
    } catch {
      const m = texto.match(/\{[\s\S]*\}/)
      if (m)
        try {
          return JSON.parse(m[0]) as Record<string, unknown>
        } catch {
          // não era JSON: devolve o texto
        }
      return { texto }
    }
  }
}

/** Procura no JSON (qualquer profundidade) o primeiro valor que passa no teste. */
export function achar(obj: unknown, teste: (k: string, v: unknown) => boolean, prof = 0): unknown {
  if (obj == null || prof > 8) return undefined
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const a = achar(v, teste, prof + 1)
      if (a !== undefined) return a
    }
    return undefined
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) if (teste(k, v)) return v
    for (const v of Object.values(obj)) {
      const a = achar(v, teste, prof + 1)
      if (a !== undefined) return a
    }
  }
  return undefined
}

/** Todos os valores (qualquer profundidade) que passam no teste, na ordem, sem repetir. */
export function todos(obj: unknown, teste: (k: string, v: unknown) => boolean, prof = 0, saida: unknown[] = []): unknown[] {
  if (obj == null || prof > 8) return saida
  if (Array.isArray(obj)) obj.forEach((v) => todos(v, teste, prof + 1, saida))
  else if (typeof obj === 'object')
    for (const [k, v] of Object.entries(obj)) {
      if (teste(k, v) && !saida.includes(v)) saida.push(v)
      else todos(v, teste, prof + 1, saida)
    }
  return saida
}

/** Um número de créditos que a Higgsfield mandou; ausente, vazio ou inválido = null (nunca vira 0). */
const numero = (v: unknown): number | null => {
  if (typeof v !== 'number' && typeof v !== 'string') return null
  if (typeof v === 'string' && !v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}
const custoDe = (d: Record<string, unknown>) => {
  const c = d.cost as Record<string, unknown> | undefined
  return numero(c?.credits_exact ?? c?.credits)
}
const paramsImagem = (prompt: string, quantidade: number, proporcao: string, ref: string | null) => ({
  model: IMAGEM_HIGGSFIELD.modelo,
  prompt,
  count: quantidade,
  aspect_ratio: proporcao,
  use_unlim: false,
  ...(ref ? { medias: [{ role: 'image_references', value: ref }] } : {}),
  ...IMAGEM_HIGGSFIELD.extra,
})
const paramsVideo = (op: OpcaoHiggsfield, segundos: number, prompt: string, ref: string | null) => ({
  model: op.modelo,
  prompt,
  duration: segundos,
  count: 1,
  use_unlim: false,
  ...(ref ? { medias: [{ role: 'start_image', value: ref }] } : {}),
  ...op.extra,
})

async function saldo(s: SessaoHiggsfield): Promise<{ creditos: number | null; plano: string | null }> {
  const d = await s.chamar('balance', {})
  return {
    creditos: numero(d.credits ?? achar(d, (k, v) => /^credits$/i.test(k) && typeof v === 'number')),
    plano: typeof d.subscription_plan_type === 'string' ? d.subscription_plan_type.slice(0, 60) : null,
  }
}

/** Créditos gastos na Higgsfield desde `desde` (gastos menos devoluções), pelo extrato (até 500 lançamentos). */
async function usoDesde(s: SessaoHiggsfield, desde: Date): Promise<number> {
  let usado = 0
  let cursor: unknown
  for (let pagina = 0; pagina < 5; pagina++) {
    const d = await s.chamar('transactions', { size: 100, ...(cursor != null ? { cursor } : {}) })
    const itens = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
    let antigo = false
    for (const t of itens) {
      if (new Date(String(t.created_at)) < desde) {
        antigo = true
        break
      }
      const c = Number(t.credits)
      if (Number.isFinite(c) && ['spend', 'deduct', 'refund'].includes(String(t.action))) usado -= c
    }
    if (antigo || d.next_cursor == null || !itens.length) break
    cursor = d.next_cursor
  }
  return Math.max(0, Math.round(usado * 100) / 100)
}

const semFalha = <T>(p: Promise<T>): Promise<T | null> =>
  p.catch((e) => {
    if (e instanceof Recusada) throw e
    return null
  })

// ───────────── os apps (token com zro.higgsfield) ─────────────

type Preparado = { app: string; ctx: UserContext; orgId: string }

/** Autoriza o app (identidade → organização → gate do app), aplica o limite e confere a conexão e o app ligado. */
async function prepararApp(
  db: Database,
  amb: AmbienteHiggsfield | null,
  auth: Authenticated | null,
  tipo: 'leitura' | 'andamento' | 'geracao',
): Promise<Preparado> {
  const app = auth?.session.app?.productId ?? null
  // gasta créditos de verdade: só os apps que usam a Higgsfield (APPS_COM_HIGGSFIELD), não todo cliente com o escopo
  if (!auth || !app || !(APPS_COM_HIGGSFIELD as readonly string[]).includes(app))
    throw new DomainError('action_not_allowed', 'Só um app da família usa a Higgsfield pela API.', { erro: 'so_app' })
  const actor = await authorize(db, auth, { release: { productId: app } })
  const chave = `higgsfield:${tipo}:${app}:${actor.userId}`
  const ok = await db.asSystem('higgsfield: limite', async (tx) => {
    if (!(await withinLimit(tx, chave, tipo === 'geracao' ? LIMITE_HF_GERACAO : tipo === 'andamento' ? LIMITE_HF_ANDAMENTO : LIMITE_HF_LEITURA))) return false
    await registerAttempt(tx, chave)
    return true
  })
  if (!ok) throw new DomainError('rate_limited', 'Muitos pedidos à Higgsfield seguidos. Espere alguns minutos.')
  if (!amb) throw new DomainError('upstream_unavailable', 'As Conexões estão indisponíveis agora.')
  const ctx = { userId: actor.userId, orgId: actor.orgId }
  const [c] = await db.asUser(
    ctx,
    (tx) => tx`
    select c.estado, coalesce(a.ativo, true) as ativo
      from zro.conexoes c left join zro.conexao_apps a on a.conexao_id = c.id and a.app = ${app}
     where c.provedor = 'higgsfield'`,
  )
  if (!c) throw semConexaoHiggsfield(amb.cfg, 'nenhuma')
  if (c.estado !== 'ativa') throw semConexaoHiggsfield(amb.cfg, 'reconectar')
  if (!c.ativo) throw new DomainError('app_desligado', 'Este app está desligado nas Conexões da sua conta Absolute ZRO.', { conectar: amb.cfg.conexoesUrl })
  return { app, ctx, orgId: actor.orgId }
}

/** Uma sessão no MCP com o token da pessoa; a Higgsfield recusando o token renova uma vez, depois pede reconectar. */
async function comSessao<T>(db: Database, amb: AmbienteHiggsfield, ctx: UserContext, fn: (s: SessaoHiggsfield) => Promise<T>): Promise<T> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const token = await acesso(db, amb, ctx, tentativa > 0)
    try {
      return await fn(await new SessaoHiggsfield(amb.cfg, token).abrir())
    } catch (e) {
      if (!(e instanceof Recusada)) throw e
    }
  }
  await db.asUser(ctx, (tx) => marcarReconectar(tx, ctx, 'invalid_grant'))
  throw semConexaoHiggsfield(amb.cfg, 'reconectar')
}

/** Marca o uso (Usado por) e audita, sem prompt nem resultado. */
async function registrarUso(db: Database, p: Preparado, action: string, metadata: Record<string, unknown>): Promise<void> {
  await db.asUser(p.ctx, async (tx) => {
    const [c] = await tx`update zro.conexoes set usada_em = now() where provedor = 'higgsfield' returning id`
    if (c)
      await tx`
        insert into zro.conexao_apps (conexao_id, app, usado_em) values (${c.id as string}, ${p.app}, now())
        on conflict (conexao_id, app) do update set usado_em = now()`
    await audit(tx, { orgId: p.orgId, actorUserId: p.ctx.userId, action, targetType: 'higgsfield', targetId: p.app, metadata: { app: p.app, ...metadata } })
  })
}

/** O que já foi usado, pelo que os apps registraram: no mês por este app, no mês por todos e o total deste app. */
async function usoNoEcossistema(db: Database, p: Preparado) {
  const desde = inicioDoMes()
  const [r] = await db.asUser(
    p.ctx,
    (tx) => tx`
    select coalesce(sum(creditos) filter (where criada_em >= ${desde} and app = ${p.app}), 0)::float as app_mes,
           coalesce(sum(creditos) filter (where criada_em >= ${desde}), 0)::float as todos_mes,
           count(*) filter (where criada_em >= ${desde} and app = ${p.app})::int as app_pedidos_mes,
           coalesce(sum(creditos) filter (where app = ${p.app}), 0)::float as app_total
      from zro.ia_geracoes where estado not in ('falhou', 'recusado', 'cancelado')`,
  )
  return {
    appMes: Number(r?.app_mes ?? 0),
    todosMes: Number(r?.todos_mes ?? 0),
    pedidosMes: Number(r?.app_pedidos_mes ?? 0),
    appTotal: Number(r?.app_total ?? 0),
  }
}

export type PainelHiggsfield = {
  conectada: true
  conta: string
  plano: string | null
  saldo: number | null
  /** gasto na Higgsfield neste mês, pelo extrato dela (todos os lugares, inclusive fora da Absolute ZRO) */
  usoMes: number | null
  /** o que os apps registraram neste mês: este app e todos */
  usoApp: { mes: number; pedidos: number; total: number }
  usoApps: number
  imagens: { quantidade: number; creditos: number | null }[]
  opcoes: { id: string; nome: string; desc: string; segundos: number; creditos: number | null }[]
}

/**
 * O painel de créditos do app: saldo e plano, o gasto do mês (extrato da Higgsfield) e o que a Absolute ZRO registrou,
 * e o preço agora de cada coisa (prévias de 1, 2 e 4 telas e as três opções de vídeo, na duração e proporção pedidas),
 * sem gerar nada.
 */
export async function painelHiggsfield(
  db: Database,
  amb: AmbienteHiggsfield | null,
  auth: Authenticated | null,
  q: { duracao?: unknown; proporcao?: unknown } = {},
): Promise<PainelHiggsfield> {
  const p = await prepararApp(db, amb, auth, 'leitura')
  const duracao = DURACOES.includes(q.duracao as (typeof DURACOES)[number]) ? (q.duracao as (typeof DURACOES)[number]) : 'curto'
  const proporcao = PROPORCOES.includes(q.proporcao as (typeof PROPORCOES)[number]) ? String(q.proporcao) : '16:9'
  const [conta] = await db.asUser(p.ctx, (tx) => tx`select conta_email from zro.conexoes where provedor = 'higgsfield'`)
  const uso = await usoNoEcossistema(db, p)
  const r = await comSessao(db, amb!, p.ctx, async (s) => {
    const [sd, usoMes, ...custos] = await Promise.all([
      semFalha(saldo(s)),
      semFalha(usoDesde(s, inicioDoMes())),
      ...QUANTIDADES_IMAGEM.map((n) =>
        semFalha(
          s
            .chamar('generate_image', {
              context: 'Absolute ZRO: preço das telas antes de gerar.',
              params: { ...paramsImagem('estimate', n, proporcao, null), get_cost: true },
            })
            .then(custoDe),
        ),
      ),
      ...OPCOES_HIGGSFIELD.map((o) =>
        semFalha(
          s
            .chamar('generate_video', {
              context: 'Absolute ZRO: preço antes de gerar.',
              params: { ...paramsVideo(o, o.segundos[duracao], 'estimate', null), get_cost: true },
            })
            .then(custoDe),
        ),
      ),
    ])
    return { sd: sd as Awaited<ReturnType<typeof saldo>> | null, usoMes: usoMes as number | null, custos: custos as (number | null)[] }
  })
  return {
    conectada: true,
    conta: (conta?.conta_email as string) ?? 'Conta Higgsfield',
    plano: r.sd?.plano ?? null,
    saldo: r.sd?.creditos ?? null,
    usoMes: r.usoMes,
    usoApp: { mes: uso.appMes, pedidos: uso.pedidosMes, total: uso.appTotal },
    usoApps: uso.todosMes,
    imagens: QUANTIDADES_IMAGEM.map((n, i) => ({ quantidade: n, creditos: r.custos[i] ?? null })),
    opcoes: OPCOES_HIGGSFIELD.map((o, i) => ({
      id: o.id,
      nome: o.nome,
      desc: o.desc,
      segundos: o.segundos[duracao],
      creditos: r.custos[QUANTIDADES_IMAGEM.length + i] ?? null,
    })),
  }
}

/** Abre o envio de uma imagem de referência (o quadro do vídeo, uma tela escolhida): o aparelho manda direto. */
export async function envioHiggsfield(
  db: Database,
  amb: AmbienteHiggsfield | null,
  auth: Authenticated | null,
  conteudo: unknown,
): Promise<{ upload_url: string; headers: Record<string, string>; ref: string }> {
  const tipos: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  if (typeof conteudo !== 'string' || !tipos[conteudo]) throw new DomainError('invalid_input', 'Mande uma imagem JPG, PNG ou WebP.')
  const p = await prepararApp(db, amb, auth, 'geracao')
  return comSessao(db, amb!, p.ctx, async (s) => {
    const d = await s.chamar('media_upload', { filename: `absolute-zro.${tipos[conteudo]}`, content_type: conteudo })
    const up = (Array.isArray(d.uploads) ? d.uploads[0] : d) as Record<string, unknown>
    if (typeof up?.upload_url !== 'string' || !/^https:\/\//.test(up.upload_url) || !UUID.test(String(up.media_id ?? '')))
      throw new DomainError('upstream_unavailable', 'A Higgsfield não abriu o envio do arquivo.')
    return {
      upload_url: up.upload_url,
      headers: { 'Content-Type': typeof up.content_type === 'string' ? up.content_type : conteudo },
      ref: String(up.media_id),
    }
  })
}

const novoIdGeracao = () =>
  randomBytes(9)
    .toString('base64url')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .padEnd(12, 'x')
    .slice(0, 12)
const textoDoPrompt = (v: unknown, vazio: string) => {
  const t = String(v ?? '')
    .trim()
    .slice(0, 2000)
  if (!t) throw new DomainError('invalid_input', vazio)
  return t
}
const refValida = (v: unknown) => {
  if (v == null || v === '') return null
  if (!UUID.test(String(v))) throw new DomainError('invalid_input', 'Referência de imagem inválida.')
  return String(v)
}

/** Confirma o envio (uma segunda confirmação do mesmo arquivo não impede gerar). */
async function confirmarEnvio(s: SessaoHiggsfield, ref: string) {
  try {
    await s.chamar('media_confirm', { type: 'image', media_id: ref })
  } catch (e) {
    if (e instanceof Recusada) throw e
  }
}

/** Gera só sabendo o preço e com saldo que cubra (o que a Higgsfield informou agora). */
function conferirCusto(custo: number | null, saldo: number | null): asserts custo is number {
  if (custo == null || saldo == null)
    throw new DomainError('upstream_unavailable', 'A Higgsfield não informou o preço ou o saldo agora. Nada foi gerado; tente de novo.')
  if (custo > saldo) throw new DomainError('quota_exceeded', `Faltam créditos: custa ${custo} e você tem ${saldo}.`, { custo, saldo })
}

export type PedidoGerado = { id: string; estado: EstadoGeracao; creditos: number | null }

/**
 * As telas antes do vídeo (1, 2 ou 4 imagens no formato do projeto), com a imagem de referência quando houver. Confere
 * o preço e o saldo na Higgsfield antes; sem saldo que cubra, não gera.
 */
export async function telasHiggsfield(
  db: Database,
  amb: AmbienteHiggsfield | null,
  auth: Authenticated | null,
  corpo: Record<string, unknown>,
): Promise<PedidoGerado> {
  const prompt = textoDoPrompt(corpo.prompt, 'Descreva a imagem que você quer ver.')
  const quantidade = QUANTIDADES_IMAGEM.includes(Number(corpo.quantidade) as 1 | 2 | 4) ? Number(corpo.quantidade) : 2
  const proporcao = PROPORCOES.includes(corpo.proporcao as (typeof PROPORCOES)[number]) ? String(corpo.proporcao) : '16:9'
  const ref = refValida(corpo.ref)
  const p = await prepararApp(db, amb, auth, 'geracao')
  const { pedido, creditos } = await comSessao(db, amb!, p.ctx, async (s) => {
    const [sd, custo] = await Promise.all([
      saldo(s),
      s
        .chamar('generate_image', {
          context: 'Absolute ZRO: preço das telas.',
          params: { ...paramsImagem('estimate', quantidade, proporcao, null), get_cost: true },
        })
        .then(custoDe),
    ])
    conferirCusto(custo, sd.creditos)
    if (ref) await confirmarEnvio(s, ref)
    const d = await s.chamar('generate_image', { context: 'Absolute ZRO: as telas antes de animar.', params: paramsImagem(prompt, quantidade, proporcao, ref) })
    let jobs = todos(d, (k, v) => /^job_?id$/i.test(k) && typeof v === 'string' && UUID.test(v) && v !== ref)
    if (!jobs.length) jobs = todos(d.jobs ?? d.job ?? d, (k, v) => /^id$/i.test(k) && typeof v === 'string' && UUID.test(v) && v !== ref)
    if (!jobs.length)
      throw new DomainError(
        'upstream_unavailable',
        String(achar(d, (k, v) => /^(message|error|detail|texto)$/i.test(k) && typeof v === 'string') || 'A Higgsfield não confirmou o pedido.').slice(0, 300),
      )
    return { pedido: (jobs as string[]).slice(0, 4).join(','), creditos: custo }
  })
  const id = novoIdGeracao()
  await db.asUser(
    p.ctx,
    (tx) => tx`
    insert into zro.ia_geracoes (id, user_id, app, saida, modelo, prompt, quantidade, pedido, estado, creditos)
    values (${id}, ${p.ctx.userId}, ${p.app}, 'imagem', ${IMAGEM_HIGGSFIELD.modelo}, ${prompt}, ${quantidade}, ${pedido}, 'na_fila', ${creditos})`,
  )
  await registrarUso(db, p, 'higgsfield.telas', { quantidade, proporcao, creditos, com_referencia: !!ref })
  return { id, estado: 'na_fila', creditos }
}

/** Anima uma imagem (a tela escolhida ou o quadro do vídeo) numa das três opções. Confere preço e saldo antes. */
export async function animarHiggsfield(
  db: Database,
  amb: AmbienteHiggsfield | null,
  auth: Authenticated | null,
  corpo: Record<string, unknown>,
): Promise<PedidoGerado> {
  const op = opcaoHiggsfield(corpo.opcao)
  if (!op) throw new DomainError('invalid_input', 'Escolha uma das três opções.')
  const prompt = textoDoPrompt(corpo.prompt, 'Diga como a cena deve se mexer.')
  const duracao = op.segundos[DURACOES.includes(corpo.duracao as 'curto' | 'longo') ? (corpo.duracao as 'curto' | 'longo') : 'curto']
  const ref = refValida(corpo.ref)
  if (!ref) throw new DomainError('invalid_input', 'Escolha a imagem que vai ser animada.')
  const p = await prepararApp(db, amb, auth, 'geracao')
  const { pedido, creditos } = await comSessao(db, amb!, p.ctx, async (s) => {
    const [sd, custo] = await Promise.all([
      saldo(s),
      s
        .chamar('generate_video', { context: 'Absolute ZRO: preço antes de gerar.', params: { ...paramsVideo(op, duracao, 'estimate', null), get_cost: true } })
        .then(custoDe),
    ])
    conferirCusto(custo, sd.creditos)
    await confirmarEnvio(s, ref)
    const d = await s.chamar('generate_video', { context: 'Absolute ZRO: animar uma imagem.', params: paramsVideo(op, duracao, prompt, ref) })
    const ehJob = (re: RegExp) => (k: string, v: unknown) => re.test(k) && typeof v === 'string' && UUID.test(v) && v !== ref
    const job = achar(d, ehJob(/^job_?id$/i)) ?? achar(d.jobs ?? d.job ?? d, ehJob(/^id$/i))
    if (typeof job !== 'string')
      throw new DomainError(
        'upstream_unavailable',
        String(achar(d, (k, v) => /^(message|error|detail|texto)$/i.test(k) && typeof v === 'string') || 'A Higgsfield não confirmou o pedido.').slice(0, 300),
      )
    return { pedido: job, creditos: custo }
  })
  const id = novoIdGeracao()
  await db.asUser(
    p.ctx,
    (tx) => tx`
    insert into zro.ia_geracoes (id, user_id, app, saida, modelo, opcao, prompt, duracao, pedido, estado, creditos)
    values (${id}, ${p.ctx.userId}, ${p.app}, 'video', ${op.modelo}, ${op.id}, ${prompt}, ${duracao}, ${pedido}, 'na_fila', ${creditos})`,
  )
  await registrarUso(db, p, 'higgsfield.animar', { opcao: op.id, duracao, creditos })
  return { id, estado: 'na_fila', creditos }
}

export type Andamento = { estado: EstadoGeracao; saida: 'imagem' | 'video'; urls: string[]; erro: string | null }

/** O andamento que a Higgsfield informa (sem porcentagem inventada); pronto, guarda os endereços do resultado. */
export async function andamentoHiggsfield(db: Database, amb: AmbienteHiggsfield | null, auth: Authenticated | null, id: unknown): Promise<Andamento> {
  if (!ID_GERACAO.test(String(id ?? ''))) throw new DomainError('invalid_input', 'Pedido inválido.')
  const p = await prepararApp(db, amb, auth, 'andamento')
  const [g] = await db.asUser(
    p.ctx,
    (tx) => tx`select saida, pedido, estado, resultados, erro from zro.ia_geracoes where id = ${String(id)} and app = ${p.app}`,
  )
  if (!g) throw new DomainError('not_found', 'Pedido não encontrado.')
  const saida = g.saida as 'imagem' | 'video'
  if (terminal(g.estado as EstadoGeracao))
    return { estado: g.estado as EstadoGeracao, saida, urls: (g.resultados as string[]) ?? [], erro: (g.erro as string) ?? null }
  const ids = String(g.pedido)
    .split(',')
    .filter((x) => UUID.test(x))
  const d = await comSessao(db, amb!, p.ctx, (s) => s.chamar('jobs_wait', { jobs: ids.map((job_id, index) => ({ index, job_id })), timeout_seconds: 0 }))
  const estados = todos(d, (k, v) => /^status$/i.test(k) && typeof v === 'string')
    .map(estadoHiggsfield)
    .filter((e): e is EstadoGeracao => !!e)
  const padrao = saida === 'imagem' ? IMG_URL : VID_URL
  let urls = todos(d, (k, v) => /^raw_?url$/i.test(k) && typeof v === 'string' && padrao.test(v)) as string[]
  if (!urls.length) urls = todos(d, (_k, v) => typeof v === 'string' && padrao.test(v)) as string[]
  urls = urls.slice(0, saida === 'imagem' ? 4 : 1)
  const aberto = estados.some((e) => !terminal(e))
  const estado: EstadoGeracao = aberto
    ? estados.every((e) => e === 'na_fila')
      ? 'na_fila'
      : 'gerando'
    : urls.length
      ? 'pronto'
      : (estados.find((e) => e !== 'pronto') ?? (estados.length ? 'falhou' : 'gerando'))
  const erro =
    terminal(estado) && estado !== 'pronto'
      ? String(achar(d, (k, v) => /^(error|message|detail|reason)$/i.test(k) && typeof v === 'string') || '').slice(0, 300) || null
      : null
  const final = estado === 'pronto' ? urls : []
  await db.asUser(
    p.ctx,
    (tx) => tx`
    update zro.ia_geracoes set estado = ${estado}, resultados = ${tx.json(final)}, erro = ${erro}, atualizada_em = now() where id = ${String(id)}`,
  )
  return { estado, saida, urls: final, erro }
}

// ───────────── tela /conexoes ─────────────

export type ConexaoHiggsfield = { conta: string; estado: 'ativa' | 'reconectar'; criadaEm: Date; usadaEm: Date | null; usoMes: number }
export type AppDaHiggsfield = { app: string; nome: string; ativo: boolean; usadoEm: Date | null }

/**
 * O cartão da Higgsfield em /conexoes: a conta, os apps (os que usam e a pessoa abriu) e o que os apps gastaram no mês.
 * `visivel`: algum app que usa a Higgsfield existe para a pessoa (gate de lançamento, migration 0049). Sem nenhum, o
 * cartão não aparece (nada aponta para app não lançado).
 */
export async function minhaHiggsfield(
  db: Database,
  auth: Authenticated,
): Promise<{ visivel: boolean; conexao: ConexaoHiggsfield | null; apps: AppDaHiggsfield[] }> {
  const desde = inicioDoMes()
  return db.asUser(ctxDe(auth), async (tx) => {
    const [v] =
      await tx`select exists (select 1 from unnest(${[...APPS_COM_HIGGSFIELD]}::text[]) as a(app) where zro.release_visible(a.app, zro.current_user_id())) as visivel`
    const [l] = await tx`select id, conta_email, estado, criada_em, usada_em from zro.conexoes where provedor = 'higgsfield'`
    const [u] =
      await tx`select coalesce(sum(creditos), 0)::float as mes from zro.ia_geracoes where criada_em >= ${desde} and estado not in ('falhou', 'recusado', 'cancelado')`
    const apps = await tx`
      with candidatos as (
        select distinct a.product_id as app from zro.app_accounts a where a.product_id = any (${[...APPS_COM_HIGGSFIELD]}::text[])
        union
        select ca.app from zro.conexao_apps ca join zro.conexoes c on c.id = ca.conexao_id where c.provedor = 'higgsfield'
      )
      select k.app, p.name as nome, coalesce(ca.ativo, true) as ativo, ca.usado_em
        from candidatos k join zro.products p on p.id = k.app
        left join zro.conexao_apps ca on ca.app = k.app and ca.conexao_id = ${(l?.id as string) ?? null}::uuid
       where zro.release_visible(k.app, zro.current_user_id())
       order by p.name`
    return {
      visivel: !!v?.visivel,
      conexao: l
        ? {
            conta: l.conta_email as string,
            estado: l.estado as 'ativa' | 'reconectar',
            criadaEm: l.criada_em as Date,
            usadaEm: (l.usada_em as Date) ?? null,
            usoMes: Number(u?.mes ?? 0),
          }
        : null,
      apps: apps.map((a) => ({ app: a.app as string, nome: a.nome as string, ativo: !!a.ativo, usadoEm: (a.usado_em as Date) ?? null })),
    }
  })
}

/** O saldo e o plano na Higgsfield para a tela da conta (a pessoa, sem app). null se não deu para ler agora. */
export async function saldoHiggsfield(
  db: Database,
  amb: AmbienteHiggsfield,
  auth: Authenticated,
): Promise<{ creditos: number | null; plano: string | null } | null> {
  try {
    return await comSessao(db, amb, ctxDe(auth), (s) => saldo(s))
  } catch (e) {
    if (e instanceof DomainError && e.code === 'sem_conexao') throw e
    return null
  }
}

/** Liga ou desliga um app na conexão da Higgsfield. */
export async function alternarAppHiggsfield(db: Database, auth: Authenticated, app: string, ativo: boolean): Promise<void> {
  if (!/^[a-z0-9-]{1,40}$/.test(app)) throw new DomainError('invalid_input', 'App inválido.')
  await db.asUser(ctxDe(auth), async (tx) => {
    const [c] = await tx`select id from zro.conexoes where provedor = 'higgsfield'`
    if (!c) throw new DomainError('not_found', 'Conecte a Higgsfield primeiro.')
    const [p] = await tx`select 1 from zro.products where id = ${app}`
    if (!p) throw new DomainError('invalid_input', 'App inválido.')
    await tx`
      insert into zro.conexao_apps (conexao_id, app, ativo) values (${c.id as string}, ${app}, ${ativo})
      on conflict (conexao_id, app) do update set ativo = excluded.ativo, atualizado_em = now()`
    await audit(tx, { actorUserId: auth.user.id, action: 'conexao.app', targetType: 'conexao', targetId: 'higgsfield', metadata: { app, ativo } })
  })
}

/** Desconectar: apaga a conexão e os tokens (a Higgsfield não tem revogação pública; o token vence sozinho). */
export async function desconectarHiggsfield(db: Database, auth: Authenticated): Promise<void> {
  const ctx = ctxDe(auth)
  await db.asUser(ctx, async (tx) => {
    const r = await tx`delete from zro.conexoes where provedor = 'higgsfield' returning id`
    if (r.length) await audit(tx, { actorUserId: ctx.userId, action: 'conexao.desligada', targetType: 'conexao', targetId: 'higgsfield', metadata: {} })
  })
}

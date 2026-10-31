/**
 * Papéis do console da plataforma (/admin, ADR 0034). Ficam em `zro.users.platform_role` (um por conta):
 * - admin: tudo, inclusive atribuir papéis e as três caixas do Correio.
 * - support: vê o console (sem Custos, Laboratório, Papéis e Correio) e não muda planos nem contas.
 * - financeiro: só a parte financeira (Custos, Planos e a caixa financeiro@). O resto do console não existe para ele.
 *
 * Cada página, rota e ação confere aqui por conta própria (no Next 16 layout e página renderizam em paralelo). A
 * interface só esconde o que o servidor já nega.
 */
import type { Authenticated } from '@zro/auth'
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { requireUser, type UserActor } from './authz'

export const PAPEIS_CONSOLE = ['admin', 'support', 'financeiro'] as const
export type PapelConsole = (typeof PAPEIS_CONSOLE)[number]

export const NOME_DO_PAPEL: Record<PapelConsole, string> = { admin: 'Admin', support: 'Suporte', financeiro: 'Financeiro' }

export const AREAS_CONSOLE = [
  'visao',
  'pessoas',
  'planos',
  'custos',
  'laboratorio',
  'lancamento',
  'apps',
  'denuncias',
  'teste-drive',
  'papeis',
  'correio',
] as const
export type AreaConsole = (typeof AREAS_CONSOLE)[number]

const TODOS: readonly PapelConsole[] = ['admin', 'support', 'financeiro']
const EQUIPE: readonly PapelConsole[] = ['admin', 'support']
const ADMIN: readonly PapelConsole[] = ['admin']
const FINANCAS: readonly PapelConsole[] = ['admin', 'financeiro']

/** Quem vê cada área. */
const VER: Record<AreaConsole, readonly PapelConsole[]> = {
  visao: EQUIPE,
  pessoas: EQUIPE,
  planos: TODOS,
  custos: FINANCAS,
  laboratorio: ADMIN,
  lancamento: EQUIPE,
  apps: EQUIPE,
  denuncias: EQUIPE,
  'teste-drive': ADMIN,
  papeis: ADMIN,
  correio: FINANCAS,
}

/** Quem muda algo em cada área (o suporte só lê, salvo as denúncias do Set). */
const MUDAR: Record<AreaConsole, readonly PapelConsole[]> = {
  ...Object.fromEntries(AREAS_CONSOLE.map((a) => [a, ADMIN])),
  planos: FINANCAS,
  custos: FINANCAS,
  correio: FINANCAS,
  denuncias: EQUIPE,
} as Record<AreaConsole, readonly PapelConsole[]>

const ehPapel = (v: unknown): v is PapelConsole => typeof v === 'string' && (PAPEIS_CONSOLE as readonly string[]).includes(v)

/** O papel que vale no console: só com e-mail confirmado. */
export function papelNoConsole(auth: Authenticated | null): PapelConsole | null {
  if (!auth?.user.emailVerified) return null
  return ehPapel(auth.user.platformRole) ? auth.user.platformRole : null
}

export function podeVer(papel: PapelConsole | null, area: AreaConsole): boolean {
  return !!papel && VER[area].includes(papel)
}

export function podeMudar(papel: PapelConsole | null, area: AreaConsole): boolean {
  return !!papel && MUDAR[area].includes(papel)
}

/** As áreas que o papel vê, na ordem do menu. */
export function areasDoPapel(papel: PapelConsole | null): AreaConsole[] {
  return AREAS_CONSOLE.filter((a) => podeVer(papel, a))
}

/** Onde o console abre para o papel (o Financeiro não tem Visão geral). */
export function inicioDoConsole(papel: PapelConsole | null): string | null {
  if (!papel) return null
  return papel === 'financeiro' ? '/admin/custos' : '/admin'
}

export type ConsoleActor = UserActor & { papel: PapelConsole }

/**
 * Guarda de cada página, rota e ação do console. `mudar`: a operação altera algo (o suporte só lê). Sem papel, ou sem
 * a área no papel, `platform_role_required` (403); as páginas transformam isso em 404.
 */
export function requireConsole(auth: Authenticated | null, area: AreaConsole, opts: { mudar?: boolean } = {}): ConsoleActor {
  const u = requireUser(auth, { verifiedEmail: true })
  const papel = papelNoConsole(auth)
  if (!(opts.mudar ? podeMudar(papel, area) : podeVer(papel, area))) {
    throw new DomainError('platform_role_required', 'Área restrita à administração da plataforma.')
  }
  return { ...u, papel: papel! }
}

// ───────────── Correio (caixas do iCloud, ADR 0034) ─────────────

export const CAIXAS_CORREIO = [
  { id: 'victor', endereco: 'victor@absolutezro.com', nome: 'Victor' },
  { id: 'contato', endereco: 'contato@absolutezro.com', nome: 'Contato' },
  { id: 'financeiro', endereco: 'financeiro@absolutezro.com', nome: 'Financeiro' },
] as const
export type CaixaCorreio = (typeof CAIXAS_CORREIO)[number]
export type CaixaId = CaixaCorreio['id']

const CAIXAS_POR_PAPEL: Record<PapelConsole, readonly CaixaId[]> = {
  admin: ['victor', 'contato', 'financeiro'],
  financeiro: ['financeiro'],
  support: [],
}

export function caixasDoPapel(papel: PapelConsole | null): CaixaCorreio[] {
  if (!papel) return []
  const ids = CAIXAS_POR_PAPEL[papel]
  return CAIXAS_CORREIO.filter((c) => ids.includes(c.id))
}

/** Guarda do Correio: a caixa pedida tem de ser do papel. Caixa desconhecida ou alheia = mesma resposta (403). */
export function requireCaixa(auth: Authenticated | null, caixaId: unknown, opts: { mudar?: boolean } = {}): ConsoleActor & { caixa: CaixaCorreio } {
  const a = requireConsole(auth, 'correio', opts)
  const caixa = caixasDoPapel(a.papel).find((c) => c.id === caixaId)
  if (!caixa) throw new DomainError('platform_role_required', 'Esta caixa não é do seu papel.')
  return { ...a, caixa }
}

// ───────────── atribuição de papéis (só admin, tela Papéis) ─────────────

export type PessoaDoConsole = {
  userId: string
  email: string
  nome: string
  papel: PapelConsole
  emailConfirmado: boolean
  status: string
}

/** Quem tem papel no console. Roda como sistema, depois de requireConsole(papeis). */
export async function listarPapeisDoConsole(tx: Queryable): Promise<PessoaDoConsole[]> {
  const rows = await tx`
    select id, email, display_name, platform_role, email_verified_at, status from zro.users
    where platform_role is not null and status <> 'deleted'
    order by array_position(array['admin', 'financeiro', 'support'], platform_role), lower(display_name), email`
  return rows.map((r) => ({
    userId: r.id as string,
    email: r.email as string,
    nome: (r.display_name as string) || (r.email as string),
    papel: r.platform_role as PapelConsole,
    emailConfirmado: !!r.email_verified_at,
    status: r.status as string,
  }))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lê o papel do formulário: vazio ou "nenhum" = tirar o papel. */
export function lerPapel(v: unknown): PapelConsole | null {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s || s === 'nenhum') return null
  if (!ehPapel(s)) throw new DomainError('invalid_input', 'Papel inválido.')
  return s
}

/**
 * Dá, troca ou tira o papel de console de uma conta. Só admin (conferido de novo no banco, dentro da transação), nunca
 * o próprio papel (nada de auto-promoção nem de o último admin se rebaixar sem querer). A conta precisa estar ativa e,
 * para receber papel, com e-mail confirmado. Tudo vai para audit_logs.
 */
export async function definirPapelDoConsole(
  tx: Queryable,
  ator: { userId: string },
  alvo: { email?: string; userId?: string },
  papel: PapelConsole | null,
): Promise<{ userId: string; de: PapelConsole | null; para: PapelConsole | null; mudou: boolean }> {
  const [quem] = await tx`select platform_role, status, email_verified_at from zro.users where id = ${ator.userId}`
  if (quem?.platform_role !== 'admin' || quem.status !== 'active' || !quem.email_verified_at) {
    throw new DomainError('platform_role_required', 'Só o papel admin atribui papéis.')
  }
  const email = (alvo.email ?? '').trim().toLowerCase()
  if (!alvo.userId && !email) throw new DomainError('invalid_input', 'Informe o e-mail da conta.')
  if (alvo.userId && !UUID.test(alvo.userId)) throw new DomainError('invalid_input', 'Pedido inválido.')
  const [u] = alvo.userId
    ? await tx`select id, status, platform_role, email_verified_at from zro.users where id = ${alvo.userId} for update`
    : await tx`select id, status, platform_role, email_verified_at from zro.users where email = ${email} for update`
  if (!u || u.status === 'deleted') throw new DomainError('not_found', 'Nenhuma conta com esse e-mail.')
  const userId = u.id as string
  if (userId === ator.userId) throw new DomainError('action_not_allowed', 'O próprio papel só outro admin muda.')
  if (u.status !== 'active') throw new DomainError('conflict', 'Conta suspensa não recebe papel.')
  if (papel && !u.email_verified_at) throw new DomainError('conflict', 'A conta precisa confirmar o e-mail antes.')
  const de = (u.platform_role as PapelConsole | null) ?? null
  if (de === papel) return { userId, de, para: papel, mudou: false }
  await tx`update zro.users set platform_role = ${papel} where id = ${userId}`
  await audit(tx, {
    actorUserId: ator.userId,
    actorKind: 'admin',
    action: papel ? 'admin.papel_console_definido' : 'admin.papel_console_removido',
    targetType: 'user',
    targetId: userId,
    metadata: { de, para: papel },
  })
  return { userId, de, para: papel, mudou: true }
}

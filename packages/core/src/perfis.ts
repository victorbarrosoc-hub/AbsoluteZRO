/**
 * Perfil profissional com @ (migração 0029, ADR 0029). Toda conta é um perfil do ecossistema audiovisual: @, funções,
 * cidade, portfólio, bio e selos dos apps que a pessoa usa e ligou. Aparece na busca por padrão (decisão do titular);
 * "Aparecer na busca" desliga. E-mail e telefone nunca saem: a busca e o @ passam pelas funções security definer
 * `zro.buscar_perfis`/`zro.perfil_por_arroba`, que devolvem só os campos de `PerfilPublico`.
 * Tudo como a própria pessoa (zro_app + RLS); o sistema só entra para o limite de buscas e para mandar o e-mail do
 * convite por @ (o endereço nunca volta a quem convidou).
 */
import {
  FUNCOES_PERFIL,
  hashToken,
  newToken,
  nomeDaFuncao,
  normalizarArroba,
  registerAttempt,
  textoDoSelo,
  validarArroba,
  validarPortfolio,
  withinLimit,
  BIO_MAX,
  CIDADE_MAX,
  FUNCAO_OUTRA_MAX,
  type Authenticated,
  type FuncaoPerfil,
  type Rule,
} from '@zro/auth'
import { pgErrorCode, PG, type Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { ADMIN_ROLES, authorize, requireUser, type OrgRole } from './authz'
import { INVITE_TTL_MS } from './organizations'

/** Escopo de família para os apps buscarem perfis e convidarem pelo @ (todo cliente com produto, migração 0029). */
export const ESCOPO_PESSOAS = 'zro.pessoas'
/** Buscas por pessoa: 60 a cada 10 minutos (na central e pelos apps, contadas juntas). */
export const LIMITE_BUSCA_PERFIS: Rule = { max: 60, windowMs: 10 * 60_000 }
export const LIMITE_CONVITE_ARROBA: Rule = { max: 30, windowMs: 60 * 60_000 }
/** Páginas da comunidade por pessoa: 120 a cada 10 minutos (uma lista inteira é poucas páginas de 200). */
export const LIMITE_COMUNIDADE: Rule = { max: 120, windowMs: 10 * 60_000 }

export type SeloPublico = { produto: string; texto: string }
export type PerfilPublico = {
  /** O `sub` do login único: é por ele que um app liga a pessoa (ex.: freela do Maestro). */
  id: string
  arroba: string
  nome: string
  /** Caminho da foto pública (`/api/v1/foto/<id>`), ou null. A API devolve o endereço inteiro. */
  foto: string | null
  funcoes: { chave: string; nome: string }[]
  cidade: string | null
  portfolio: string | null
  bio: string | null
  selos: SeloPublico[]
}

export type MeuPerfil = PerfilPublico & {
  funcoesMarcadas: FuncaoPerfil[]
  funcaoOutra: string | null
  visivel: boolean
  /** Selos que a pessoa ligou (inclusive de app que ela ainda não usa: esses não aparecem). */
  selosLigados: string[]
  /** Apps que a pessoa já usou: os selos que ela pode ligar. */
  apps: { produto: string; nome: string; texto: string }[]
  avisoVisto: boolean
  arrobaSugerida: boolean
}

const fotoDe = (publicId: unknown) => (typeof publicId === 'string' && publicId ? `/api/v1/foto/${publicId}` : null)

function funcoesDe(funcoes: unknown, outra: unknown): PerfilPublico['funcoes'] {
  const lista = Array.isArray(funcoes) ? (funcoes as string[]) : []
  return FUNCOES_PERFIL.filter((f) => lista.includes(f.chave))
    .map((f) =>
      f.chave === 'outra' ? (typeof outra === 'string' && outra.trim() ? { chave: 'outra', nome: outra.trim() } : null) : { chave: f.chave, nome: f.nome },
    )
    .filter((f): f is { chave: string; nome: string } => !!f)
}

function publico(r: Record<string, unknown>): PerfilPublico {
  return {
    id: r.user_id as string,
    arroba: r.arroba as string,
    nome: ((r.nome as string) || '').trim() || `@${r.arroba as string}`,
    foto: fotoDe(r.foto),
    funcoes: funcoesDe(r.funcoes, r.funcao_outra),
    cidade: (r.cidade as string) ?? null,
    portfolio: (r.portfolio as string) ?? null,
    bio: (r.bio as string) ?? null,
    selos: ((r.selos as string[]) ?? []).map((p) => ({ produto: p, texto: textoDoSelo(p) })),
  }
}

const ctxDe = (auth: Authenticated) => ({ userId: auth.user.id, orgId: auth.session.activeOrgId })

// ───────────── o próprio perfil ─────────────

export async function meuPerfil(db: Database, auth: Authenticated | null): Promise<MeuPerfil> {
  const { userId } = requireUser(auth)
  return db.asUser(ctxDe(auth!), async (tx) => {
    const [r] = await tx`
      select p.user_id, p.arroba, p.arroba_sugerida, p.funcoes, p.funcao_outra, p.cidade, p.portfolio, p.bio, p.visivel, p.selos,
             p.aviso_visto_em, u.display_name as nome, a.public_id as foto, zro.selos_efetivos(p.user_id, p.selos) as efetivos
        from zro.perfis p join zro.users u on u.id = p.user_id left join zro.user_avatars a on a.user_id = p.user_id
       where p.user_id = ${userId}`
    if (!r) throw new DomainError('not_found', 'Perfil não encontrado.')
    const apps = await tx`
      select distinct pr.id, pr.name, pr.step_order from zro.app_accounts aa join zro.products pr on pr.id = aa.product_id
       where aa.user_id = ${userId} and pr.stage <> 'disabled' and zro.release_visible(pr.id, ${userId}::uuid) order by pr.step_order`
    return {
      ...publico({ ...r, selos: r.efetivos }),
      funcoesMarcadas: (r.funcoes as FuncaoPerfil[]) ?? [],
      funcaoOutra: (r.funcao_outra as string) ?? null,
      visivel: !!r.visivel,
      selosLigados: (r.selos as string[]) ?? [],
      apps: apps.map((a) => ({ produto: a.id as string, nome: a.name as string, texto: textoDoSelo(a.id as string, a.name as string) })),
      avisoVisto: !!r.aviso_visto_em,
      arrobaSugerida: !!r.arroba_sugerida,
    }
  })
}

export type EntradaPerfil = {
  funcoes: string[]
  funcaoOutra?: string | null
  cidade?: string | null
  portfolio?: string | null
  bio?: string | null
  selos?: string[]
}

/** Confere e limpa o que veio do formulário. Lança invalid_input com a mensagem da tela. */
export function lerEntradaPerfil(e: EntradaPerfil): Required<EntradaPerfil> {
  const funcoes = [...new Set(e.funcoes)].filter((f) => FUNCOES_PERFIL.some((x) => x.chave === f))
  if (funcoes.length !== new Set(e.funcoes).size) throw new DomainError('invalid_input', 'Escolha as funções da lista.')
  const outra = (e.funcaoOutra ?? '').replace(/\s+/g, ' ').trim()
  if (outra.length > FUNCAO_OUTRA_MAX) throw new DomainError('invalid_input', `"Outra" com até ${FUNCAO_OUTRA_MAX} caracteres.`)
  const comOutra = outra ? [...new Set([...funcoes, 'outra'])] : funcoes.filter((f) => f !== 'outra')
  const cidade = (e.cidade ?? '').replace(/\s+/g, ' ').trim()
  if (cidade.length > CIDADE_MAX) throw new DomainError('invalid_input', 'Cidade longa demais.')
  const portfolio = (e.portfolio ?? '').trim()
  const portRuim = validarPortfolio(portfolio)
  if (portRuim) throw new DomainError('invalid_input', portRuim)
  const bio = (e.bio ?? '').trim()
  if (bio.length > BIO_MAX) throw new DomainError('invalid_input', `Bio com até ${BIO_MAX} caracteres.`)
  // Não dá para pôr telefone nem e-mail no perfil: ele é para ser achado, e contato só pelo convite.
  if (/\S+@\S+\.\S+/.test(`${bio} ${cidade} ${outra}`) || /(\d[\s().-]*){9,}/.test(`${bio} ${cidade} ${outra}`))
    throw new DomainError('invalid_input', 'Sem e-mail nem telefone no perfil. Quem quiser falar com você convida pela Absolute ZRO.')
  const selos = [...new Set(e.selos ?? [])].filter((s) => /^[a-z0-9-]{1,40}$/.test(s)).slice(0, 12)
  return { funcoes: comOutra, funcaoOutra: outra || null, cidade: cidade || null, portfolio: portfolio || null, bio: bio || null, selos }
}

export async function salvarPerfil(db: Database, auth: Authenticated | null, entrada: EntradaPerfil): Promise<void> {
  const { userId } = requireUser(auth)
  const v = lerEntradaPerfil(entrada)
  await db.asUser(ctxDe(auth!), async (tx) => {
    const r = await tx`
      update zro.perfis set funcoes = ${v.funcoes}, funcao_outra = ${v.funcaoOutra}, cidade = ${v.cidade}, portfolio = ${v.portfolio},
             bio = ${v.bio}, selos = ${v.selos}
       where user_id = ${userId} returning user_id`
    if (!r.length) throw new DomainError('not_found', 'Perfil não encontrado.')
    await audit(tx, { actorUserId: userId, action: 'perfil.atualizado', targetType: 'user', targetId: userId, metadata: { funcoes: v.funcoes.length } })
  })
}

/** Aparecer na busca (ligado por padrão). `aviso` marca também o aviso único como visto. */
export async function definirVisibilidade(db: Database, auth: Authenticated | null, visivel: boolean, o: { aviso?: boolean } = {}): Promise<void> {
  const { userId } = requireUser(auth)
  await db.asUser(ctxDe(auth!), async (tx) => {
    await tx`update zro.perfis set visivel = ${visivel}, aviso_visto_em = ${o.aviso ? tx`coalesce(aviso_visto_em, now())` : tx`aviso_visto_em`}
             where user_id = ${userId}`
    await audit(tx, { actorUserId: userId, action: visivel ? 'perfil.visivel' : 'perfil.escondido', targetType: 'user', targetId: userId })
  })
}

export async function marcarAvisoDoPerfil(db: Database, auth: Authenticated | null): Promise<void> {
  const { userId } = requireUser(auth)
  await db.asUser(ctxDe(auth!), (tx) => tx`update zro.perfis set aviso_visto_em = coalesce(aviso_visto_em, now()) where user_id = ${userId}`)
}

/** O aviso único ainda não foi visto? (o HUB mostra uma vez a quem já tinha conta e a quem acabou de entrar) */
export async function avisoDoPerfilPendente(db: Database, auth: Authenticated): Promise<{ arroba: string; visivel: boolean } | null> {
  const [r] = await db.asUser(ctxDe(auth), (tx) => tx`select arroba, visivel from zro.perfis where user_id = ${auth.user.id} and aviso_visto_em is null`)
  return r ? { arroba: r.arroba as string, visivel: !!r.visivel } : null
}

export async function trocarArroba(db: Database, auth: Authenticated | null, raw: string): Promise<string> {
  requireUser(auth)
  const arroba = normalizarArroba(raw)
  const ruim = validarArroba(arroba)
  if (ruim) throw new DomainError('invalid_input', ruim)
  try {
    const [r] = await db.asUser(ctxDe(auth!), (tx) => tx`select zro.trocar_arroba(${arroba}) as a`)
    return r!.a as string
  } catch (e) {
    const code = pgErrorCode(e)
    if (code === PG.uniqueViolation) throw new DomainError('conflict', `O @${arroba} já é de outra pessoa.`)
    if (code === '54000') throw new DomainError('rate_limited', 'Você já trocou de @ duas vezes neste mês. Tente de novo mais tarde.')
    if (code === '22023') throw new DomainError('invalid_input', 'Esse @ não vale. Escolha outro.')
    throw e
  }
}

// ───────────── os outros: busca e página do @ ─────────────

async function dentroDoLimite(db: Database, chave: string, regra: Rule, msg: string) {
  const ok = await db.asSystem('perfis: limite', async (tx) => {
    if (!(await withinLimit(tx, chave, regra))) return false
    await registerAttempt(tx, chave)
    return true
  })
  if (!ok) throw new DomainError('rate_limited', msg)
}

/**
 * Busca por @ ou nome. Só perfis visíveis, sem a própria pessoa, até 20. Exige e-mail confirmado e vínculo na
 * organização ativa (authorize). Limite de 60 buscas a cada 10 minutos. Pelos apps, a auditoria guarda o app e quantos
 * resultados, nunca o texto buscado.
 */
export async function buscarPerfis(db: Database, auth: Authenticated | null, q: string, o: { limite?: number } = {}): Promise<PerfilPublico[]> {
  const actor = await authorize(db, auth, { verifiedEmail: true })
  const texto = String(q ?? '')
    .normalize('NFKC')
    .trim()
    .slice(0, 60)
  if (texto.replace(/^@/, '').length < 2) return []
  await dentroDoLimite(db, `busca-perfis:${actor.userId}`, LIMITE_BUSCA_PERFIS, 'Muitas buscas seguidas. Espere alguns minutos.')
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const rows = await tx`select * from zro.buscar_perfis(${texto}, ${Math.min(Math.max(o.limite ?? 12, 1), 20) + 1})`
    const out = rows
      .filter((r) => r.user_id !== actor.userId)
      .slice(0, o.limite ?? 12)
      .map(publico)
    if (actor.auth.session.app)
      await audit(tx, {
        orgId: actor.orgId,
        actorUserId: actor.userId,
        action: 'perfil.busca',
        metadata: { app: actor.auth.session.app.clientId, resultados: out.length },
      })
    return out
  })
}

/**
 * A comunidade (migração 0038, decisão do titular de 30/10/2026): a lista que os apps da família mostram, em vez de
 * só buscar. Só perfis visíveis com o @ CONFIRMADO (a sugestão automática não entra) e conta ativa; filtro opcional
 * por função; página ordenada pelo @ (`depois` = o último @ da página anterior), até 200. A própria pessoa entra se
 * estiver visível (o app a marca como "você"). Pelos apps, a auditoria guarda o app e quantos vieram.
 */
export async function listarComunidade(
  db: Database,
  auth: Authenticated | null,
  o: { funcao?: string | null; depois?: string | null; limite?: number } = {},
): Promise<{ pessoas: PerfilPublico[]; proximo: string | null }> {
  const actor = await authorize(db, auth, { verifiedEmail: true })
  const funcao = o.funcao ? String(o.funcao) : null
  if (funcao && !FUNCOES_PERFIL.some((f) => f.chave === funcao)) throw new DomainError('invalid_input', 'Função desconhecida.', { campo: 'funcao' })
  const depois = o.depois ? normalizarArroba(String(o.depois)) : null
  if (depois && !/^[a-z0-9._]{1,30}$/.test(depois)) throw new DomainError('invalid_input', 'Cursor inválido.', { campo: 'depois' })
  const limite = Math.min(Math.max(Math.trunc(o.limite ?? 100) || 100, 1), 200)
  await dentroDoLimite(db, `comunidade:${actor.userId}`, LIMITE_COMUNIDADE, 'Muitas páginas seguidas. Espere alguns minutos.')
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const rows = await tx`select * from zro.comunidade_perfis(${funcao}, ${depois}, ${limite + 1})`
    const pessoas = rows.slice(0, limite).map(publico)
    if (actor.auth.session.app)
      await audit(tx, {
        orgId: actor.orgId,
        actorUserId: actor.userId,
        action: 'perfil.comunidade',
        metadata: { app: actor.auth.session.app.clientId, resultados: pessoas.length },
      })
    return { pessoas, proximo: rows.length > limite ? pessoas[pessoas.length - 1]!.arroba : null }
  })
}

export type PerfilDoArroba = { perfil: PerfilPublico; visivel: boolean; antiga: boolean; minha: boolean }

/** O perfil de um @ (o atual ou um antigo dos últimos 90 dias; `antiga` = redirecionar). Escondido: só a própria pessoa. */
export async function perfilPorArroba(db: Database, auth: Authenticated | null, raw: string): Promise<PerfilDoArroba | null> {
  const { userId } = requireUser(auth)
  const arroba = normalizarArroba(raw)
  if (!/^[a-z0-9._]{3,30}$/.test(arroba)) return null
  const [r] = await db.asUser(ctxDe(auth!), (tx) => tx`select * from zro.perfil_por_arroba(${arroba})`)
  if (!r) return null
  return { perfil: publico(r), visivel: !!r.visivel, antiga: !!r.antiga, minha: r.user_id === userId }
}

/** A página do @ pela API de apps: authorize() + limite, só perfil visível (o escondido é 404 até para a dona). */
export async function perfilPorArrobaParaApp(db: Database, auth: Authenticated | null, raw: string): Promise<PerfilDoArroba | null> {
  const actor = await authorize(db, auth, { verifiedEmail: true })
  await dentroDoLimite(db, `busca-perfis:${actor.userId}`, LIMITE_BUSCA_PERFIS, 'Muitas buscas seguidas. Espere alguns minutos.')
  const r = await perfilPorArroba(db, actor.auth, raw)
  return r && r.visivel ? r : null
}

// ───────────── convite por @ ─────────────

export type ConvitePorArroba = { token: string; invitationId: string; arroba: string; convidado: string }

/**
 * Convite para a organização ativa pelo @ (Equipe › Convidar e os apps com `zro.pessoas`). A pessoa sempre aceita
 * antes de entrar. Perfil escondido não é achado (404 igual ao @ que não existe): para ele vale o convite pelo e-mail
 * exato. Quem convidou nunca recebe o e-mail; o HUB manda o aviso direto para a pessoa (`emailDoConvidado`).
 */
export async function convidarPorArroba(
  db: Database,
  auth: Authenticated | null,
  input: { arroba: string; role: Exclude<OrgRole, 'owner' | 'guest'> },
): Promise<ConvitePorArroba> {
  const actor = await authorize(db, auth, { roles: ADMIN_ROLES, verifiedEmail: true })
  const arroba = normalizarArroba(input.arroba)
  if (!/^[a-z0-9._]{3,30}$/.test(arroba)) throw new DomainError('not_found', 'Não achamos esse @.')
  if (!['admin', 'manager', 'editor', 'viewer', 'billing'].includes(input.role)) throw new DomainError('invalid_input', 'Papel inválido.')
  if (input.role === 'admin' && actor.role !== 'owner') throw new DomainError('forbidden_role', 'Só o dono convida administradores.')
  await dentroDoLimite(db, `convite-arroba:${actor.orgId}`, LIMITE_CONVITE_ARROBA, 'Muitos convites seguidos. Espere um pouco.')
  const token = newToken('zi')
  try {
    const [r] = await db.asUser(
      { userId: actor.userId, orgId: actor.orgId },
      (tx) => tx`select * from zro.convidar_por_arroba(${arroba}, ${input.role}, ${hashToken(token)}, ${new Date(Date.now() + INVITE_TTL_MS)})`,
    )
    return { token, invitationId: r!.convite as string, arroba: r!.arroba as string, convidado: r!.convidado as string }
  } catch (e) {
    const code = pgErrorCode(e)
    const msg = e instanceof Error ? e.message : ''
    if (code === 'P0002') throw new DomainError('not_found', 'Não achamos esse @.')
    if (code === PG.uniqueViolation && msg.includes('ja_na_equipe')) throw new DomainError('conflict', `@${arroba} já faz parte da equipe.`)
    if (code === PG.uniqueViolation) throw new DomainError('conflict', `@${arroba} já tem um convite aberto.`)
    if (code === PG.insufficientPrivilege) throw new DomainError('forbidden_role', 'Seu papel nesta organização não permite convidar.')
    throw e
  }
}

/** Só para mandar o aviso do convite por @: o e-mail vai ao provedor de e-mail, nunca à tela nem à API. */
export async function emailDoConvidado(db: Database, invitationId: string): Promise<string | null> {
  const [r] = await db.asSystem(
    'convite por @: e-mail do aviso',
    (tx) => tx`select email from zro.invitations where id = ${invitationId} and via_arroba is not null and accepted_at is null and revoked_at is null`,
  )
  return (r?.email as string) ?? null
}

export type MeuConvite = { id: string; organizacao: string; papel: OrgRole; convidou: string; projeto: string | null; venceEm: Date }

/** Convites abertos para a pessoa da sessão (pela conta ou pelo e-mail dela). */
export async function meusConvites(db: Database, auth: Authenticated | null): Promise<MeuConvite[]> {
  requireUser(auth)
  const rows = await db.asUser(ctxDe(auth!), (tx) => tx`select * from zro.meus_convites()`)
  return rows.map((r) => ({
    id: r.id as string,
    organizacao: r.org_nome as string,
    papel: r.role as OrgRole,
    convidou: r.convidou as string,
    projeto: (r.projeto as string) ?? null,
    venceEm: r.vence_em as Date,
  }))
}

/** Para a API: nome legível das funções do perfil. */
export const funcoesDoPerfil = () => FUNCOES_PERFIL.map((f) => ({ chave: f.chave, nome: nomeDaFuncao(f.chave) }))

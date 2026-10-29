/**
 * Set: quem está no Set e as conversas (migração 0035, ADR 0032). A mesma conta em todo app: a pessoa vê quem da
 * equipe e dos contatos está online e em qual app, conversa direto pelo @ com quem aceitou ou já trabalha junto e
 * conversa no projeto (o projeto canônico, `zro.projects`) de qualquer app do projeto.
 *
 * - Tudo como a própria pessoa (zro_app + RLS). O que é de outra pessoa (nome, @, foto, presença) sai só das funções
 *   security definer da 0035, com campos mínimos; e-mail e telefone nunca.
 * - `authorize()` na ordem do PRD §5.2 em toda operação (com e-mail confirmado para quem escreve ou pede contato); o
 *   acesso à conversa (passo 4: a direta é das duas pessoas, a do projeto é de quem vê o projeto) fica no banco.
 * - O app da presença vem do token (produto do cliente OAuth) ou é a central ('hub'); nunca do navegador.
 * - Limites: 30 mensagens por minuto, 20 pedidos de contato e 10 denúncias por dia, por pessoa.
 * - Auditoria sem conteúdo: pedidos, bloqueios, denúncias, conversa criada, mensagem editada ou apagada. Nunca o texto.
 */
import { registerAttempt, withinLimit, type Authenticated, type Rule } from '@zro/auth'
import { pgErrorCode, PG, type Database, type Tx } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { authorize, type Actor } from './authz'

/** Escopo de família para os apps usarem o Set (todo cliente com produto, migração 0035). */
export const ESCOPO_SET = 'zro.set'
/** A central (sessão do navegador do HUB) aparece como "Absolute ZRO". */
export const APP_HUB = 'hub'

export const LIMITE_MENSAGENS: Rule = { max: 30, windowMs: 60_000 }
export const LIMITE_PEDIDOS_CONTATO: Rule = { max: 20, windowMs: 24 * 3_600_000 }
export const LIMITE_DENUNCIAS: Rule = { max: 10, windowMs: 24 * 3_600_000 }
export const TEXTO_MAX = 4000

export type QuemVe = 'equipe_contatos' | 'equipe' | 'contatos' | 'ninguem'
export const QUEM_VE: QuemVe[] = ['equipe_contatos', 'equipe', 'contatos', 'ninguem']
export type EstadoPresenca = 'online' | 'ausente' | 'offline'
export type Batida = 'ativo' | 'ausente' | 'saiu'
export const MOTIVOS_DENUNCIA = ['spam', 'assedio', 'ofensa', 'golpe', 'outro'] as const
export type MotivoDenuncia = (typeof MOTIVOS_DENUNCIA)[number]

export type PreferenciasSet = { invisivel: boolean; quemVe: QuemVe; mostrarVisto: boolean }

export type PessoaResumo = {
  /** O `sub` do login único. */
  id: string
  arroba: string | null
  nome: string
  /** Caminho da foto pública (`/api/v1/foto/<id>`), ou null. A API devolve o endereço inteiro. */
  foto: string | null
}

export type PessoaNoSet = PessoaResumo & {
  equipe: boolean
  contato: boolean
  estado: EstadoPresenca
  /** Em qual app a pessoa está (só online ou ausente, e só para quem ela deixou ver). */
  app: { id: string; nome: string } | null
  /** "Visto há…": só se a pessoa deixou. */
  vistoEm: string | null
}

export type EstadoSet = {
  eu: PessoaResumo & { preferencias: PreferenciasSet }
  pessoas: PessoaNoSet[]
  /** Mensagens não lidas fora das conversas silenciadas. */
  naoLidas: number
  /** Pedidos de contato recebidos esperando resposta. */
  pedidos: number
  /** Não lidas por conversa (só as que têm alguma). */
  porConversa: Record<string, number>
  /** A maior sequência de mensagem nas conversas da pessoa: mudou, algo chegou. */
  ultima: number
}

export type ConversaResumo = {
  id: string
  tipo: 'direta' | 'projeto'
  /** Conversa direta: a outra pessoa. */
  pessoa: PessoaResumo | null
  /** Conversa do projeto: o projeto canônico. */
  projeto: { id: string; titulo: string } | null
  titulo: string
  ultima: number
  ultimaEm: string | null
  /** O começo da última mensagem (null se apagada ou sem mensagem). */
  previa: string | null
  previaMinha: boolean
  naoLidas: number
  silenciada: boolean
  podeEscrever: boolean
}

export type MensagemSet = {
  id: string
  seq: number
  autor: PessoaResumo
  minha: boolean
  texto: string | null
  criadaEm: string
  editadaEm: string | null
  apagada: boolean
}

const fotoDe = (publicId: unknown) => (typeof publicId === 'string' && publicId ? `/api/v1/foto/${publicId}` : null)
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === 'string' ? new Date(d).toISOString() : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHAVE = /^[A-Za-z0-9_-]{8,80}$/

function pessoa(id: unknown, arroba: unknown, nome: unknown, foto: unknown): PessoaResumo {
  const a = typeof arroba === 'string' && arroba ? arroba : null
  const n = typeof nome === 'string' ? nome.trim() : ''
  return { id: id as string, arroba: a, nome: n || (a ? `@${a}` : 'Pessoa'), foto: fotoDe(foto) }
}

function exigirId(id: string, msg = 'Pessoa não encontrada.'): string {
  if (!UUID.test(String(id ?? ''))) throw new DomainError('not_found', msg)
  return id
}

/** O app de onde a pessoa fala: o produto do token, ou a central. */
export const appDaSessao = (auth: Authenticated): string => auth.session.app?.productId ?? APP_HUB

const ctx = (a: Actor) => ({ userId: a.userId, orgId: a.orgId })

async function limite(db: Database, chave: string, regra: Rule, msg: string) {
  const ok = await db.asSystem('set: limite', async (tx) => {
    if (!(await withinLimit(tx, chave, regra))) return false
    await registerAttempt(tx, chave)
    return true
  })
  if (!ok) throw new DomainError('rate_limited', msg)
}

/** Erros do banco (funções da 0035) viram erros de domínio com a mensagem da tela. */
function traduzir(e: unknown, o: { proibido?: string; nao?: string; invalido?: string } = {}): never {
  const code = pgErrorCode(e)
  if (code === PG.insufficientPrivilege) throw new DomainError('action_not_allowed', o.proibido ?? 'Você não pode fazer isso.')
  if (code === 'P0002') throw new DomainError('not_found', o.nao ?? 'Não encontrado.')
  if (code === '22023' || code === PG.checkViolation) throw new DomainError('invalid_input', o.invalido ?? 'Pedido inválido.')
  if (code === PG.uniqueViolation) throw new DomainError('conflict', 'Isso já foi feito.')
  throw e
}

/** Texto de mensagem: sem caracteres de controle (menos a quebra de linha), sem espaço sobrando, até 4000. */
export function limparTexto(raw: unknown): string {
  const t = String(raw ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
  if (!t) throw new DomainError('invalid_input', 'Escreva uma mensagem.')
  if (t.length > TEXTO_MAX) throw new DomainError('invalid_input', `Mensagem com até ${TEXTO_MAX} caracteres.`)
  return t
}

// ───────────── estado (o que o widget pergunta de tempos em tempos) e presença ─────────────

async function lerPreferencias(tx: Tx, userId: string): Promise<PreferenciasSet> {
  const [p] = await tx`select invisivel, quem_ve, mostrar_visto from zro.set_preferencias where user_id = ${userId}`
  return { invisivel: !!p?.invisivel, quemVe: ((p?.quem_ve as QuemVe) ?? 'equipe_contatos') as QuemVe, mostrarVisto: p ? !!p.mostrar_visto : true }
}

/**
 * O estado do Set para a pessoa: ela, as pessoas (online primeiro), não lidas e pedidos. Com `batida`, grava antes a
 * presença do app da sessão (invisível não grava nada). É a mesma chamada que o widget faz a cada ~45 s.
 */
export async function estadoSet(db: Database, auth: Authenticated | null, o: { batida?: Batida } = {}): Promise<EstadoSet> {
  const actor = await authorize(db, auth, {})
  const app = appDaSessao(actor.auth)
  return db.asUser(ctx(actor), async (tx) => {
    if (o.batida) await tx`select zro.set_batida(${app}, ${o.batida})`
    if (o.batida === 'saiu') return estadoVazio(actor)
    const [eu] = await tx`
      select u.id, u.display_name, p.arroba, a.public_id from zro.users u left join zro.perfis p on p.user_id = u.id
        left join zro.user_avatars a on a.user_id = u.id where u.id = ${actor.userId}`
    const preferencias = await lerPreferencias(tx, actor.userId)
    const pessoas = await tx`select * from zro.set_pessoas(200)`
    const conversas = await tx`select id, ultima_seq, nao_lidas, silenciada from zro.set_minhas_conversas(null)`
    const [pedidos] = await tx`
      select count(*)::int as n from zro.set_contatos c
       where (c.a = ${actor.userId} or c.b = ${actor.userId}) and c.estado = 'pendente' and c.pedido_por <> ${actor.userId}
         and not zro.set_bloqueado(c.pedido_por)`
    const porConversa: Record<string, number> = {}
    let naoLidas = 0
    let ultima = 0
    for (const c of conversas) {
      ultima = Math.max(ultima, Number(c.ultima_seq ?? 0))
      const n = Number(c.nao_lidas ?? 0)
      if (n > 0) {
        porConversa[c.id as string] = n
        if (!c.silenciada) naoLidas += n
      }
    }
    return {
      eu: { ...pessoa(eu?.id, eu?.arroba, eu?.display_name, eu?.public_id), preferencias },
      pessoas: pessoas.map((r) => ({
        ...pessoa(r.user_id, r.arroba, r.nome, r.foto),
        equipe: !!r.equipe,
        contato: !!r.contato,
        estado: r.estado as EstadoPresenca,
        app: r.app ? { id: r.app as string, nome: (r.app_nome as string) ?? (r.app as string) } : null,
        vistoEm: iso(r.visto_em),
      })),
      naoLidas,
      pedidos: (pedidos?.n as number) ?? 0,
      porConversa,
      ultima,
    }
  })
}

function estadoVazio(actor: Actor): EstadoSet {
  return {
    eu: {
      id: actor.userId,
      arroba: null,
      nome: actor.auth.user.displayName,
      foto: null,
      preferencias: { invisivel: false, quemVe: 'equipe_contatos', mostrarVisto: true },
    },
    pessoas: [],
    naoLidas: 0,
    pedidos: 0,
    porConversa: {},
    ultima: 0,
  }
}

/** Invisível, quem vê e "visto há". Ficar invisível (ou "ninguém") apaga na hora a presença guardada. */
export async function salvarPreferenciasSet(db: Database, auth: Authenticated | null, p: Partial<PreferenciasSet>): Promise<PreferenciasSet> {
  const actor = await authorize(db, auth, {})
  if (p.quemVe !== undefined && !QUEM_VE.includes(p.quemVe)) throw new DomainError('invalid_input', 'Escolha quem vê.')
  return db.asUser(ctx(actor), async (tx) => {
    const atual = await lerPreferencias(tx, actor.userId)
    const v: PreferenciasSet = {
      invisivel: typeof p.invisivel === 'boolean' ? p.invisivel : atual.invisivel,
      quemVe: p.quemVe ?? atual.quemVe,
      mostrarVisto: typeof p.mostrarVisto === 'boolean' ? p.mostrarVisto : atual.mostrarVisto,
    }
    await tx`
      insert into zro.set_preferencias (user_id, invisivel, quem_ve, mostrar_visto) values (${actor.userId}, ${v.invisivel}, ${v.quemVe}, ${v.mostrarVisto})
      on conflict (user_id) do update set invisivel = excluded.invisivel, quem_ve = excluded.quem_ve, mostrar_visto = excluded.mostrar_visto, atualizado_em = now()`
    // A função apaga a presença de quem ficou invisível (e não grava nada enquanto estiver).
    if (v.invisivel || v.quemVe === 'ninguem') await tx`select zro.set_batida(${appDaSessao(actor.auth)}, 'ativo')`
    await audit(tx, { actorUserId: actor.userId, action: 'set.preferencias', targetType: 'user', targetId: actor.userId, metadata: { ...v } })
    return v
  })
}

// ───────────── contatos e bloqueios ─────────────

export type MeusContatos = { contatos: PessoaResumo[]; recebidos: PessoaResumo[]; enviados: PessoaResumo[]; bloqueados: PessoaResumo[] }

export async function meusContatosSet(db: Database, auth: Authenticated | null): Promise<MeusContatos> {
  const actor = await authorize(db, auth, {})
  const rows = await db.asUser(ctx(actor), (tx) => tx`select * from zro.set_meus_contatos()`)
  const de = (s: string) => rows.filter((r) => r.situacao === s).map((r) => pessoa(r.user_id, r.arroba, r.nome, r.foto))
  return { contatos: de('contato'), recebidos: de('recebido'), enviados: de('enviado'), bloqueados: de('bloqueado') }
}

/**
 * Pede contato pelo @ (perfil visível) ou pelo id (alguém que a pessoa já vê no Set). Se a outra pessoa já tinha
 * pedido, vira contato na hora. Bloqueio da outra pessoa ou recusa recente: "pendente", sem avisar ninguém.
 */
export async function pedirContatoSet(
  db: Database,
  auth: Authenticated | null,
  alvo: { arroba?: string; id?: string },
): Promise<{ estado: 'pendente' | 'aceito'; pessoa: PessoaResumo }> {
  const actor = await authorize(db, auth, { verifiedEmail: true })
  let id = alvo.id ?? null
  let resumo: PessoaResumo | null = null
  if (!id) {
    const a = String(alvo.arroba ?? '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase()
    if (!/^[a-z0-9._]{3,30}$/.test(a)) throw new DomainError('invalid_input', 'Escreva o @ da pessoa.')
    const [p] = await db.asUser(ctx(actor), (tx) => tx`select user_id, arroba, nome, foto from zro.perfil_por_arroba(${a}) where visivel`)
    if (!p) throw new DomainError('not_found', `Não achamos @${a}.`)
    id = p.user_id as string
    resumo = pessoa(p.user_id, p.arroba, p.nome, p.foto)
  }
  exigirId(id)
  if (id === actor.userId) throw new DomainError('invalid_input', 'Esse é você.')
  await limite(db, `set-contato:${actor.userId}`, LIMITE_PEDIDOS_CONTATO, 'Muitos pedidos hoje. Tente amanhã.')
  try {
    const [r] = await db.asUser(ctx(actor), (tx) => tx`select zro.set_pedir_contato(${id}) as estado`)
    return { estado: r!.estado as 'pendente' | 'aceito', pessoa: resumo ?? { id: id!, arroba: null, nome: 'Pessoa', foto: null } }
  } catch (e) {
    traduzir(e, { proibido: 'Você bloqueou essa pessoa. Desbloqueie antes.', invalido: 'Pessoa não encontrada.' })
  }
}

export async function responderContatoSet(db: Database, auth: Authenticated | null, id: string, aceitar: boolean): Promise<'aceito' | 'recusado'> {
  const actor = await authorize(db, auth, { verifiedEmail: true })
  exigirId(id)
  try {
    const [r] = await db.asUser(ctx(actor), (tx) => tx`select zro.set_responder_contato(${id}, ${aceitar}) as estado`)
    return r!.estado as 'aceito' | 'recusado'
  } catch (e) {
    traduzir(e, { nao: 'Esse pedido não está mais aqui.' })
  }
}

export async function removerContatoSet(db: Database, auth: Authenticated | null, id: string): Promise<void> {
  const actor = await authorize(db, auth, {})
  exigirId(id)
  await db.asUser(ctx(actor), (tx) => tx`select zro.set_remover_contato(${id})`)
}

/** Bloquear: some presença, contato, pedido e mensagens nos dois sentidos. A pessoa bloqueada não é avisada. */
export async function bloquearSet(db: Database, auth: Authenticated | null, id: string): Promise<void> {
  const actor = await authorize(db, auth, {})
  exigirId(id)
  if (id === actor.userId) throw new DomainError('invalid_input', 'Esse é você.')
  try {
    await db.asUser(ctx(actor), (tx) => tx`select zro.set_bloquear(${id})`)
  } catch (e) {
    traduzir(e, { invalido: 'Pessoa não encontrada.' })
  }
}

export async function desbloquearSet(db: Database, auth: Authenticated | null, id: string): Promise<void> {
  const actor = await authorize(db, auth, {})
  exigirId(id)
  await db.asUser(ctx(actor), (tx) => tx`select zro.set_desbloquear(${id})`)
}

// ───────────── conversas ─────────────

function conversaDe(r: Record<string, unknown>): ConversaResumo {
  const direta = r.tipo === 'direta'
  const p = direta ? pessoa(r.outro, r.outro_arroba, r.outro_nome, r.outro_foto) : null
  const pj = !direta && r.projeto ? { id: r.projeto as string, titulo: (r.projeto_titulo as string) ?? 'Projeto' } : null
  return {
    id: r.id as string,
    tipo: direta ? 'direta' : 'projeto',
    pessoa: p,
    projeto: pj,
    titulo: p?.nome ?? pj?.titulo ?? 'Conversa',
    ultima: Number(r.ultima_seq ?? 0),
    ultimaEm: iso(r.ultima_em),
    previa: (r.previa as string) ?? null,
    previaMinha: !!r.previa_minha,
    naoLidas: Number(r.nao_lidas ?? 0),
    silenciada: !!r.silenciada,
    podeEscrever: !!r.pode_escrever,
  }
}

/** As conversas da pessoa e os projetos da organização ativa que ainda não têm conversa (para começar uma). */
export async function minhasConversasSet(
  db: Database,
  auth: Authenticated | null,
): Promise<{ conversas: ConversaResumo[]; projetos: { id: string; titulo: string }[] }> {
  const actor = await authorize(db, auth, {})
  return db.asUser(ctx(actor), async (tx) => {
    const rows = await tx`select * from zro.set_minhas_conversas(null)`
    const conversas = rows.map(conversaDe)
    const comConversa = conversas.filter((c) => c.projeto).map((c) => c.projeto!.id)
    // Projetos que a pessoa vê (RLS), na organização ativa, ainda sem conversa com mensagem.
    const projetos = await tx`
      select p.id, p.title from zro.projects p
       where p.org_id = ${actor.orgId} and p.status <> 'archived' and zro.can_view_project(p.id)
         and not (p.id = any (${comConversa}::uuid[]))
       order by p.updated_at desc limit 30`
    return { conversas, projetos: projetos.map((p) => ({ id: p.id as string, titulo: p.title as string })) }
  })
}

/**
 * Abre a conversa direta com uma pessoa (que trabalha junto ou é contato) ou a do projeto (quem vê o projeto na
 * organização ativa). Cria na primeira vez. Sem permissão: sempre a mesma resposta, sem dizer por quê.
 */
export async function abrirConversaSet(db: Database, auth: Authenticated | null, alvo: { pessoa?: string; projeto?: string }): Promise<ConversaResumo> {
  if (alvo.projeto) {
    exigirId(alvo.projeto, 'Projeto não encontrado.')
    const actor = await authorize(db, auth, { verifiedEmail: true, project: { id: alvo.projeto, access: 'view' } })
    return db.asUser(ctx(actor), async (tx) => {
      try {
        const [r] = await tx`select zro.set_abrir_projeto(${alvo.projeto!}) as id`
        const [c] = await tx`select * from zro.set_minhas_conversas(${r!.id as string})`
        return conversaDe(c!)
      } catch (e) {
        traduzir(e, { nao: 'Projeto não encontrado.' })
      }
    })
  }
  const actor = await authorize(db, auth, { verifiedEmail: true })
  const id = exigirId(alvo.pessoa ?? '')
  if (id === actor.userId) throw new DomainError('invalid_input', 'Esse é você.')
  return db.asUser(ctx(actor), async (tx) => {
    try {
      const [r] = await tx`select zro.set_abrir_direta(${id}) as id`
      const [c] = await tx`select * from zro.set_minhas_conversas(${r!.id as string})`
      return conversaDe(c!)
    } catch (e) {
      traduzir(e, { proibido: 'Para conversar, peça contato antes.' })
    }
  })
}

/** Uma conversa e as mensagens: as 50 mais novas (antes de `antes`) ou as que chegaram depois de `depois`. */
export async function lerConversaSet(
  db: Database,
  auth: Authenticated | null,
  conversaId: string,
  o: { antes?: number; depois?: number; limite?: number } = {},
): Promise<{ conversa: ConversaResumo; mensagens: MensagemSet[]; mais: boolean }> {
  const actor = await authorize(db, auth, {})
  exigirId(conversaId, 'Conversa não encontrada.')
  const limiteN = Math.min(Math.max(Math.trunc(o.limite ?? 50), 1), 100)
  return db.asUser(ctx(actor), async (tx) => {
    const [c] = await tx`select * from zro.set_minhas_conversas(${conversaId})`
    if (!c) throw new DomainError('not_found', 'Conversa não encontrada.')
    const antes = Number.isFinite(o.antes) && o.antes! > 0 ? Math.trunc(o.antes!) : null
    const depois = Number.isFinite(o.depois) && o.depois! >= 0 ? Math.trunc(o.depois!) : null
    const rows = await tx`select * from zro.set_ler_mensagens(${conversaId}, ${antes}, ${depois}, ${limiteN + 1})`
    const mais = rows.length > limiteN
    const lista = rows.slice(0, limiteN).map((r): MensagemSet => ({
      id: r.id as string,
      seq: Number(r.seq),
      autor: pessoa(r.autor, r.autor_arroba, r.autor_nome, r.autor_foto),
      minha: r.autor === actor.userId,
      texto: r.apagada ? null : ((r.texto as string) ?? null),
      criadaEm: iso(r.criada_em)!,
      editadaEm: iso(r.editada_em),
      apagada: !!r.apagada,
    }))
    // Sempre em ordem de chegada (a mais antiga primeiro).
    if (depois === null) lista.reverse()
    return { conversa: conversaDe(c), mensagens: lista, mais: depois === null ? mais : false }
  })
}

/** Envia uma mensagem (texto e links). `chave` torna o envio idempotente: repetir não duplica. */
export async function enviarMensagemSet(
  db: Database,
  auth: Authenticated | null,
  conversaId: string,
  entrada: { texto: unknown; chave?: string | null },
): Promise<{ id: string; seq: number; criadaEm: string; repetida: boolean }> {
  const actor = await authorize(db, auth, { verifiedEmail: true })
  exigirId(conversaId, 'Conversa não encontrada.')
  const texto = limparTexto(entrada.texto)
  const chave = entrada.chave ? String(entrada.chave) : null
  if (chave && !CHAVE.test(chave)) throw new DomainError('invalid_input', 'Chave de envio inválida.')
  await limite(db, `set-msg:${actor.userId}`, LIMITE_MENSAGENS, 'Muitas mensagens seguidas. Espere um pouco.')
  try {
    const [r] = await db.asUser(ctx(actor), (tx) => tx`select * from zro.set_enviar(${conversaId}, ${texto}, ${chave})`)
    return { id: r!.id as string, seq: Number(r!.seq), criadaEm: iso(r!.criada_em)!, repetida: !!r!.repetida }
  } catch (e) {
    traduzir(e, { proibido: 'Você não pode escrever nesta conversa.', invalido: 'Mensagem inválida.' })
  }
}

export async function editarMensagemSet(db: Database, auth: Authenticated | null, mensagemId: string, texto: unknown): Promise<void> {
  const actor = await authorize(db, auth, { verifiedEmail: true })
  exigirId(mensagemId, 'Mensagem não encontrada.')
  const t = limparTexto(texto)
  try {
    await db.asUser(ctx(actor), (tx) => tx`select zro.set_editar_mensagem(${mensagemId}, ${t})`)
  } catch (e) {
    traduzir(e, { nao: 'Mensagem não encontrada.', invalido: 'Dá para editar só nas primeiras 24 horas.' })
  }
}

export async function apagarMensagemSet(db: Database, auth: Authenticated | null, mensagemId: string): Promise<void> {
  const actor = await authorize(db, auth, {})
  exigirId(mensagemId, 'Mensagem não encontrada.')
  try {
    await db.asUser(ctx(actor), (tx) => tx`select zro.set_apagar_mensagem(${mensagemId})`)
  } catch (e) {
    traduzir(e, { nao: 'Mensagem não encontrada.' })
  }
}

/** Marca como lida até `seq` e liga ou desliga o silêncio da conversa. */
export async function atualizarConversaSet(
  db: Database,
  auth: Authenticated | null,
  conversaId: string,
  o: { lidaAte?: number; silenciada?: boolean },
): Promise<void> {
  const actor = await authorize(db, auth, {})
  exigirId(conversaId, 'Conversa não encontrada.')
  try {
    await db.asUser(ctx(actor), async (tx) => {
      if (typeof o.lidaAte === 'number' && Number.isFinite(o.lidaAte))
        await tx`select zro.set_marcar_lida(${conversaId}, ${Math.max(0, Math.trunc(o.lidaAte))})`
      if (typeof o.silenciada === 'boolean') await tx`select zro.set_silenciar(${conversaId}, ${o.silenciada})`
    })
  } catch (e) {
    traduzir(e, { nao: 'Conversa não encontrada.' })
  }
}

/** Denuncia uma pessoa (e, se vier, uma mensagem dela). Guarda o mínimo; a moderação vê no console. */
export async function denunciarSet(
  db: Database,
  auth: Authenticated | null,
  d: { pessoa: string; mensagem?: string | null; motivo: string; detalhe?: string | null },
): Promise<{ id: string }> {
  const actor = await authorize(db, auth, {})
  exigirId(d.pessoa)
  if (d.mensagem) exigirId(d.mensagem, 'Mensagem não encontrada.')
  if (!(MOTIVOS_DENUNCIA as readonly string[]).includes(d.motivo)) throw new DomainError('invalid_input', 'Escolha o motivo.')
  const detalhe = String(d.detalhe ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (detalhe.length > 300) throw new DomainError('invalid_input', 'Conte em até 300 caracteres.')
  await limite(db, `set-denuncia:${actor.userId}`, LIMITE_DENUNCIAS, 'Muitas denúncias hoje. Fale com o suporte.')
  try {
    const [r] = await db.asUser(ctx(actor), (tx) => tx`select zro.set_denunciar(${d.pessoa}, ${d.mensagem ?? null}, ${d.motivo}, ${detalhe || null}) as id`)
    return { id: r!.id as string }
  } catch (e) {
    traduzir(e, { nao: 'Não achamos o que denunciar.' })
  }
}

// ───────────── moderação (console, depois de requirePlatformAdmin) ─────────────

export type DenunciaSet = {
  id: string
  motivo: MotivoDenuncia
  detalhe: string | null
  criadaEm: string
  estado: 'aberta' | 'resolvida'
  denunciante: { id: string; nome: string; arroba: string | null }
  denunciado: { id: string; nome: string; arroba: string | null }
  /** O texto da mensagem denunciada (ou a versão anterior, se foi apagada). */
  mensagem: string | null
  /** Quantas denúncias abertas a pessoa denunciada tem. */
  contra: number
}

export async function denunciasSet(tx: Tx, o: { estado?: 'aberta' | 'resolvida' } = {}): Promise<DenunciaSet[]> {
  const rows = await tx`
    select d.id, d.motivo, d.detalhe, d.criada_em, d.estado,
           d.denunciante, ua.display_name as a_nome, pa.arroba as a_arroba,
           d.denunciado, ub.display_name as b_nome, pb.arroba as b_arroba,
           coalesce(m.texto, (select v.texto from zro.set_mensagem_versoes v where v.mensagem_id = m.id order by v.id desc limit 1)) as texto,
           (select count(*)::int from zro.set_denuncias x where x.denunciado = d.denunciado and x.estado = 'aberta') as contra
      from zro.set_denuncias d
      join zro.users ua on ua.id = d.denunciante
      join zro.users ub on ub.id = d.denunciado
      left join zro.perfis pa on pa.user_id = d.denunciante
      left join zro.perfis pb on pb.user_id = d.denunciado
      left join zro.set_mensagens m on m.id = d.mensagem_id
     where d.estado = ${o.estado ?? 'aberta'}
     order by d.criada_em desc limit 100`
  return rows.map((r) => ({
    id: r.id as string,
    motivo: r.motivo as MotivoDenuncia,
    detalhe: (r.detalhe as string) ?? null,
    criadaEm: iso(r.criada_em)!,
    estado: r.estado as 'aberta' | 'resolvida',
    denunciante: { id: r.denunciante as string, nome: r.a_nome as string, arroba: (r.a_arroba as string) ?? null },
    denunciado: { id: r.denunciado as string, nome: r.b_nome as string, arroba: (r.b_arroba as string) ?? null },
    mensagem: (r.texto as string) ?? null,
    contra: Number(r.contra ?? 0),
  }))
}

export async function resolverDenunciaSet(tx: Tx, adminId: string, id: string): Promise<void> {
  exigirId(id, 'Denúncia não encontrada.')
  const r = await tx`update zro.set_denuncias set estado = 'resolvida', resolvida_em = now(), resolvida_por = ${adminId}
                     where id = ${id} and estado = 'aberta' returning id`
  if (!r.length) throw new DomainError('not_found', 'Denúncia não encontrada.')
  await audit(tx, { actorUserId: adminId, actorKind: 'admin', action: 'set.denuncia.resolvida', targetType: 'set_denuncia', targetId: id })
}

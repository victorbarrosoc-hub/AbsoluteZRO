/**
 * Agenda das Conexões para os apps da família (ADR 0026; contrato em docs/integration-contracts/agenda.md). O app chama
 * com o access token da pessoa (Bearer, escopo `zro.agenda`); o HUB usa a conexão Google da pessoa e devolve só o
 * necessário. Ordem do PRD §5.2: identidade (token) → organização → vínculo → gate do app (release, canal api) →
 * limite → recurso externo (8: a conexão existe, está ativa e o app está ligado nela).
 *
 * - `livreOcupado`: intervalos ocupados nas agendas escolhidas (calculados pelos eventos, que o escopo
 *   calendar.events lê; transparentes, cancelados e recusados não contam). Por padrão sem os eventos do próprio app.
 * - `eventosDaAgenda`: eventos com campos mínimos (sem descrição, convidados ou anexos).
 * - `gravarEvento`/`apagarEvento`: evento do app na agenda principal, idempotente por (app, ref). O app e a ref vão
 *   em `extendedProperties.private` (`zro_app`, `zro_ref`); o id do evento no Google sai de sha256(pessoa, app, ref),
 *   então dois PUT ao mesmo tempo não duplicam. Um app só mexe no que tem a marca dele.
 * Auditoria em zro.audit_logs sem conteúdo de evento (só app, operação, ref, tamanho da janela e contagens).
 */
import { createHash } from 'node:crypto'
import { registerAttempt, withinLimit, type Authenticated, type Rule } from '@zro/auth'
import type { Database, UserContext } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { authorize } from './authz'
import { noGoogle, semConexao, type ChaveConexoes, type GoogleAgendaConfig } from './conexoes'

export const LIMITE_AGENDA_LEITURA: Rule = { max: 120, windowMs: 10 * 60_000 }
export const LIMITE_AGENDA_ESCRITA: Rule = { max: 300, windowMs: 10 * 60_000 }
export const JANELA_MAX_DIAS = 62
export const EVENTO_MAX_DIAS = 31
export const AGENDA_DESTINO = 'primary'
export const REF_AGENDA = /^[A-Za-z0-9._:-]{1,120}$/
const APP = /^[a-z0-9-]{1,40}$/
const DIA = /^\d{4}-\d{2}-\d{2}$/
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

export type AmbienteAgenda = { cfg: GoogleAgendaConfig; chave: ChaveConexoes }

type Preparado = { app: string; ctx: UserContext; orgId: string }

/** Autoriza o app (1–7), aplica o limite e confere a conexão e a permissão do app (8). */
async function prepararApp(
  db: Database,
  amb: AmbienteAgenda | null,
  auth: Authenticated | null,
  tipo: 'leitura' | 'escrita',
  appDoCaminho?: string,
): Promise<Preparado> {
  const app = auth?.session.app?.productId ?? null
  if (!auth || !app) throw new DomainError('action_not_allowed', 'Só um app da família usa a Agenda pela API.', { erro: 'so_app' })
  if (appDoCaminho !== undefined && appDoCaminho !== app)
    throw new DomainError('action_not_allowed', 'Cada app só mexe nos próprios eventos.', { erro: 'outro_app' })
  const actor = await authorize(db, auth, { release: { productId: app } })
  const regra = tipo === 'escrita' ? LIMITE_AGENDA_ESCRITA : LIMITE_AGENDA_LEITURA
  const chave = `agenda:${tipo}:${app}:${actor.userId}`
  const ok = await db.asSystem('agenda: limite', async (tx) => {
    if (!(await withinLimit(tx, chave, regra))) return false
    await registerAttempt(tx, chave)
    return true
  })
  if (!ok) throw new DomainError('rate_limited', 'Muitos pedidos à Agenda seguidos. Espere alguns minutos.')
  if (!amb) throw new DomainError('upstream_unavailable', 'As Conexões estão indisponíveis agora.')
  const ctx = { userId: actor.userId, orgId: actor.orgId }
  const [c] = await db.asUser(
    ctx,
    (tx) => tx`
    select c.estado, coalesce(a.ativo, true) as ativo
      from zro.conexoes c left join zro.conexao_apps a on a.conexao_id = c.id and a.app = ${app}
     where c.provedor = 'google'`,
  )
  if (!c) throw semConexao(amb.cfg, 'nenhuma')
  if (c.estado !== 'ativa') throw semConexao(amb.cfg, 'reconectar')
  if (!c.ativo) throw new DomainError('app_desligado', 'Este app está desligado nas Conexões da sua conta Absolute ZRO.', { conectar: amb.cfg.conexoesUrl })
  return { app, ctx, orgId: actor.orgId }
}

/** Marca o uso (Usado por) e audita, sem conteúdo do evento. */
async function registrar(db: Database, p: Preparado, action: string, metadata: Record<string, unknown>): Promise<void> {
  await db.asUser(p.ctx, async (tx) => {
    const [c] = await tx`update zro.conexoes set usada_em = now() where provedor = 'google' returning id`
    if (c)
      await tx`
        insert into zro.conexao_apps (conexao_id, app, usado_em) values (${c.id as string}, ${p.app}, now())
        on conflict (conexao_id, app) do update set usado_em = now()`
    await audit(tx, { orgId: p.orgId, actorUserId: p.ctx.userId, action, targetType: 'agenda', targetId: p.app, metadata: { app: p.app, ...metadata } })
  })
}

// ───────────── janela e datas ─────────────

export function lerJanela(de: unknown, ate: unknown): { de: Date; ate: Date } {
  if (typeof de !== 'string' || typeof ate !== 'string' || !RFC3339.test(de) || !RFC3339.test(ate))
    throw new DomainError('invalid_input', 'Informe de e ate em RFC 3339 com fuso (ex.: 2026-11-03T00:00:00-03:00).')
  const d = new Date(de)
  const a = new Date(ate)
  if (Number.isNaN(+d) || Number.isNaN(+a) || a <= d) throw new DomainError('invalid_input', 'O fim vem depois do início.')
  if (+a - +d > JANELA_MAX_DIAS * 86_400_000) throw new DomainError('invalid_input', `Janela de até ${JANELA_MAX_DIAS} dias.`)
  return { de: d, ate: a }
}

/** Minutos à frente do UTC num fuso, num instante. */
function deslocamento(t: number, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  )
  const comoUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!)
  return Math.round((comoUtc - t) / 60_000)
}

/** Meia-noite de um dia (AAAA-MM-DD) num fuso, como instante. */
export function meiaNoite(dia: string, fuso: string): number {
  const base = Date.parse(`${dia}T00:00:00Z`)
  let t = base - deslocamento(base, fuso) * 60_000
  t = base - deslocamento(t, fuso) * 60_000
  return t
}

function fusoValido(f: unknown): string | null {
  if (typeof f !== 'string' || f.length > 64) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: f })
    return f
  } catch {
    return null
  }
}

const somarDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// ───────────── leitura ─────────────

type EventoGoogle = Record<string, unknown> & {
  id?: string
  status?: string
  summary?: string
  transparency?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
  extendedProperties?: { private?: Record<string, string> }
}

const CAMPOS = 'timeZone,nextPageToken,items(id,status,summary,start,end,transparency,attendees(self,responseStatus),extendedProperties/private)'

async function eventosDoCalendario(
  db: Database,
  amb: AmbienteAgenda,
  ctx: UserContext,
  calendario: string,
  j: { de: Date; ate: Date },
): Promise<{ itens: EventoGoogle[]; fuso: string; ok: boolean }> {
  const itens: EventoGoogle[] = []
  let fuso = 'America/Sao_Paulo'
  let pagina: string | null = null
  for (let i = 0; i < 4; i++) {
    const q = new URLSearchParams({
      timeMin: j.de.toISOString(),
      timeMax: j.ate.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      fields: CAMPOS,
    })
    if (pagina) q.set('pageToken', pagina)
    const r = await noGoogle(db, amb.cfg, amb.chave, ctx, 'GET', `/calendar/v3/calendars/${encodeURIComponent(calendario)}/events?${q}`)
    // Agenda que sumiu ou deixou de ser compartilhada: segue com as outras e avisa (incompleta).
    if (r.status === 404 || r.status === 403 || r.status === 410) return { itens, fuso, ok: false }
    if (r.status !== 200 || !r.corpo) throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
    if (typeof r.corpo.timeZone === 'string' && fusoValido(r.corpo.timeZone)) fuso = r.corpo.timeZone
    if (Array.isArray(r.corpo.items)) itens.push(...(r.corpo.items as EventoGoogle[]))
    pagina = typeof r.corpo.nextPageToken === 'string' ? r.corpo.nextPageToken : null
    if (!pagina) break
  }
  return { itens, fuso, ok: true }
}

function intervaloDe(e: EventoGoogle, fuso: string): { ini: number; fim: number; diaInteiro: boolean } | null {
  if (e.start?.dateTime && e.end?.dateTime) {
    const ini = Date.parse(e.start.dateTime)
    const fim = Date.parse(e.end.dateTime)
    return Number.isNaN(ini) || Number.isNaN(fim) ? null : { ini, fim, diaInteiro: false }
  }
  if (e.start?.date && e.end?.date && DIA.test(e.start.date) && DIA.test(e.end.date))
    return { ini: meiaNoite(e.start.date, fuso), fim: meiaNoite(e.end.date, fuso), diaInteiro: true }
  return null
}

const recusado = (e: EventoGoogle) => !!e.attendees?.some((a) => a.self && a.responseStatus === 'declined')
const ocupa = (e: EventoGoogle) => e.status !== 'cancelled' && e.transparency !== 'transparent' && !recusado(e)

/** Junta intervalos que se tocam ou se sobrepõem. */
export function juntarIntervalos(xs: { ini: number; fim: number }[]): { ini: number; fim: number }[] {
  const s = xs.filter((x) => x.fim > x.ini).sort((a, b) => a.ini - b.ini)
  const out: { ini: number; fim: number }[] = []
  for (const x of s) {
    const u = out[out.length - 1]
    if (u && x.ini <= u.fim) u.fim = Math.max(u.fim, x.fim)
    else out.push({ ...x })
  }
  return out
}

export type LivreOcupado = { de: string; ate: string; ocupado: { inicio: string; fim: string }[]; calendarios: number; incompleta: boolean }

export async function livreOcupado(
  db: Database,
  amb: AmbienteAgenda | null,
  auth: Authenticated | null,
  q: { de?: unknown; ate?: unknown; incluirProprios?: boolean },
): Promise<LivreOcupado> {
  const j = lerJanela(q.de, q.ate)
  const p = await prepararApp(db, amb, auth, 'leitura')
  const { cfg, chave } = amb!
  const [c] = await db.asUser(p.ctx, (tx) => tx`select calendarios from zro.conexoes where provedor = 'google'`)
  const calendarios = (c?.calendarios as string[]) ?? ['primary']
  const intervalos: { ini: number; fim: number }[] = []
  let incompleta = false
  for (const cal of calendarios) {
    const r = await eventosDoCalendario(db, { cfg, chave }, p.ctx, cal, j)
    if (!r.ok) incompleta = true
    for (const e of r.itens) {
      if (!ocupa(e)) continue
      if (!q.incluirProprios && e.extendedProperties?.private?.zro_app === p.app) continue
      const i = intervaloDe(e, r.fuso)
      if (i) intervalos.push({ ini: Math.max(i.ini, +j.de), fim: Math.min(i.fim, +j.ate) })
    }
  }
  const ocupado = juntarIntervalos(intervalos).map((x) => ({ inicio: new Date(x.ini).toISOString(), fim: new Date(x.fim).toISOString() }))
  await registrar(db, p, 'agenda.livre_ocupado', { dias: Math.ceil((+j.ate - +j.de) / 86_400_000), n: ocupado.length })
  return { de: j.de.toISOString(), ate: j.ate.toISOString(), ocupado, calendarios: calendarios.length, incompleta }
}

export type EventoMinimo = {
  id: string
  calendario: string
  titulo: string
  inicio: string
  fim: string
  dia_inteiro: boolean
  ocupa: boolean
  /** App da família que criou o evento (null = criado no Google). */
  app: string | null
  /** A ref só volta para o app dono do evento. */
  ref: string | null
}

export async function eventosDaAgenda(
  db: Database,
  amb: AmbienteAgenda | null,
  auth: Authenticated | null,
  q: { de?: unknown; ate?: unknown },
): Promise<{ de: string; ate: string; eventos: EventoMinimo[]; incompleta: boolean }> {
  const j = lerJanela(q.de, q.ate)
  const p = await prepararApp(db, amb, auth, 'leitura')
  const { cfg, chave } = amb!
  const [c] = await db.asUser(p.ctx, (tx) => tx`select calendarios from zro.conexoes where provedor = 'google'`)
  const eventos: EventoMinimo[] = []
  let incompleta = false
  for (const cal of (c?.calendarios as string[]) ?? ['primary']) {
    const r = await eventosDoCalendario(db, { cfg, chave }, p.ctx, cal, j)
    if (!r.ok) incompleta = true
    for (const e of r.itens) {
      if (e.status === 'cancelled' || typeof e.id !== 'string') continue
      const i = intervaloDe(e, r.fuso)
      if (!i) continue
      const dono = e.extendedProperties?.private?.zro_app ?? null
      eventos.push({
        id: e.id,
        calendario: cal,
        titulo: String(e.summary ?? '(sem título)').slice(0, 200),
        inicio: i.diaInteiro ? e.start!.date! : new Date(i.ini).toISOString(),
        fim: i.diaInteiro ? e.end!.date! : new Date(i.fim).toISOString(),
        dia_inteiro: i.diaInteiro,
        ocupa: ocupa(e),
        app: dono && APP.test(dono) ? dono : null,
        ref: dono === p.app ? (e.extendedProperties?.private?.zro_ref ?? null) : null,
      })
    }
  }
  eventos.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
  const saida = eventos.slice(0, 500)
  await registrar(db, p, 'agenda.eventos', { dias: Math.ceil((+j.ate - +j.de) / 86_400_000), n: saida.length })
  return { de: j.de.toISOString(), ate: j.ate.toISOString(), eventos: saida, incompleta: incompleta || eventos.length > saida.length }
}

// ───────────── escrita ─────────────

export type EventoDoApp = {
  titulo: string
  /** Com hora: início e fim em RFC 3339 com fuso. */
  inicio?: string
  fim?: string
  /** Dia inteiro: AAAA-MM-DD (e `ate_dia`, inclusivo). */
  dia?: string
  ate_dia?: string
  local?: string | null
  descricao?: string | null
  fuso?: string
  /** false = aparece como "livre" (prazo, lembrete). Padrão true. */
  ocupa?: boolean
  /** Link https de volta para o app. */
  link?: string | null
}

const NOME_DO_APP: Record<string, string> = { maestro: 'Maestro' }

/** Confere o corpo e monta o evento do Google (sem id e sem marca: entram na gravação). */
export function eventoParaGoogle(app: string, ref: string, b: unknown): Record<string, unknown> {
  const e = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
  const titulo = typeof e.titulo === 'string' ? e.titulo.trim() : ''
  if (!titulo || titulo.length > 200) throw new DomainError('invalid_input', 'titulo: de 1 a 200 caracteres.')
  const fuso = e.fuso === undefined ? 'America/Sao_Paulo' : fusoValido(e.fuso)
  if (!fuso) throw new DomainError('invalid_input', 'fuso: use um fuso IANA (ex.: America/Sao_Paulo).')
  let start: Record<string, string>
  let end: Record<string, string>
  if (typeof e.dia === 'string') {
    const ate = e.ate_dia === undefined || e.ate_dia === null ? e.dia : e.ate_dia
    if (!DIA.test(e.dia) || typeof ate !== 'string' || !DIA.test(ate) || Number.isNaN(Date.parse(e.dia)) || Number.isNaN(Date.parse(ate)) || ate < e.dia)
      throw new DomainError('invalid_input', 'dia e ate_dia: AAAA-MM-DD, o fim no mesmo dia ou depois.')
    if (Date.parse(ate) - Date.parse(e.dia) > EVENTO_MAX_DIAS * 86_400_000) throw new DomainError('invalid_input', `Evento de até ${EVENTO_MAX_DIAS} dias.`)
    start = { date: e.dia }
    end = { date: somarDia(ate, 1) }
  } else {
    if (typeof e.inicio !== 'string' || typeof e.fim !== 'string' || !RFC3339.test(e.inicio) || !RFC3339.test(e.fim))
      throw new DomainError('invalid_input', 'Informe inicio e fim (RFC 3339 com fuso) ou dia.')
    const ini = Date.parse(e.inicio)
    const fim = Date.parse(e.fim)
    if (Number.isNaN(ini) || Number.isNaN(fim) || fim <= ini) throw new DomainError('invalid_input', 'O fim vem depois do início.')
    if (fim - ini > EVENTO_MAX_DIAS * 86_400_000) throw new DomainError('invalid_input', `Evento de até ${EVENTO_MAX_DIAS} dias.`)
    start = { dateTime: e.inicio, timeZone: fuso }
    end = { dateTime: e.fim, timeZone: fuso }
  }
  const texto = (v: unknown, max: number, nome: string) => {
    if (v === undefined || v === null || v === '') return undefined
    if (typeof v !== 'string' || v.length > max) throw new DomainError('invalid_input', `${nome}: até ${max} caracteres.`)
    return v
  }
  const local = texto(e.local, 300, 'local')
  const descricao = texto(e.descricao, 4000, 'descricao')
  if (e.ocupa !== undefined && typeof e.ocupa !== 'boolean') throw new DomainError('invalid_input', 'ocupa: verdadeiro ou falso.')
  let link: string | undefined
  if (e.link !== undefined && e.link !== null && e.link !== '') {
    let u: URL | null = null
    try {
      u = typeof e.link === 'string' && e.link.length <= 500 ? new URL(e.link) : null
    } catch {
      u = null
    }
    if (!u || u.protocol !== 'https:' || u.username || u.password) throw new DomainError('invalid_input', 'link: endereço https.')
    link = u.toString()
  }
  return {
    summary: titulo,
    ...(local ? { location: local } : { location: '' }),
    ...(descricao ? { description: descricao } : { description: '' }),
    start,
    end,
    status: 'confirmed',
    transparency: e.ocupa === false ? 'transparent' : 'opaque',
    extendedProperties: { private: { zro_app: app, zro_ref: ref } },
    ...(link ? { source: { title: NOME_DO_APP[app] ?? app, url: link } } : {}),
  }
}

/** O id do evento no Google para (pessoa, app, ref): base32hex aceito pelo Google (só 0-9a-f). */
export const idDoEvento = (userId: string, app: string, ref: string) => createHash('sha256').update(`${userId}:${app}:${ref}`).digest('hex').slice(0, 32)

const doApp = (e: EventoGoogle | null, app: string, ref: string) =>
  !!e && e.extendedProperties?.private?.zro_app === app && e.extendedProperties?.private?.zro_ref === ref

function conferirCaminho(app: unknown, ref: unknown): { app: string; ref: string } {
  if (typeof app !== 'string' || !APP.test(app)) throw new DomainError('invalid_input', 'App inválido.')
  if (typeof ref !== 'string' || !REF_AGENDA.test(ref))
    throw new DomainError('invalid_input', 'ref: letras, números, ponto, dois-pontos, hífen e sublinhado (até 120).')
  return { app, ref }
}

const caminhoEventos = `/calendar/v3/calendars/${AGENDA_DESTINO}/events`

/** Procura o evento do app pela marca (o id direto e, se não houver, a busca por privateExtendedProperty). */
async function acharDoApp(db: Database, amb: AmbienteAgenda, p: Preparado, ref: string): Promise<{ id: string; evento: EventoGoogle } | null> {
  const id = idDoEvento(p.ctx.userId, p.app, ref)
  const g = await noGoogle(db, amb.cfg, amb.chave, p.ctx, 'GET', `${caminhoEventos}/${id}`)
  if (g.status === 200) {
    const e = g.corpo as EventoGoogle
    if (!doApp(e, p.app, ref)) throw new DomainError('conflict', 'Já existe um evento com esse id que não é deste app.')
    return { id, evento: e }
  }
  if (g.status !== 404 && g.status !== 410) throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
  const q = new URLSearchParams({ maxResults: '5', showDeleted: 'false' })
  q.append('privateExtendedProperty', `zro_app=${p.app}`)
  q.append('privateExtendedProperty', `zro_ref=${ref}`)
  const b = await noGoogle(db, amb.cfg, amb.chave, p.ctx, 'GET', `${caminhoEventos}?${q}`)
  if (b.status !== 200) throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
  const achado = ((b.corpo?.items as EventoGoogle[] | undefined) ?? []).find((e) => typeof e.id === 'string' && doApp(e, p.app, ref))
  return achado ? { id: achado.id!, evento: achado } : null
}

export async function gravarEvento(
  db: Database,
  amb: AmbienteAgenda | null,
  auth: Authenticated | null,
  caminho: { app: unknown; ref: unknown },
  corpo: unknown,
): Promise<{ id: string; criado: boolean; link: string | null }> {
  const { app, ref } = conferirCaminho(caminho.app, caminho.ref)
  const p = await prepararApp(db, amb, auth, 'escrita', app)
  const ev = eventoParaGoogle(app, ref, corpo)
  const a = amb!
  const existente = await acharDoApp(db, a, p, ref)
  let r
  let criado = false
  if (existente) {
    r = await noGoogle(db, a.cfg, a.chave, p.ctx, 'PUT', `${caminhoEventos}/${existente.id}`, ev)
    criado = existente.evento.status === 'cancelled'
  } else {
    const id = idDoEvento(p.ctx.userId, app, ref)
    r = await noGoogle(db, a.cfg, a.chave, p.ctx, 'POST', caminhoEventos, { ...ev, id })
    criado = true
    // Outro pedido criou no meio do caminho, ou o id ficou de um evento apagado: atualiza o mesmo id.
    if (r.status === 409) {
      const g = await noGoogle(db, a.cfg, a.chave, p.ctx, 'GET', `${caminhoEventos}/${id}`)
      if (g.status !== 200 || !doApp(g.corpo as EventoGoogle, app, ref))
        throw new DomainError('conflict', 'Já existe um evento com esse id que não é deste app.')
      criado = (g.corpo as EventoGoogle).status === 'cancelled'
      r = await noGoogle(db, a.cfg, a.chave, p.ctx, 'PUT', `${caminhoEventos}/${id}`, ev)
    }
  }
  if (r.status !== 200 && r.status !== 201) {
    if (r.status === 400) throw new DomainError('invalid_input', 'O Google recusou o evento (confira datas e fuso).')
    throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
  }
  const id = String(r.corpo?.id ?? '')
  await registrar(db, p, 'agenda.evento.gravado', { ref, criado })
  return { id, criado, link: typeof r.corpo?.htmlLink === 'string' ? r.corpo.htmlLink : null }
}

export async function apagarEvento(
  db: Database,
  amb: AmbienteAgenda | null,
  auth: Authenticated | null,
  caminho: { app: unknown; ref: unknown },
): Promise<{ apagado: boolean }> {
  const { app, ref } = conferirCaminho(caminho.app, caminho.ref)
  const p = await prepararApp(db, amb, auth, 'escrita', app)
  const a = amb!
  const existente = await acharDoApp(db, a, p, ref)
  let apagado = false
  if (existente && existente.evento.status !== 'cancelled') {
    const r = await noGoogle(db, a.cfg, a.chave, p.ctx, 'DELETE', `${caminhoEventos}/${existente.id}`)
    if (r.status !== 204 && r.status !== 200 && r.status !== 404 && r.status !== 410)
      throw new DomainError('upstream_unavailable', 'O Google não respondeu agora. Tente de novo.')
    apagado = r.status === 204 || r.status === 200
  }
  await registrar(db, p, 'agenda.evento.apagado', { ref, apagado })
  return { apagado }
}

// ───────────── estado para o app ─────────────

export type EstadoDaAgenda = {
  conectada: boolean
  estado: 'ativa' | 'reconectar' | null
  conta_email: string | null
  app_ligado: boolean
  calendarios: number
  conectar: string
}

/** O app pergunta como está a conexão (para mostrar na tela dele). Sem conexão também é 200. */
export async function estadoDaAgenda(db: Database, amb: AmbienteAgenda | null, auth: Authenticated | null): Promise<EstadoDaAgenda> {
  const app = auth?.session.app?.productId ?? null
  if (!auth || !app) throw new DomainError('action_not_allowed', 'Só um app da família usa a Agenda pela API.', { erro: 'so_app' })
  const actor = await authorize(db, auth, { release: { productId: app } })
  if (!amb) throw new DomainError('upstream_unavailable', 'As Conexões estão indisponíveis agora.')
  const [c] = await db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select c.estado, c.conta_email, cardinality(c.calendarios) as n, coalesce(a.ativo, true) as ativo
      from zro.conexoes c left join zro.conexao_apps a on a.conexao_id = c.id and a.app = ${app}
     where c.provedor = 'google'`,
  )
  return {
    conectada: !!c && c.estado === 'ativa',
    estado: (c?.estado as EstadoDaAgenda['estado']) ?? null,
    conta_email: (c?.conta_email as string) ?? null,
    app_ligado: c ? !!c.ativo : true,
    calendarios: c ? Number(c.n) : 0,
    conectar: amb.cfg.conexoesUrl,
  }
}

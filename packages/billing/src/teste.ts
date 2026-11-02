/**
 * Teste de 15 dias do Absoluto como CAMPANHA (titular, 02/11/2026; ADR 0039, migração 0055).
 * - Desligado por padrão. Só a administração liga (com data de fim) e desliga; tudo vai para audit_logs.
 * - Campanha ligada: conta NOVA (criada durante a campanha) ganha o teste quando tem e-mail confirmado e uma
 *   organização dela; conta que já existia no Zero (criada depois da publicação dos planos e antes da campanha) ganha
 *   no momento em que a campanha começa, uma vez. Conta antiga (de antes da publicação, legado) não entra: já tem tudo.
 * - Depois do fim (ou desligada), conta nova fica no Zero. Quem ganhou dentro da campanha mantém o teste até o fim dele.
 * - Uma vez por pessoa: zro.testes (uma linha por conta) e o e-mail normalizado em hash (zro.teste_sinais, sobrevive à
 *   exclusão da conta). E-mail descartável conhecido não ganha. No máximo `limite_ip_dia` testes por IP em 24 h (IP só
 *   em hash, HMAC com ZRO_IP_HASH_SECRET; sem o segredo o IP não é guardado e esse limite não vale). Recusa por abuso
 *   fica em zro.teste_recusas para o console contar.
 * - O teste é uma assinatura `trialing` (provider 'trial', sem cartão) do plano da campanha (Absoluto), com a Z da
 *   campanha (50 mensagens) valendo para o período inteiro.
 */
import { createHash, createHmac } from 'node:crypto'
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { recomputeEntitlements } from './entitlements'

type Actor = { userId: string; reason: string }

/** Domínios de e-mail descartável conhecidos (lista curta de propósito; aumentar aqui). */
export const EMAILS_DESCARTAVEIS = new Set([
  '10minutemail.com',
  '20minutemail.com',
  'burnermail.io',
  'discard.email',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'mailinator.com',
  'maildrop.cc',
  'mailnesia.com',
  'mintemail.com',
  'minuteinbox.com',
  'mohmal.com',
  'moakt.com',
  'sharklasers.com',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempmail.com',
  'tempmail.net',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
])

/**
 * E-mail como a trava conta "uma pessoa": minúsculas; sem +sufixo; no Gmail (e googlemail), sem os pontos do nome.
 * "Fu.Lano+teste@GoogleMail.com" → "fulano@gmail.com".
 */
export function normalizarEmailTeste(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1) return e
  let nome = e.slice(0, at).split('+')[0]!
  let dominio = e.slice(at + 1)
  if (dominio === 'googlemail.com') dominio = 'gmail.com'
  if (dominio === 'gmail.com') nome = nome.replace(/\./g, '')
  return `${nome}@${dominio}`
}

export const emailDescartavel = (email: string) => {
  const d = normalizarEmailTeste(email).split('@')[1] ?? ''
  return EMAILS_DESCARTAVEIS.has(d) || [...EMAILS_DESCARTAVEIS].some((x) => d.endsWith(`.${x}`))
}

/** Hash de um sinal (e-mail normalizado): HMAC com o segredo do servidor quando há; senão sha256 (e-mail só, nunca IP). */
export function hashSinal(valor: string, secret = process.env.ZRO_IP_HASH_SECRET || ''): string {
  return secret ? createHmac('sha256', secret).update(`teste:${valor}`).digest('hex') : createHash('sha256').update(`teste:${valor}`).digest('hex')
}

export type Campanha = {
  id: string
  inicio: Date
  fim: Date
  desligadaEm: Date | null
  dias: number
  zMensagens: number
  planoCode: string
  limiteIpDia: number
  incluirExistentes: boolean
  /** Ligada e dentro das datas agora. */
  ativa: boolean
}

const rowToCampanha = (r: Record<string, unknown>, now: Date): Campanha => {
  const inicio = r.inicio as Date
  const fim = r.fim as Date
  const desligadaEm = (r.desligada_em as Date) ?? null
  return {
    id: r.id as string,
    inicio,
    fim,
    desligadaEm,
    dias: Number(r.dias),
    zMensagens: Number(r.z_mensagens),
    planoCode: r.plano_code as string,
    limiteIpDia: Number(r.limite_ip_dia),
    incluirExistentes: !!r.incluir_existentes,
    ativa: !desligadaEm && inicio <= now && fim > now,
  }
}

/** A campanha mais recente (ativa ou não). null = nunca houve campanha. */
export async function campanhaAtual(tx: Queryable, now = new Date()): Promise<Campanha | null> {
  const [r] = await tx`select * from zro.teste_campanhas order by criada_em desc limit 1`
  return r ? rowToCampanha(r, now) : null
}

async function publicadoEm(tx: Queryable): Promise<Date> {
  const [r] = await tx`select value ->> 'publicado_em' as at from zro.platform_settings where key = 'planos_b'`
  return r?.at ? new Date(r.at as string) : new Date(0)
}

export type MotivoSemTeste =
  | 'campanha_desligada'
  | 'fora_da_campanha'
  | 'email_nao_confirmado'
  | 'conta_inativa'
  | 'conta_antiga'
  | 'ja_teve'
  | 'sem_organizacao'
  | 'ja_assina'
  | 'sem_plano'
  | 'email_repetido'
  | 'email_descartavel'
  | 'limite_ip'

export type ResultadoTeste = { ok: true; fim: Date; orgId: string } | { ok: false; motivo: MotivoSemTeste }

const ABUSO: MotivoSemTeste[] = ['email_repetido', 'email_descartavel', 'limite_ip']

/**
 * Tenta começar o teste da pessoa. Idempotente e seguro de chamar em qualquer gatilho (criar organização, confirmar
 * e-mail, início da campanha): só começa uma vez, e só se tudo bater.
 * - `origem` 'conta_nova': a conta precisa ter nascido durante a campanha. 'inicio_campanha': o lote do começo.
 * - `ipHash`: o do pedido (hashIp); null = sem limite por IP (sem segredo configurado ou lote sem IP conhecido).
 */
export async function iniciarTeste(
  tx: Queryable,
  input: { userId: string; orgId?: string | null; ipHash?: string | null; origem: 'conta_nova' | 'inicio_campanha' },
  now = new Date(),
): Promise<ResultadoTeste> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${'teste:' + input.userId}, 0))`
  const camp = await campanhaAtual(tx, now)
  if (!camp?.ativa) return { ok: false, motivo: 'campanha_desligada' }
  const [u] = await tx`select id, email, status, email_verified_at, created_at from zro.users where id = ${input.userId}`
  if (!u || u.status !== 'active') return { ok: false, motivo: 'conta_inativa' }
  if ((u.created_at as Date) < (await publicadoEm(tx))) return { ok: false, motivo: 'conta_antiga' }
  if (input.origem === 'conta_nova' && (u.created_at as Date) < camp.inicio) return { ok: false, motivo: 'fora_da_campanha' }
  if (input.origem === 'inicio_campanha' && (u.created_at as Date) >= camp.inicio) return { ok: false, motivo: 'fora_da_campanha' }
  if (!u.email_verified_at) return { ok: false, motivo: 'email_nao_confirmado' }
  const [ja] = await tx`select 1 from zro.testes where user_id = ${input.userId}`
  if (ja) return { ok: false, motivo: 'ja_teve' }

  // A organização do teste: a pedida (se a pessoa for dona) ou a mais antiga de que ela é dona.
  const [org] = await tx`
    select o.id from zro.memberships m join zro.organizations o on o.id = m.org_id
    where m.user_id = ${input.userId} and m.role = 'owner' and m.status = 'active' and o.status = 'active'
      and (${input.orgId ?? null}::uuid is null or o.id = ${input.orgId ?? null}::uuid)
    order by o.created_at limit 1`
  if (!org) return { ok: false, motivo: 'sem_organizacao' }
  const orgId = org.id as string
  const [legado] = await tx`select 1 from zro.entitlements where org_id = ${orgId} and status = 'active' and legado limit 1`
  if (legado) return { ok: false, motivo: 'conta_antiga' }
  const [paga] = await tx`
    select 1 from zro.subscriptions where org_id = ${orgId} and provider not in ('free', 'trial')
      and status in ('active', 'trialing', 'past_due') and (current_period_end is null or current_period_end > ${now}) limit 1`
  if (paga) return { ok: false, motivo: 'ja_assina' }
  const [plan] = await tx`select id from zro.plans where code = ${camp.planoCode} and status = 'active' order by version desc limit 1`
  if (!plan) return { ok: false, motivo: 'sem_plano' }

  // Travas contra várias contas.
  const recusa = async (motivo: MotivoSemTeste): Promise<ResultadoTeste> => {
    await tx`insert into zro.teste_recusas (user_id, campanha_id, motivo) values (${input.userId}, ${camp.id}, ${motivo})
             on conflict (user_id, campanha_id, motivo) do nothing`
    return { ok: false, motivo }
  }
  const email = normalizarEmailTeste(u.email as string)
  if (emailDescartavel(email)) return recusa('email_descartavel')
  const emailHash = hashSinal(email)
  const [repetido] = await tx`select 1 from zro.teste_sinais where tipo = 'email' and valor_hash = ${emailHash}`
  if (repetido) return recusa('email_repetido')
  if (input.ipHash) {
    const [n] = await tx`
      select count(*)::int as n from zro.teste_sinais
      where tipo = 'ip' and valor_hash = ${input.ipHash} and criado_em > ${new Date(now.getTime() - 86_400_000)}`
    if (Number(n?.n ?? 0) >= camp.limiteIpDia) return recusa('limite_ip')
  }

  const fim = new Date(now.getTime() + camp.dias * 86_400_000)
  const [sub] = await tx`
    insert into zro.subscriptions (org_id, plan_id, status, current_period_start, current_period_end, provider, provider_subscription_id, provider_updated_at)
    values (${orgId}, ${plan.id as string}, 'trialing', ${now}, ${fim}, 'trial', ${'teste-' + input.userId}, ${now})
    returning id`
  await tx`
    insert into zro.testes (user_id, org_id, subscription_id, campanha_id, origem, inicio, fim, z_mensagens)
    values (${input.userId}, ${orgId}, ${sub!.id as string}, ${camp.id}, ${input.origem}, ${now}, ${fim}, ${camp.zMensagens})`
  await tx`insert into zro.teste_sinais (tipo, valor_hash) values ('email', ${emailHash})`
  if (input.ipHash) await tx`insert into zro.teste_sinais (tipo, valor_hash) values ('ip', ${input.ipHash})`
  await recomputeEntitlements(tx, orgId, now)
  await audit(tx, {
    orgId,
    actorUserId: input.userId,
    actorKind: 'system',
    action: 'billing.teste_iniciado',
    targetType: 'subscription',
    targetId: sub!.id as string,
    metadata: { campanha: camp.id, origem: input.origem, ate: fim.toISOString(), plano: camp.planoCode },
  })
  return { ok: true, fim, orgId }
}

export const motivoEhAbuso = (m: MotivoSemTeste) => ABUSO.includes(m)

/**
 * Liga a campanha (admin). Fecha a anterior, se aberta. Com `incluirExistentes`, as contas do Zero que já existiam
 * (criadas depois da publicação dos planos e antes de agora) ganham o teste agora, uma vez.
 */
export async function ligarCampanha(
  tx: Queryable,
  actor: Actor,
  input: { fim: Date; dias?: number; zMensagens?: number; limiteIpDia?: number; incluirExistentes?: boolean; planoCode?: string },
  now = new Date(),
): Promise<{ campanhaId: string; iniciados: number; recusados: number }> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  if (!(input.fim > now)) throw new DomainError('invalid_input', 'O fim da campanha precisa ser no futuro.')
  const dias = input.dias ?? 15
  if (!Number.isInteger(dias) || dias < 1 || dias > 60) throw new DomainError('invalid_input', 'Teste entre 1 e 60 dias.')
  const z = input.zMensagens ?? 50
  if (!Number.isInteger(z) || z < 0 || z > 10000) throw new DomainError('invalid_input', 'Mensagens da Z entre 0 e 10.000.')
  const ip = input.limiteIpDia ?? 3
  if (!Number.isInteger(ip) || ip < 1 || ip > 100) throw new DomainError('invalid_input', 'Limite por IP entre 1 e 100.')
  const plano = input.planoCode ?? 'absoluto'
  const [plan] = await tx`select 1 from zro.plans where code = ${plano} and status = 'active' limit 1`
  if (!plan) throw new DomainError('invalid_input', 'O plano do teste não está ativo.')
  await tx`select pg_advisory_xact_lock(hashtextextended('teste:campanha', 0))`
  await tx`update zro.teste_campanhas set desligada_em = ${now}, desligada_por = ${actor.userId} where desligada_em is null`
  const [c] = await tx`
    insert into zro.teste_campanhas (inicio, fim, dias, z_mensagens, plano_code, limite_ip_dia, incluir_existentes, ligada_por, motivo)
    values (${now}, ${input.fim}, ${dias}, ${z}, ${plano}, ${ip}, ${input.incluirExistentes ?? true}, ${actor.userId}, ${actor.reason})
    returning id`
  const campanhaId = c!.id as string
  let iniciados = 0
  let recusados = 0
  if (input.incluirExistentes ?? true) {
    const pessoas = await tx`
      select u.id, (select s.ip_hash from zro.sessions s where s.user_id = u.id and s.ip_hash is not null order by s.created_at limit 1) as ip_hash
      from zro.users u
      where u.status = 'active' and u.email_verified_at is not null and u.created_at < ${now}
        and u.created_at >= coalesce((select (value ->> 'publicado_em')::timestamptz from zro.platform_settings where key = 'planos_b'), 'epoch')
        and not exists (select 1 from zro.testes t where t.user_id = u.id)
      order by u.created_at`
    for (const p of pessoas) {
      const r = await iniciarTeste(tx, { userId: p.id as string, ipHash: (p.ip_hash as string) ?? null, origem: 'inicio_campanha' }, now)
      if (r.ok) iniciados++
      else if (motivoEhAbuso(r.motivo)) recusados++
    }
  }
  await audit(tx, {
    orgId: null,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.teste_campanha_ligada',
    targetType: 'platform',
    targetId: campanhaId,
    metadata: {
      inicio: now.toISOString(),
      fim: input.fim.toISOString(),
      dias,
      zMensagens: z,
      limiteIpDia: ip,
      plano,
      iniciados,
      recusados,
      reason: actor.reason,
    },
  })
  return { campanhaId, iniciados, recusados }
}

/** Desliga a campanha agora (admin). Quem já está em teste mantém até o fim. */
export async function desligarCampanha(tx: Queryable, actor: Actor, now = new Date()): Promise<boolean> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  const rows = await tx`update zro.teste_campanhas set desligada_em = ${now}, desligada_por = ${actor.userId} where desligada_em is null returning id`
  if (!rows.length) return false
  await audit(tx, {
    orgId: null,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.teste_campanha_desligada',
    targetType: 'platform',
    targetId: rows[0]!.id as string,
    metadata: { em: now.toISOString(), reason: actor.reason },
  })
  return true
}

/** Encerra agora (admin) o teste de uma pessoa. A conta volta ao Zero (ou ao que tiver). */
export async function encerrarTeste(tx: Queryable, actor: Actor, userId: string, now = new Date()): Promise<void> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  const [t] = await tx`
    update zro.testes set encerrado_em = ${now} where user_id = ${userId} and encerrado_em is null and fim > ${now}
    returning org_id, subscription_id`
  if (!t) throw new DomainError('not_found', 'Esta pessoa não está em teste.')
  if (t.subscription_id) {
    await tx`update zro.subscriptions set status = 'canceled', canceled_at = ${now}, cancel_at_period_end = false,
               current_period_end = least(coalesce(current_period_end, ${now}), ${now}) where id = ${t.subscription_id as string}`
  }
  if (t.org_id) await recomputeEntitlements(tx, t.org_id as string, now)
  await audit(tx, {
    orgId: (t.org_id as string) ?? null,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.teste_encerrado',
    targetType: 'user',
    targetId: userId,
    metadata: { reason: actor.reason },
  })
}

/** Estende (admin) o teste em andamento de uma pessoa por mais `dias`. */
export async function estenderTeste(tx: Queryable, actor: Actor, userId: string, dias: number, now = new Date()): Promise<Date> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  if (!Number.isInteger(dias) || dias < 1 || dias > 60) throw new DomainError('invalid_input', 'Estenda entre 1 e 60 dias.')
  const [t] = await tx`
    update zro.testes set fim = fim + make_interval(days => ${dias}) where user_id = ${userId} and encerrado_em is null and fim > ${now}
    returning org_id, subscription_id, fim`
  if (!t) throw new DomainError('not_found', 'Esta pessoa não está em teste.')
  if (t.subscription_id) await tx`update zro.subscriptions set current_period_end = ${t.fim as Date} where id = ${t.subscription_id as string}`
  if (t.org_id) await recomputeEntitlements(tx, t.org_id as string, now)
  await audit(tx, {
    orgId: (t.org_id as string) ?? null,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.teste_estendido',
    targetType: 'user',
    targetId: userId,
    metadata: { dias, ate: (t.fim as Date).toISOString(), reason: actor.reason },
  })
  return t.fim as Date
}

/** Resumo para o console: a campanha, testes ativos e recusas por abuso (na campanha atual e no total). */
export async function resumoTestes(tx: Queryable, now = new Date()) {
  const campanha = await campanhaAtual(tx, now)
  const [n] = await tx`
    select (select count(*)::int from zro.testes where encerrado_em is null and fim > ${now}) as ativos,
           (select count(*)::int from zro.testes) as total,
           (select count(*)::int from zro.teste_recusas) as recusados,
           (select count(*)::int from zro.teste_recusas where campanha_id = ${campanha?.id ?? null}::uuid) as recusados_campanha`
  const porMotivo = await tx`select motivo, count(*)::int as n from zro.teste_recusas group by motivo order by motivo`
  return {
    campanha,
    ativos: Number(n!.ativos),
    total: Number(n!.total),
    recusados: Number(n!.recusados),
    recusadosCampanha: Number(n!.recusados_campanha),
    porMotivo: Object.fromEntries(porMotivo.map((r) => [r.motivo as string, Number(r.n)])) as Record<string, number>,
  }
}

/** Testes em andamento (console), mais novos primeiro. */
export async function testesAtivos(tx: Queryable, now = new Date(), limite = 100) {
  return tx`
    select t.user_id, t.inicio, t.fim, t.origem, u.display_name, u.email, o.name as org
    from zro.testes t join zro.users u on u.id = t.user_id left join zro.organizations o on o.id = t.org_id
    where t.encerrado_em is null and t.fim > ${now} order by t.inicio desc limit ${limite}`
}

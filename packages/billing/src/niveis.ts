/**
 * Níveis por app e catálogo de limites (ADR 0039, migração 0055).
 * - Nível: 'zero' | 'orbita' | 'absoluto', um por app que existe para a pessoa (gate 0049), saído do banco
 *   (zro.niveis_efetivos): teste do Absoluto, assinatura, avulso (Absoluto só naquele app), concessão, legado e admin.
 * - Catálogo (zro.plan_limits): nível × produto × chave → número; null = sem limite; recurso = 1 (sim) ou 0 (não).
 * - Conta antiga (origem 'legado'): nível Absoluto nos apps que já tinha, SEM os limites novos (todo número sai null;
 *   recurso sai 1). Quem já existia continua exatamente com o que tinha (titular, 02/11/2026).
 * - Z: mensagens por mês vêm dos planos (limite zro.ai_credits); o teste, da campanha.
 */
import type { Queryable } from '@zro/db'
import { peekQuota, quotaPeriod, saldoRecarga } from './quotas'

export const NIVEIS = ['zero', 'orbita', 'absoluto'] as const
export type Nivel = (typeof NIVEIS)[number]
export type OrigemNivel = 'zero' | 'assinatura' | 'avulso' | 'teste' | 'concessao' | 'legado' | 'admin'

export type NivelDoApp = { productId: string; nivel: Nivel; origem: OrigemNivel; ate: Date | null }

export const NIVEL_NOME: Record<Nivel, string> = { zero: 'Zero', orbita: 'Órbita', absoluto: 'Absoluto' }

/** Nível efetivo de cada app para a pessoa na organização (sem organização: Zero em tudo; admin: Absoluto em tudo). */
export async function niveisEfetivos(tx: Queryable, userId: string, orgId: string | null): Promise<NivelDoApp[]> {
  const rows = await tx`select product_id, nivel, origem, ate from zro.niveis_efetivos(${userId}::uuid, ${orgId}::uuid)`
  return rows.map((r) => ({
    productId: r.product_id as string,
    nivel: r.nivel as Nivel,
    origem: r.origem as OrigemNivel,
    ate: (r.ate as Date) ?? null,
  }))
}

/** Claim zro_nivel: { produto: nível }. */
export const nivelClaim = (niveis: NivelDoApp[]): Record<string, Nivel> => Object.fromEntries(niveis.map((n) => [n.productId, n.nivel]))

/** Teste do Absoluto em andamento para a pessoa nesta organização: até quando. */
export async function testeAtivoAte(tx: Queryable, userId: string, orgId: string | null, now = new Date()): Promise<Date | null> {
  if (!orgId) return null
  const [r] = await tx`
    select t.fim from zro.testes t join zro.subscriptions s on s.id = t.subscription_id
    where t.user_id = ${userId} and t.org_id = ${orgId} and t.encerrado_em is null and t.fim > ${now}
      and s.status = 'trialing' and (s.current_period_end is null or s.current_period_end > ${now})`
  return (r?.fim as Date) ?? null
}

export type LimiteDoCatalogo = {
  rotulo: string
  tipo: 'quantidade' | 'recurso'
  periodo: 'mes' | null
  unidade: string | null
  valores: Record<Nivel, number | null>
}

/**
 * Catálogo dos números por app (sem dado de pessoa). `visivelPara`: só os apps que existem para essa pessoa; null =
 * anônimo (só os apps abertos ao público).
 */
export async function catalogoLimites(tx: Queryable, visivelPara: string | null = null): Promise<Record<string, Record<string, LimiteDoCatalogo>>> {
  const rows = await tx`
    select k.product_id, k.chave, k.rotulo, k.tipo, k.periodo, k.unidade, l.nivel, l.valor
    from zro.plan_limit_keys k join zro.plan_limits l on l.product_id = k.product_id and l.chave = k.chave
    join zro.products p on p.id = k.product_id
    where zro.release_visible(k.product_id, ${visivelPara}::uuid)
    order by p.step_order, k.ordem, k.chave`
  const out: Record<string, Record<string, LimiteDoCatalogo>> = {}
  for (const r of rows) {
    const prod = (out[r.product_id as string] ??= {})
    const item = (prod[r.chave as string] ??= {
      rotulo: r.rotulo as string,
      tipo: r.tipo as LimiteDoCatalogo['tipo'],
      periodo: (r.periodo as 'mes' | null) ?? null,
      unidade: (r.unidade as string) ?? null,
      valores: { zero: null, orbita: null, absoluto: null },
    })
    item.valores[r.nivel as Nivel] = r.valor == null ? null : Number(r.valor)
  }
  return out
}

/** A Z por plano: mensagens por mês em cada nível, no avulso e no teste, e os pacotes de recarga à venda. */
export async function zCatalogo(tx: Queryable) {
  const planos = await tx`
    select p.kind, p.nivel, max((pp.limits ->> 'zro.ai_credits')::int) as z
    from zro.plans p join zro.plan_products pp on pp.plan_id = p.id
    where p.status = 'active' and not p.legado and p.nivel is not null and pp.limits ? 'zro.ai_credits'
    group by p.kind, p.nivel`
  const de = (f: (r: Record<string, unknown>) => boolean) => {
    const r = planos.find(f)
    return r ? Number(r.z) : null
  }
  const [camp] = await tx`select z_mensagens from zro.teste_campanhas order by criada_em desc limit 1`
  const pacotes = await tx`select code, mensagens, price_cents, currency, validade_meses from zro.z_recarga_pacotes where status = 'active' order by mensagens`
  return {
    mensagens_por_mes: {
      zero: de((r) => r.nivel === 'zero'),
      orbita: de((r) => r.nivel === 'orbita' && r.kind !== 'individual'),
      absoluto: de((r) => r.nivel === 'absoluto' && r.kind !== 'individual'),
      avulso: de((r) => r.kind === 'individual'),
    },
    teste_no_periodo: camp ? Number(camp.z_mensagens) : 50,
    recargas: pacotes.map((p) => ({
      code: p.code as string,
      mensagens: Number(p.mensagens),
      preco_centavos: Number(p.price_cents),
      moeda: p.currency as string,
      validade_meses: Number(p.validade_meses),
    })),
  }
}

export type LimitesDaPessoa = {
  nivel: Record<string, Nivel>
  teste_ate: string | null
  produtos: Record<string, { nivel: Nivel; origem: OrigemNivel; ate: string | null; limites: Record<string, number | null> }>
  z: { franquia: number | null; usadas: number; renova_em: string; recarga: number }
}

/**
 * Nível e limites efetivos da pessoa (GET /api/v1/me/limites). Conta antiga (legado): números sem limite, recursos
 * ligados, como hoje. Admin: os números do Absoluto.
 */
export async function limitesDaPessoa(tx: Queryable, userId: string, orgId: string | null, now = new Date()): Promise<LimitesDaPessoa> {
  const niveis = await niveisEfetivos(tx, userId, orgId)
  const catalogo = await catalogoLimites(tx, userId)
  const produtos: LimitesDaPessoa['produtos'] = {}
  for (const n of niveis) {
    const limites: Record<string, number | null> = {}
    for (const [chave, item] of Object.entries(catalogo[n.productId] ?? {})) {
      limites[chave] = n.origem === 'legado' ? (item.tipo === 'recurso' ? 1 : null) : item.valores[n.nivel]
    }
    produtos[n.productId] = { nivel: n.nivel, origem: n.origem, ate: n.ate?.toISOString() ?? null, limites }
  }
  const teste = await testeAtivoAte(tx, userId, orgId, now)
  const q = orgId ? await peekQuota(tx, orgId, 'zro.ai_credits', 0, now) : null
  return {
    nivel: nivelClaim(niveis),
    teste_ate: teste?.toISOString() ?? null,
    produtos,
    z: {
      franquia: q?.limit ?? null,
      usadas: q?.used ?? 0,
      renova_em: (q?.periodEnd ?? quotaPeriod(now).end).toISOString(),
      recarga: orgId ? await saldoRecarga(tx, orgId, now) : 0,
    },
  }
}

/**
 * O plano que a pessoa vê no Início e no Perfil: o maior nível entre os apps (nome do plano), e o teste se houver.
 * Conta antiga mostra o nome do plano que tem.
 */
export async function planoAtual(
  tx: Queryable,
  userId: string,
  orgId: string | null,
  now = new Date(),
): Promise<{ nome: string; testeAte: Date | null } | null> {
  if (!orgId) return null
  const testeAte = await testeAtivoAte(tx, userId, orgId, now)
  if (testeAte) return { nome: 'Absoluto', testeAte }
  const subs = await tx`
    select p.name, p.nivel, p.kind from zro.subscriptions s join zro.plans p on p.id = s.plan_id
    where s.org_id = ${orgId} and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > ${now} or s.grace_until > ${now})
    order by case p.nivel when 'absoluto' then 3 when 'orbita' then 2 else 1 end desc, s.created_at desc`
  // O pacote (ou o grátis) dá o nome; avulsos entram depois dele ("Zero + Maestro").
  const base = subs.find((s) => s.kind !== 'individual')
  const avulsos = [...new Set(subs.filter((s) => s.kind === 'individual').map((s) => s.name as string))]
  if (!base && !avulsos.length) return null
  return { nome: [base?.name as string | undefined, ...avulsos].filter(Boolean).join(' + '), testeAte: null }
}

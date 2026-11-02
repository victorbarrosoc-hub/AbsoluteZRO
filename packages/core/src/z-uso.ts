/**
 * Registro de uso pago da Z em `zro.z_lab_uso` (migrações 0036 e 0056). Módulo de base, sem dependência de ia.ts nem de
 * z-lab.ts (os dois usam): tipos, o insert idempotente e o registro "como sistema" (sem sessão de pessoa).
 */
import type { Database, Queryable } from '@zro/db'
import { DomainError } from '@zro/observability'

export type ZServico = 'claude' | 'voz' | 'transcricao' | 'escuta' | 'design'
/** De onde veio o gasto: o chat dos clientes (`chat`), o Laboratório ou o Rift. Linhas antigas ficam sem origem. */
export type ZOrigemUso = 'chat' | 'lab' | 'rift'

export type ZUso = {
  servico: ZServico
  modelo?: string | null
  tokensEntrada?: number
  tokensSaida?: number
  tokensCache?: number
  caracteres?: number
  segundos?: number
  custoUsd: number
  /** Idempotência: a mesma chamada nunca conta duas vezes. */
  chave: string
  /** Só o chat dos clientes preenche estes campos (0056): para o console abrir o gasto por plano e por app. */
  orgId?: string | null
  produto?: string | null
  nivel?: 'zero' | 'orbita' | 'absoluto' | null
  origem?: ZOrigemUso | null
}

export async function inserirUso(tx: Queryable, userId: string, u: ZUso): Promise<boolean> {
  if (!/^[a-z]+:[A-Za-z0-9_.:-]{6,110}$/.test(u.chave)) throw new DomainError('invalid_input', 'Chave de uso inválida.')
  const r = await tx`
      insert into zro.z_lab_uso (user_id, servico, modelo, tokens_entrada, tokens_saida, tokens_cache, caracteres, segundos, custo_usd, chave,
                                 org_id, produto, nivel, origem)
      values (${userId}, ${u.servico}, ${u.modelo ?? null}, ${Math.round(u.tokensEntrada ?? 0)}, ${Math.round(u.tokensSaida ?? 0)},
        ${Math.round(u.tokensCache ?? 0)}, ${Math.round(u.caracteres ?? 0)}, ${Number((u.segundos ?? 0).toFixed(2))}, ${Number(u.custoUsd.toFixed(6))}, ${u.chave},
        ${u.orgId ?? null}, ${u.produto ?? null}, ${u.nivel ?? null}, ${u.origem ?? null})
      on conflict (chave) do nothing returning id`
  return r.length > 0
}

/**
 * Uso sem sessão de pessoa na hora do registro: um app da família chamando a Z (Rift) ou o chat dos clientes, que grava
 * o gasto como sistema (a RLS da tabela é só da administração; quem gasta é uma pessoa comum).
 */
export const registrarUsoDoSistema = (db: Database, userId: string, u: ZUso) => db.asSystem('z: uso (app da família)', (tx) => inserirUso(tx, userId, u))

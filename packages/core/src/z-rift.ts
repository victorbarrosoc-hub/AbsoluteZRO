/**
 * A Z dentro do Rift Motion (pedido do titular, 01/11/2026: "a mesma chave pra Z", caminho A). O Rift não guarda chave
 * do Claude: o servidor dele pede aqui, servidor a servidor, com a credencial do cliente confidencial `rift-web`
 * (Basic), e a chave fica só no HUB (`IA_ANTHROPIC_KEY`).
 *
 * A Z entra nas plataformas só na fase 2 (decisão do titular): por ora só as contas de `IA_RIFT_LIBERADOS` (ids da
 * Absolute ZRO separados por vírgula). Sem a lista, ninguém usa. A conta precisa existir, estar ativa e já ter entrado
 * no Rift (consentimento ativo) e passar no gate de lançamento do Rift Motion (canal api; admin passa); o gasto conta
 * no teto do dia da Z (sem teto ou no teto = bloqueado) e aparece nos Custos. O gasto é conferido antes e registrado
 * depois, pelo uso real: pedidos ao mesmo tempo podem passar do teto por uma resposta cada (sem reserva atômica).
 */
import { appHasPerson, type OAuthClient } from '@zro/auth'
import type { Database } from '@zro/db'
import { DomainError } from '@zro/observability'
import { z } from 'zod'
import { conferirTetoDoSistema } from './z-lab'

export const Z_RIFT_CLIENTE = 'rift-web'
/** O produto no gate de lançamento (ADR 0023; não lançado, 0049). */
export const Z_RIFT_PRODUTO = 'rift-motion'
export const Z_RIFT_CENA_MAX = 60_000

export const liberadosDoRift = (v = process.env.IA_RIFT_LIBERADOS): string[] =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const Pedido = z.object({
  sub: z.string().uuid(),
  pedido: z.string().trim().min(1).max(1000),
  cena: z.unknown().optional(),
})

export type PedidoDoRift = { userId: string; pedido: string; cena: string }

/** Confere quem pede (cliente, lista, conta ativa, já entrou no Rift) e o teto do dia, antes de qualquer gasto. */
export async function pedidoDaZNoRift(
  db: Database,
  client: OAuthClient,
  raw: unknown,
  opts: { cliente?: string; liberados?: string[] } = {},
): Promise<PedidoDoRift> {
  if (client.id !== (opts.cliente ?? Z_RIFT_CLIENTE)) throw new DomainError('action_not_allowed', 'Este app não usa a Z por aqui.')
  const p = Pedido.safeParse(raw)
  if (!p.success) throw new DomainError('invalid_input', 'Pedido inválido.')
  if (!(opts.liberados ?? liberadosDoRift()).includes(p.data.sub)) throw new DomainError('action_not_allowed', 'A Z ainda não está liberada para esta conta.')
  const cena = JSON.stringify(p.data.cena ?? {})
  if (cena.length > Z_RIFT_CENA_MAX) throw new DomainError('invalid_input', 'A cena é grande demais para a Z agora.')
  const ativa = await db.asSystem('z no rift: conta', (tx) => tx`select 1 from zro.users where id = ${p.data.sub} and status = 'active'`)
  if (!ativa.length || !(await appHasPerson(db, p.data.sub, client.id)))
    throw new DomainError('action_not_allowed', 'A Z ainda não está liberada para esta conta.')
  // Gate de lançamento do Rift Motion no canal api (revisão P4): aberto ou na lista de acesso; admin da plataforma
  // (ativa, e-mail confirmado) passa. O release_admin explícito cobre o Rift ainda sem linha no catálogo, onde o
  // release_allows nega até o admin.
  const [gate] = await db.asSystem(
    'z no rift: lançamento',
    (tx) => tx`select zro.release_allows(${Z_RIFT_PRODUTO}, ${p.data.sub}::uuid, 'api') or zro.release_admin(${p.data.sub}::uuid) as ok`,
  )
  if (!gate?.ok) throw new DomainError('product_closed', 'O Rift Motion ainda não está liberado para esta conta.')
  await conferirTetoDoSistema(db)
  return { userId: p.data.sub, pedido: p.data.pedido, cena }
}

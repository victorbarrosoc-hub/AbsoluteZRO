/**
 * Ponte entre apps da família (Maestro v2, fase 7): um app pede ao HUB um pedido assinado (`zro-pedido+jwt`, o mesmo
 * da Z no Drive) e ele próprio chama o outro app com esse JWT. O HUB só assina e audita: não repassa resposta nem
 * byte de arquivo (PRD: o HUB não move mídia). Contrato: docs/integration-contracts/maestro-sobedesce.md.
 *
 * Quem pede e o quê, numa lista fechada (`PONTES`): app de origem (o produto do cliente OAuth do token) → destino →
 * ações. Fora da lista: 403 `acao_nao_permitida`.
 *
 * Dois jeitos de pedir:
 * - **Com a pessoa** (Bearer = access token do app, escopo da API do produto, ex. `maestro.projects`): a pessoa e a
 *   organização vêm do token; `authorize()` exige o gate do app de origem e o **produto de destino no plano** da
 *   organização (sem o SOBEDESCE no plano: 403, com `upgrade`).
 * - **Sem a pessoa** (Basic = client_id:client_secret do app confidencial) só para as ações de desfazer
 *   (`ACOES_SEM_PESSOA`, hoje `drive.recolher_revisao`), em nome de quem já entrou no app (consentimento ativo).
 *   É o que o agendamento do Maestro usa para tirar o "qualquer pessoa com o link" quando o link do cliente vence.
 *   Desfazer nunca pede o produto no plano: tirar a exposição de um arquivo vale sempre.
 *
 * Toda emissão fica em `zro.audit_logs` (`app.pedido.emitido`, metadata só com app, destino, ação e o jeito), e cada
 * pessoa tem limite por app (120 pedidos em 10 min; `drive.token`, 30).
 */
import { appHasPerson, assinarPedidoDeApp, PEDIDO_TTL_S, registerAttempt, withinLimit, type Authenticated, type OAuthClient } from '@zro/auth'
import type { Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { authorize } from './authz'
import { driveConfigDoAmbiente, type DriveConfig } from './ia-drive'

/** As ações que o SOBEDESCE atende para outro app (rotas em products/sobedesce/web/src/app/api/zro/drive/*). */
export const ACOES_SOBEDESCE = {
  'drive.listar': '/api/zro/drive/listar',
  'drive.miniatura': '/api/zro/drive/miniatura',
  'drive.pasta.criar': '/api/zro/drive/pasta/criar',
  'drive.compartilhar_revisao': '/api/zro/drive/revisao/compartilhar',
  'drive.recolher_revisao': '/api/zro/drive/revisao/recolher',
  'drive.token': '/api/zro/drive/token',
} as const
export type AcaoSobedesce = keyof typeof ACOES_SOBEDESCE

/** App de origem (product_id do cliente OAuth) → destino → ações permitidas. */
export const PONTES: Record<string, Record<string, readonly string[]>> = {
  maestro: { sobedesce: Object.keys(ACOES_SOBEDESCE) },
}

/** O escopo de API que o token do app de origem precisa ter para pedir (o mesmo da API dele no HUB). */
export const ESCOPO_DA_PONTE: Record<string, string> = { maestro: 'maestro.projects' }

/** Ações de desfazer que o app pede sem a pessoa (credencial do próprio app). */
export const ACOES_SEM_PESSOA = new Set<string>(['drive.recolher_revisao'])

export const LIMITE_PONTE = { max: 120, windowMs: 10 * 60_000 }
export const LIMITE_PONTE_TOKEN = { max: 30, windowMs: 10 * 60_000 }

export const APP_PEDIDO_ACAO = 'app.pedido.emitido'

export type PedidoEntreApps = {
  tipo: 'zro-pedido+jwt'
  token: string
  aud: string
  acao: string
  expira_em: string
  /** Endereço exato a chamar (POST, `Authorization: Bearer <token>`). */
  url: string
}

type Destino = { aud: string; base: string; caminho: (acao: string) => string | null }

function destinoDe(produto: string, cfg: DriveConfig): Destino | null {
  if (produto !== 'sobedesce') return null
  return {
    aud: cfg.clientId,
    base: cfg.base,
    caminho: (a) => (Object.hasOwn(ACOES_SOBEDESCE, a) ? ACOES_SOBEDESCE[a as AcaoSobedesce] : null),
  }
}

function conferirPonte(app: string | null, destino: unknown, acao: unknown): { app: string; destino: string; acao: string } {
  if (typeof destino !== 'string' || typeof acao !== 'string' || !destino || !acao) throw new DomainError('invalid_input', 'Diga o destino e a ação.')
  if (!app || !PONTES[app]?.[destino]?.includes(acao))
    throw new DomainError('action_not_allowed', 'Esta ação não está liberada para este app.', { erro: 'acao_nao_permitida' })
  return { app, destino, acao }
}

async function emitir(
  db: Database,
  p: { sub: string; orgId: string | null; app: string; destino: string; acao: string; jeito: 'pessoa' | 'app' },
  cfg: DriveConfig,
  agora = Date.now(),
): Promise<PedidoEntreApps> {
  const d = destinoDe(p.destino, cfg)
  const caminho = d?.caminho(p.acao)
  if (!d || !caminho) throw new DomainError('action_not_allowed', 'Esta ação não está liberada para este app.', { erro: 'acao_nao_permitida' })
  const regra = p.acao === 'drive.token' ? LIMITE_PONTE_TOKEN : LIMITE_PONTE
  const chave = `ponte:${p.app}:${p.sub}${p.acao === 'drive.token' ? ':token' : ''}`
  const ok = await db.asSystem('ponte: limite', async (tx) => {
    if (!(await withinLimit(tx, chave, regra))) return false
    await registerAttempt(tx, chave)
    return true
  })
  if (!ok) throw new DomainError('rate_limited', 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.')
  const token = await assinarPedidoDeApp(db, { sub: p.sub, aud: d.aud, acao: p.acao }, agora)
  await db.asSystem('ponte: auditoria', (tx) =>
    audit(tx, {
      orgId: p.orgId,
      actorUserId: p.sub,
      actorKind: p.jeito === 'app' ? 'system' : 'user',
      action: APP_PEDIDO_ACAO,
      targetType: 'produto',
      targetId: p.destino,
      metadata: { app: p.app, destino: p.destino, acao: p.acao, jeito: p.jeito },
    }),
  )
  return {
    tipo: 'zro-pedido+jwt',
    token,
    aud: d.aud,
    acao: p.acao,
    expira_em: new Date(Math.floor(agora / 1000) * 1000 + PEDIDO_TTL_S * 1000).toISOString(),
    url: `${d.base}${caminho}`,
  }
}

/** Com a pessoa: o token do app (Bearer) já autenticado pela rota. */
export async function pedidoEntreAppsDaPessoa(
  db: Database,
  auth: Authenticated | null,
  entrada: { destino?: unknown; acao?: unknown },
  cfg: DriveConfig = driveConfigDoAmbiente(),
): Promise<PedidoEntreApps> {
  const app = auth?.session.app?.productId ?? null
  if (!auth || !app) throw new DomainError('action_not_allowed', 'Só um app da família pede pela ponte.', { erro: 'so_app' })
  const p = conferirPonte(app, entrada.destino, entrada.acao)
  // Desfazer vale mesmo sem o produto de destino no plano; o resto exige o destino contratado (e o gate do app).
  const actor = await authorize(
    db,
    auth,
    ACOES_SEM_PESSOA.has(p.acao) ? { release: { productId: app } } : { release: { productId: app }, product: { id: p.destino } },
  )
  return emitir(db, { sub: actor.userId, orgId: actor.orgId, ...p, jeito: 'pessoa' }, cfg)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sem a pessoa: o app autenticado pela credencial dele (Basic), só para as ações de desfazer. */
export async function pedidoEntreAppsDoApp(
  db: Database,
  client: OAuthClient | null,
  entrada: { destino?: unknown; acao?: unknown; sub?: unknown },
  cfg: DriveConfig = driveConfigDoAmbiente(),
): Promise<PedidoEntreApps> {
  if (!client?.productId) throw new DomainError('unauthenticated', 'Credencial do app inválida.')
  const p = conferirPonte(client.productId, entrada.destino, entrada.acao)
  if (!ACOES_SEM_PESSOA.has(p.acao)) throw new DomainError('action_not_allowed', 'Esta ação precisa da pessoa (token do app).', { erro: 'precisa_da_pessoa' })
  const sub = typeof entrada.sub === 'string' && UUID.test(entrada.sub) ? entrada.sub : null
  if (!sub || !(await appHasPerson(db, sub, client.id))) throw new DomainError('not_found', 'Esta pessoa não usa este app.', { erro: 'sem_vinculo' })
  return emitir(db, { sub, orgId: null, ...p, jeito: 'app' }, cfg)
}

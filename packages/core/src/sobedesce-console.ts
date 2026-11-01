/**
 * Console › Apps › SOBEDESCE · Acesso ao Drive (titular, 31/10/2026): quem tem o Drive inteiro (escopo `drive`) no
 * SOBEDESCE é decidido aqui, não mais no /admin de lá. O HUB confere o papel no console (ler: admin e suporte; mudar:
 * só admin), assina um pedido curto (`assinarPedidoDeApp`, 60 s, uso único) e chama o SOBEDESCE servidor a servidor
 * (products/sobedesce/web/src/lib/zro/console-drive.ts). A regra das vagas mora lá: 90 de 100 que o Google aceita na
 * vida do projeto, e vaga usada não volta. Nada de segredo novo: é a mesma chave do login único.
 */
import { assinarPedidoDeApp, type Authenticated } from '@zro/auth'
import type { Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { requireConsole } from './console-papeis'
import { driveConfigDoAmbiente, type DriveConfig } from './ia-drive'

export const CONSOLE_DRIVE_LER = 'console.drive.ler'
export const CONSOLE_DRIVE_MUDAR = 'console.drive.acesso'

export type VagasDrive = { limite: number; usadas: number; liberadasSemUso: number; livres: number }
export type PessoaDrive = {
  id: string
  nome: string
  email: string
  zroSub: string | null
  acessoTotal: boolean
  usouVaga: boolean
  drives: { email: string; modo: 'total' | 'escolhidos'; estado: 'ok' | 'reconectar' }[]
}
export type PainelDrive = { vagas: VagasDrive; pessoas: PessoaDrive[] }

const ID = /^[A-Za-z0-9_-]{1,100}$/

async function chamar(db: Database, sub: string, acao: string, caminho: string, corpo: unknown, cfg: DriveConfig) {
  const token = await assinarPedidoDeApp(db, { sub, aud: cfg.clientId, acao })
  let res: Response
  try {
    res = await (cfg.fetch ?? fetch)(`${cfg.base}${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    throw new DomainError('upstream_unavailable', 'O SOBEDESCE não respondeu agora. Tente de novo em instantes.')
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  return { status: res.status, ok: res.ok && !!json, json }
}

/** As vagas e as pessoas do SOBEDESCE com o modo do Drive de cada uma. Admin e suporte. */
export async function lerAcessoDrive(db: Database, auth: Authenticated | null, cfg: DriveConfig = driveConfigDoAmbiente()): Promise<PainelDrive> {
  const u = requireConsole(auth, 'apps')
  const r = await chamar(db, u.userId, CONSOLE_DRIVE_LER, '/api/zro/console/drive', {}, cfg)
  if (!r.ok || !r.json || typeof r.json.vagas !== 'object' || !Array.isArray(r.json.pessoas)) {
    throw new DomainError('upstream_unavailable', 'Não deu para ler o SOBEDESCE agora.')
  }
  return { vagas: r.json.vagas as VagasDrive, pessoas: r.json.pessoas as PessoaDrive[] }
}

/** Liga ou desliga o Acesso total de uma pessoa do SOBEDESCE. Só admin, com motivo, sempre auditado. */
export async function mudarAcessoDrive(
  db: Database,
  auth: Authenticated | null,
  e: { usuarioId: string; ligar: boolean; reason: string },
  cfg: DriveConfig = driveConfigDoAmbiente(),
): Promise<{ acessoTotal: boolean; vagas: VagasDrive }> {
  const u = requireConsole(auth, 'apps', { mudar: true })
  if (!ID.test(e.usuarioId)) throw new DomainError('invalid_input', 'Conta inválida.')
  const reason = e.reason.trim().slice(0, 500)
  if (!reason) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  const r = await chamar(db, u.userId, CONSOLE_DRIVE_MUDAR, '/api/zro/console/drive/acesso', { usuarioId: e.usuarioId, ligar: e.ligar }, cfg)
  const codigo = typeof r.json?.erro === 'string' ? r.json.erro : r.ok ? null : `http_${r.status}`
  await db.asSystem('console: acesso total do Drive no SOBEDESCE', (tx) =>
    audit(tx, {
      actorUserId: u.userId,
      actorKind: 'admin',
      action: e.ligar ? 'sobedesce.drive_total.ligar' : 'sobedesce.drive_total.desligar',
      targetType: 'sobedesce_usuario',
      targetId: e.usuarioId,
      metadata: { reason, resultado: codigo ?? 'ok' },
    }),
  )
  if (codigo === 'sem_vaga') throw new DomainError('quota_exceeded', 'As vagas do Drive inteiro acabaram. Vaga usada não volta.')
  if (codigo === 'nao_encontrada') throw new DomainError('not_found', 'Esta conta não existe mais no SOBEDESCE.')
  if (!r.ok || !r.json) throw new DomainError('upstream_unavailable', 'O SOBEDESCE não confirmou a troca. Nada foi mudado aqui.')
  return { acessoTotal: r.json.acessoTotal === true, vagas: r.json.vagas as VagasDrive }
}

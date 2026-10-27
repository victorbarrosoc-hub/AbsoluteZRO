import type { Tone } from '@zro/ui'

export const STEP_LABEL: Record<string, string> = {
  not_started: 'Não iniciado',
  waiting_material: 'Aguardando material',
  ready: 'Pronto',
  processing: 'Em processamento',
  needs_review: 'Requer revisão',
  done: 'Concluído',
  failed: 'Falhou',
  blocked_subscription: 'Bloqueado por assinatura',
  unavailable: 'Indisponível',
}

export const STEP_TONE: Record<string, Tone> = {
  not_started: 'neutral',
  waiting_material: 'neutral',
  ready: 'accent',
  processing: 'accent',
  needs_review: 'warn',
  done: 'ok',
  failed: 'danger',
  blocked_subscription: 'faint',
  unavailable: 'faint',
}

export const RUN_LABEL: Record<string, string> = {
  queued: 'Na fila',
  running: 'Rodando',
  succeeded: 'Concluída',
  failed: 'Falhou',
  dead_letter: 'Parou após tentativas',
  requires_review: 'Requer revisão',
  blocked: 'Bloqueada',
  canceled: 'Cancelada',
}

export const RUN_TONE: Record<string, Tone> = {
  queued: 'neutral',
  running: 'accent',
  succeeded: 'ok',
  failed: 'danger',
  dead_letter: 'danger',
  requires_review: 'warn',
  blocked: 'faint',
  canceled: 'faint',
}

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Dono',
  admin: 'Administração',
  manager: 'Gestão',
  editor: 'Edição',
  viewer: 'Leitura',
  billing: 'Financeiro',
  guest: 'Convidado',
}

export const ACCESS_LABEL: Record<string, string> = {
  contracted: 'Contratada',
  available: 'Disponível para contratar',
  coming_soon: 'Em desenvolvimento',
  disabled: 'Desativada',
}

export const MANIFEST_LABEL: Record<string, string> = {
  valid: 'Conferido',
  valid_with_warnings: 'Com avisos',
  invalid: 'Com erros',
}
export const MANIFEST_TONE: Record<string, Tone> = { valid: 'ok', valid_with_warnings: 'warn', invalid: 'danger' }

export const PROJECT_STATUS_LABEL: Record<string, string> = { active: 'Em andamento', paused: 'Pausado', delivered: 'Entregue', archived: 'Arquivado' }

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' })
const dayFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Fortaleza' })
export const fmtDate = (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : '—')
export const fmtDay = (d: Date | string | null | undefined) => (d ? dayFmt.format(new Date(d)) : '—')
export const fmtBytes = (n: number | null | undefined) => {
  if (n == null) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = Number(n)
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`
}

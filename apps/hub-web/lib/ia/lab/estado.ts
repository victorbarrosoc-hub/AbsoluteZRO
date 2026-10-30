import 'server-only'
import type { Authenticated } from '@zro/auth'
import { estadoDoLab, type ZLabEstado } from '@zro/core'
import type { Database } from '@zro/db'
import { iaLigada, iaModelo } from '../modelo'
import { vozLigada } from './elevenlabs'

/** As chaves que o laboratório usa, pelo nome da variável (o valor nunca sai do servidor). */
export const CHAVES = { claude: 'IA_ANTHROPIC_KEY', voz: 'ELEVENLABS_API_KEY' } as const

export type LabEstado = ZLabEstado & {
  chaves: { claude: boolean; voz: boolean }
  modeloPadrao: string
  planos: { code: string; name: string }[]
}

/** Tudo que a tela do laboratório precisa ao abrir. Quem chama já é admin (o core confere de novo). */
export async function estadoDaTela(db: Database, auth: Authenticated | null): Promise<LabEstado> {
  const estado = await estadoDoLab(db, auth, iaModelo())
  // Catálogo de planos (público para zro_app): para escolher onde cada recurso pode ser liberado depois.
  const planos = await db.asUser({ userId: auth!.user.id, orgId: auth!.session.activeOrgId ?? null }, (tx) =>
    tx`select distinct on (code) code, name from zro.plans where status = 'active' order by code, version desc`,
  )
  return {
    ...estado,
    chaves: { claude: iaLigada(), voz: vozLigada() },
    modeloPadrao: iaModelo(),
    planos: planos.map((p) => ({ code: p.code as string, name: p.name as string })),
  }
}

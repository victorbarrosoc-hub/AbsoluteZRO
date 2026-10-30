import 'server-only'
import type { Authenticated } from '@zro/auth'
import {
  conflitosDaLista,
  custoMinutoDeVoz,
  estadoDoLab,
  Z_APPS,
  Z_CONHECIMENTO_MAX_TEXTO,
  Z_MODELOS,
  Z_RECURSOS,
  Z_RESPOSTAS,
  Z_TOM_PADRAO,
  Z_VOZ_DESCRICAO_PADRAO,
  Z_VOZ_MODELOS,
  Z_VOZ_TEXTO_AMOSTRA,
  zConfigPadrao,
  type ZConfig,
  type ZLabEstado,
} from '@zro/core'
import type { Database } from '@zro/db'
import { iaLigada, iaModelo } from '../modelo'
import { vozLigada } from './elevenlabs'

/** As chaves que o laboratório usa, pelo nome da variável (o valor nunca sai do servidor). */
export const CHAVES = { claude: 'IA_ANTHROPIC_KEY', voz: 'ELEVENLABS_API_KEY' } as const

/** O que a tela precisa saber do catálogo (constantes do core, que o navegador não importa). */
export type LabCatalogo = {
  modelos: { id: string; nome: string; nota: string }[]
  vozModelos: { id: string; nome: string; nota: string; usdPorMilCaracteres: number }[]
  apps: { id: string; nome: string }[]
  respostas: { id: string; nome: string }[]
  recursos: { id: string; nome: string }[]
  padrao: ZConfig
  tomPadrao: { formalidade: number; detalhe: number }
  vozDescricao: string
  vozTexto: string
  conhecimentoMax: number
  /** US$ por minuto de conversa por voz, com o modelo padrão e com o mais rápido (estimativa, ver custoMinutoDeVoz). */
  minutoDeVoz: { padrao: number; rapido: number }
}

export type LabEstado = ZLabEstado & {
  chaves: { claude: boolean; voz: boolean }
  nomesDasChaves: typeof CHAVES
  modeloPadrao: string
  planos: { code: string; name: string }[]
  catalogo: LabCatalogo
  /** Aprendizado do rascunho que contradiz outro → o texto do outro (o Configurar marca "isso contradiz: …"). */
  conflitos: Record<string, string>
}

export function catalogoDoLab(): LabCatalogo {
  return {
    modelos: Z_MODELOS.map((m) => ({ ...m })),
    vozModelos: Z_VOZ_MODELOS.map((m) => ({ ...m })),
    apps: Z_APPS.map((a) => ({ ...a })),
    respostas: Object.entries(Z_RESPOSTAS).map(([id, r]) => ({ id, nome: r.nome })),
    recursos: Object.entries(Z_RECURSOS).map(([id, nome]) => ({ id, nome })),
    padrao: zConfigPadrao(iaModelo()),
    tomPadrao: { ...Z_TOM_PADRAO },
    vozDescricao: Z_VOZ_DESCRICAO_PADRAO,
    vozTexto: Z_VOZ_TEXTO_AMOSTRA,
    conhecimentoMax: Z_CONHECIMENTO_MAX_TEXTO,
    minutoDeVoz: {
      padrao: custoMinutoDeVoz({ modelo: iaModelo() }).total,
      rapido: custoMinutoDeVoz({ modelo: 'claude-haiku-5-5' }).total,
    },
  }
}

/** Tudo que a tela do laboratório precisa ao abrir. Quem chama já é admin (o core confere de novo). */
export async function estadoDaTela(db: Database, auth: Authenticated | null): Promise<LabEstado> {
  const estado = await estadoDoLab(db, auth, iaModelo())
  // Catálogo de planos (público para zro_app): para escolher onde cada recurso pode ser liberado depois.
  const planos = await db.asUser(
    { userId: auth!.user.id, orgId: auth!.session.activeOrgId ?? null },
    (tx) => tx`select distinct on (code) code, name from zro.plans where status = 'active' order by code, version desc`,
  )
  return {
    ...estado,
    chaves: { claude: iaLigada(), voz: vozLigada() },
    nomesDasChaves: CHAVES,
    modeloPadrao: iaModelo(),
    planos: planos.map((p) => ({ code: p.code as string, name: p.name as string })),
    catalogo: catalogoDoLab(),
    conflitos: conflitosDaLista(estado.rascunho.aprendizados),
  }
}

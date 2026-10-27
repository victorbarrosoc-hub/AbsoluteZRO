import 'server-only'
import type { Authenticated } from '@zro/auth'
import { peekQuota, productAccessFor } from '@zro/billing'
import { authorize, IA_METRICA } from '@zro/core'
import { productColor } from '@/components/app-tile'
import type { IaPlataforma } from '@/components/ia/painel-ia'
import { db } from '../session'
import { iaLigada } from './modelo'

export function saudacao(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(now))
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Sugestões do HUB: perguntas que a IA responde com o retrato da conta. */
export const SUGESTOES_HUB = ['O que pede atenção hoje?', 'Resuma meus projetos', 'Quantos créditos de IA ainda tenho?', 'Qual ferramenta uso para cada etapa?']

/** O que o painel da IA precisa para abrir no HUB: IA ligada, créditos do mês e as plataformas (para agrupar). */
export async function estadoDaIa(auth: Authenticated) {
  const actor = await authorize(db(), auth)
  const [q, access] = await Promise.all([
    db().asSystem('ia: créditos', (tx) => peekQuota(tx, actor.orgId, IA_METRICA, 0)),
    db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId)),
  ])
  const plataformas: IaPlataforma[] = access.map((a) => ({ id: a.productId, nome: a.name, cor: productColor(a.productId) }))
  return {
    nome: auth.user.displayName.split(/\s+/)[0] || auth.user.displayName,
    saudacao: saudacao(),
    ligada: iaLigada(),
    creditos: { usados: q.used, limite: q.limit, renova_em: q.periodEnd.toISOString() },
    plataformas,
  }
}

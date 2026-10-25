/**
 * Carro do Freela → projeto (contrato proposto `carro-do-freela.job/1`). O protótipo atual não emite jobs; este
 * contrato é o que um adaptador futuro (ou a pessoa, colando o JSON) entrega ao HUB. Sem nome, telefone ou contato
 * de freelas: só funções e quantidades.
 */
import type { CarroJob } from '@zro/media-contracts'

export function projectInputFromJob(job: CarroJob) {
  return {
    title: job.title,
    type: job.production_type || 'outro',
    client_reference: job.client_reference ?? null,
    visibility: 'organization' as const,
    brief: {
      source: 'carro-do-freela',
      job_id: job.job_id,
      city: job.city ?? null,
      dates: job.dates,
      crew_roles: job.crew_roles,
      references: job.references,
      accepted_at: job.accepted_at ?? null,
    },
    external_links: [],
  }
}

/**
 * Carro do Freela → projeto (`carro-do-freela.job/1`). O site do Carro envia pelo painel do job (POST /api/zro/enviar →
 * POST /api/v1/carro-do-freela/jobs, com o token da pessoa); o JSON também pode ser colado no HUB. O job em si não leva
 * nome, telefone nem contato de freela, só funções e quantidades; a equipe vai à parte, em `carro-do-freela.crew/1`.
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

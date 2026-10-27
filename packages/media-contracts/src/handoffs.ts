/** Contratos de entrada e saída dos produtos sem integração por API (PRD §8). */
import { z } from 'zod'
import { IsoDate } from './common'

/**
 * job.created — o job do Carro do Freela vira projeto. O site do Carro envia pelo painel do job (com o token da
 * pessoa, escopo carro-do-freela.jobs); o JSON também pode ser colado no HUB. Dados pessoais de equipe ficam fora:
 * só função e quantidade (a equipe vai à parte, no carro-do-freela.crew/1).
 */
export const CarroJobSchema = z.object({
  contract: z.literal('carro-do-freela.job/1'),
  job_id: z.string().min(1).max(200),
  title: z.string().min(1).max(160),
  production_type: z.string().max(60).optional(),
  client_reference: z.string().max(200).optional(),
  briefing: z.string().max(20_000).optional(),
  city: z.string().max(120).optional(),
  dates: z
    .array(z.object({ date: z.iso.date(), label: z.string().max(120).optional() }))
    .max(60)
    .default([]),
  crew_roles: z
    .array(z.object({ role: z.string().max(80), count: z.number().int().positive().max(200) }))
    .max(40)
    .default([]),
  references: z
    .array(z.url({ protocol: /^https$/ }))
    .max(20)
    .default([]),
  accepted_at: IsoDate.optional(),
})
export type CarroJob = z.infer<typeof CarroJobSchema>

/**
 * A equipe escalada num job (carro-do-freela.crew/1). Vai depois do job: cada pessoa é uma conta da Absolute ZRO
 * (zro_user_id), e o e-mail é o da própria conta, para o convite chegar a ela. Sem telefone, diária ou documento.
 * project_role: editor para quem mexe no material do projeto; viewer para quem só acompanha.
 */
export const CarroCrewSchema = z.object({
  contract: z.literal('carro-do-freela.crew/1'),
  job_id: z.string().min(1).max(200),
  members: z
    .array(
      z.object({
        zro_user_id: z.uuid(),
        email: z.email().max(254),
        function: z.string().min(1).max(80),
        project_role: z.enum(['editor', 'viewer']).default('viewer'),
      }),
    )
    .min(1)
    .max(200),
})
export type CarroCrew = z.infer<typeof CarroCrewSchema>

/** Backup do TPeasy (app/js/data.js exportAll/importAll, version 1): o formato que o app já importa. */
export const TpeasyScriptSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(300).default(''),
  body: z.string().max(200_000),
  updated: z.number().int().nonnegative().optional(),
  pos: z.number().optional(),
  fav: z.boolean().optional(),
  target: z.number().int().nonnegative().optional(),
  deleted: z.boolean().optional(),
})
export const TpeasyBackupSchema = z.object({
  app: z.literal('tpeasy'),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  scripts: z.array(TpeasyScriptSchema).max(5000),
  prefs: z.unknown().optional(),
  sessions: z.array(z.unknown()).optional(),
})
export type TpeasyBackup = z.infer<typeof TpeasyBackupSchema>

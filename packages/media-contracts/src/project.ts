/** Entidade canônica ZroProject (PRD §7.1). */
import { z } from 'zod'
import { IsoDate, Uuid } from './common'

export const ExternalLink = z.object({
  label: z.string().min(1).max(120),
  url: z.url({ protocol: /^https$/ }).max(2048),
})

export const DeliveryTarget = z.object({
  channel: z.string().min(1).max(80),
  notes: z.string().max(500).optional(),
})

export const ZroProjectSchema = z.object({
  id: Uuid,
  organization_id: Uuid,
  title: z.string().min(1).max(160),
  type: z.string().min(1).max(60),
  client_reference: z.string().max(200).nullable(),
  status: z.enum(['active', 'paused', 'delivered', 'archived']),
  visibility: z.enum(['organization', 'restricted']),
  origin: z.string().max(60),
  created_by: Uuid,
  created_at: IsoDate,
  updated_at: IsoDate,
  brief: z.record(z.string(), z.unknown()),
  delivery_targets: z.array(DeliveryTarget),
  external_links: z.array(ExternalLink),
  workflow_version: z.number().int().positive(),
})
export type ZroProject = z.infer<typeof ZroProjectSchema>

export const ProjectCreateSchema = z.object({
  title: z.string().trim().min(1, 'Dê um nome ao projeto.').max(160),
  type: z.string().trim().min(1).max(60).default('outro'),
  client_reference: z.string().trim().max(200).optional().nullable(),
  visibility: z.enum(['organization', 'restricted']).default('organization'),
  brief: z.record(z.string(), z.unknown()).optional(),
  external_links: z.array(ExternalLink).max(20).optional(),
})

export const STEP_STATES = [
  'not_started',
  'waiting_material',
  'ready',
  'processing',
  'needs_review',
  'done',
  'failed',
  'blocked_subscription',
  'unavailable',
] as const
export type StepState = (typeof STEP_STATES)[number]

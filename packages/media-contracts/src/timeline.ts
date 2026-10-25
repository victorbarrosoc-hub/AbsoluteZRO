/**
 * ZroTimelineRef v0 (PRD §7.4): referência a uma timeline exportada (OTIO, FCPXML, xmeml, EDL, AAF) com mapa de
 * relink por asset_id. Fidelidade de efeitos, multicam, áudio e cor NÃO é prometida; o editor-alvo e os testes de
 * ida e volta com projetos reais ainda serão definidos (docs/decisions/0006-timeline.md).
 */
import { z } from 'zod'
import { IsoDate, RelativePath, Uuid } from './common'

export const TimelineRefSchema = z.object({
  schema_version: z.literal('0.1'),
  project_id: Uuid,
  produced_by: z.enum(['synquei', 'ai-edit', 'nossom', 'finishing', 'manual']),
  format: z.enum(['otio', 'fcpxml', 'xmeml', 'edl', 'aaf']),
  file: RelativePath,
  fps: z.number().positive(),
  created_at: IsoDate,
  relink: z.array(z.object({ asset_id: z.string(), media_path: RelativePath })),
  notes: z.array(z.string().max(300)),
})
export type TimelineRef = z.infer<typeof TimelineRefSchema>

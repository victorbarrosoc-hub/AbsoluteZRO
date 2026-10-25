/**
 * ZroOrganizationPlan v1: o que o Synquei faria com um manifest, em prévia (PRD §8 SOBEDESCE → Synquei).
 * Sempre dry_run: o HUB não move, renomeia nem apaga arquivos. `moves` existe no contrato e precisa vir vazio
 * enquanto não houver confirmação explícita, plano de desfazer e backup (critério de aceite §14).
 */
import { z } from 'zod'
import { IsoDate, RelativePath, Uuid } from './common'

export const OrganizationPlanSchema = z.object({
  schema_version: z.literal('1.0'),
  dry_run: z.literal(true),
  project_id: Uuid,
  manifest_id: z.string(),
  generated_at: IsoDate,
  generator: z.string(),
  root_label: z.string().max(200),
  create_folders: z.array(RelativePath),
  bins: z.array(z.object({ bin: z.string().max(300), asset_ids: z.array(z.string()), camera: z.string().nullable() })),
  assets: z.array(z.object({ asset_id: z.string(), keep_path: RelativePath, bin: z.string().max(300) })),
  moves: z.array(z.object({ asset_id: z.string(), from: RelativePath, to: RelativePath })).max(0),
  preserved_asset_ids: z.number().int().nonnegative(),
  warnings: z.array(z.string().max(300)),
})
export type OrganizationPlan = z.infer<typeof OrganizationPlanSchema>

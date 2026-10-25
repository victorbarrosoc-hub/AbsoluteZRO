/**
 * ZroMediaManifest v1 (PRD §7.2). Contrato entre ingest (SOBEDESCE) e organização/sync (Synquei).
 * Regras: IDs de ativo estáveis e únicos; destino com status próprio; "verified" só com checksum conferido;
 * caminhos relativos; URIs lógicos; avisos e falhas explícitos.
 */
import { z } from 'zod'
import { IsoDate, LogicalUri, RelativePath, Uuid } from './common'

export const MANIFEST_SCHEMA_VERSION = '1.0'

export const ChecksumSchema = z.object({
  algorithm: z.enum(['xxh64', 'md5', 'sha256']),
  value: z.string().regex(/^[0-9a-f]+$/),
})

export const AssetDestinationSchema = z.object({
  destination_id: z.string().min(1).max(120),
  uri: LogicalUri,
  status: z.enum(['unverified', 'verified', 'mismatch', 'missing', 'failed']),
  checksum: ChecksumSchema.nullable(),
  verified_at: IsoDate.nullable(),
  evidence: z.string().max(300).nullable(),
})

export const MediaAssetSchema = z.object({
  asset_id: z.string().regex(/^[a-z0-9-]+:[A-Za-z0-9_-]{8,64}$/, 'asset_id = <origem>:<id>'),
  original_name: z.string().min(1).max(255),
  relative_path: RelativePath,
  size_bytes: z.number().int().nonnegative().nullable(),
  mime_detected: z.string().max(120).nullable(),
  media: z
    .object({
      duration_ms: z.number().int().nonnegative().nullable(),
      timecode_start: z
        .string()
        .regex(/^\d{2}:\d{2}:\d{2}[:;]\d{2}$/)
        .nullable(),
      fps: z.number().positive().nullable(),
    })
    .partial()
    .default({}),
  source: z.object({ kind: z.enum(['card', 'folder', 'drive', 'manual']), label: z.string().max(200) }),
  camera: z.string().max(120).nullable(),
  card: z.string().max(120).nullable(),
  checksums: z.array(ChecksumSchema),
  destinations: z.array(AssetDestinationSchema),
  warnings: z.array(z.string().max(300)),
})

export const CopyOperationSchema = z.object({
  operation_id: z.string().min(1).max(200),
  started_at: IsoDate.nullable(),
  finished_at: IsoDate.nullable(),
  result: z.enum(['ok', 'missing_files', 'error', 'canceled', 'unknown']),
  files_listed: z.number().int().nonnegative(),
  files_copied: z.number().int().nonnegative().nullable(),
  bytes_copied: z.number().int().nonnegative().nullable(),
  destinations: z.array(z.object({ destination_id: z.string(), label: z.string().max(200), report_files: z.array(z.string().max(255)) })),
  source_note: z.string().max(500).nullable(),
})

export const VerificationSummarySchema = z.object({
  assets_total: z.number().int().nonnegative(),
  destinations_total: z.number().int().nonnegative(),
  verified_locations: z.number().int().nonnegative(),
  unverified_locations: z.number().int().nonnegative(),
  mismatched_locations: z.number().int().nonnegative(),
  missing_locations: z.number().int().nonnegative(),
  fully_verified_assets: z.number().int().nonnegative(),
  /** true só quando todo ativo tem checksum conferido em todo destino E a origem disse "ok". */
  backup_complete: z.boolean(),
})

export const ZroMediaManifestSchema = z.object({
  manifest_id: z.string().min(1).max(200),
  schema_version: z.literal(MANIFEST_SCHEMA_VERSION),
  project_id: Uuid,
  source_app: z.enum(['sobedesce', 'manual']),
  source_app_contract: z.string().max(80),
  created_at: IsoDate,
  job_id: z.string().max(200).nullable(),
  context: z.object({
    production: z.string().max(200).nullable(),
    day: z.object({ n: z.number().int().positive(), name: z.string().max(120), date: z.string().nullable() }).nullable(),
    owner: z.object({ name: z.string().max(120), camera: z.string().max(120), folder: z.string().max(200) }).nullable(),
    card_folder: RelativePath.nullable(),
  }),
  assets: z.array(MediaAssetSchema).max(50_000),
  copy_operations: z.array(CopyOperationSchema),
  verification_summary: VerificationSummarySchema,
  warnings: z.array(z.string().max(500)),
})
export type ZroMediaManifest = z.infer<typeof ZroMediaManifestSchema>
export type MediaAsset = z.infer<typeof MediaAssetSchema>

export type ManifestIssue = { level: 'error' | 'warning'; code: string; message: string; asset_id?: string }
export type ManifestValidation = { status: 'valid' | 'valid_with_warnings' | 'invalid'; issues: ManifestIssue[] }

/**
 * Validação de integridade além do formato: duplicatas, divergência de checksum entre destinos, ausências,
 * cópias não conferidas e resultado da origem. Nada é escondido: tudo vira issue.
 */
export function validateManifest(input: unknown): ManifestValidation & { manifest: ZroMediaManifest | null } {
  const parsed = ZroMediaManifestSchema.safeParse(input)
  if (!parsed.success) {
    return {
      status: 'invalid',
      manifest: null,
      issues: parsed.error.issues.slice(0, 50).map((i) => ({ level: 'error', code: 'schema', message: `${i.path.join('.') || 'manifest'}: ${i.message}` })),
    }
  }
  const m = parsed.data
  const issues: ManifestIssue[] = []
  const ids = new Map<string, number>()
  const paths = new Map<string, string>()
  for (const a of m.assets) {
    ids.set(a.asset_id, (ids.get(a.asset_id) ?? 0) + 1)
    const prev = paths.get(a.relative_path)
    if (prev && prev !== a.asset_id)
      issues.push({ level: 'error', code: 'duplicate_path', message: `Dois ativos com o mesmo caminho: ${a.relative_path}`, asset_id: a.asset_id })
    paths.set(a.relative_path, a.asset_id)

    const values = new Map<string, Set<string>>()
    for (const c of [...a.checksums, ...a.destinations.flatMap((d) => (d.checksum ? [d.checksum] : []))]) {
      if (!values.has(c.algorithm)) values.set(c.algorithm, new Set())
      values.get(c.algorithm)!.add(c.value)
    }
    for (const [alg, set] of values) {
      if (set.size > 1)
        issues.push({
          level: 'error',
          code: 'checksum_mismatch',
          message: `${a.relative_path}: checksums ${alg} diferentes entre destinos.`,
          asset_id: a.asset_id,
        })
    }
    if (a.destinations.some((d) => d.status === 'verified' && !d.checksum)) {
      issues.push({
        level: 'error',
        code: 'verified_without_checksum',
        message: `${a.relative_path}: destino marcado como conferido sem checksum.`,
        asset_id: a.asset_id,
      })
    }
    for (const d of a.destinations) {
      if (d.status === 'mismatch')
        issues.push({
          level: 'error',
          code: 'destination_mismatch',
          message: `${a.relative_path}: cópia diferente em ${d.destination_id}.`,
          asset_id: a.asset_id,
        })
      if (d.status === 'missing' || d.status === 'failed')
        issues.push({
          level: 'error',
          code: `destination_${d.status}`,
          message: `${a.relative_path}: ${d.status === 'missing' ? 'ausente' : 'falhou'} em ${d.destination_id}.`,
          asset_id: a.asset_id,
        })
    }
    if (!a.destinations.length)
      issues.push({ level: 'warning', code: 'no_destination', message: `${a.relative_path}: nenhum destino informado.`, asset_id: a.asset_id })
    for (const w of a.warnings) issues.push({ level: 'warning', code: 'asset_warning', message: `${a.relative_path}: ${w}`, asset_id: a.asset_id })
  }
  for (const [id, n] of ids) if (n > 1) issues.push({ level: 'error', code: 'duplicate_asset_id', message: `asset_id repetido (${n}×): ${id}`, asset_id: id })

  const s = m.verification_summary
  if (s.unverified_locations > 0)
    issues.push({
      level: 'warning',
      code: 'unverified_locations',
      message: `${s.unverified_locations} cópia(s) sem checksum conferido. O backup não está comprovado nesses destinos.`,
    })
  for (const op of m.copy_operations) {
    if (op.result === 'missing_files')
      issues.push({
        level: 'warning',
        code: 'source_reported_missing',
        message: 'A origem informou que faltaram arquivos nessa descarga. Confira no app de origem.',
      })
    if (op.result === 'error')
      issues.push({
        level: 'error',
        code: 'source_reported_error',
        message: `A descarga terminou com erro na origem${op.source_note ? `: ${op.source_note}` : '.'}`,
      })
  }
  for (const w of m.warnings) issues.push({ level: 'warning', code: 'manifest_warning', message: w })
  if (s.backup_complete && (s.unverified_locations || s.missing_locations || s.mismatched_locations)) {
    issues.push({
      level: 'error',
      code: 'inconsistent_summary',
      message: 'Resumo diz backup completo, mas há destinos sem conferência, ausentes ou divergentes.',
    })
  }
  const status = issues.some((i) => i.level === 'error') ? 'invalid' : issues.length ? 'valid_with_warnings' : 'valid'
  return { status, issues, manifest: m }
}

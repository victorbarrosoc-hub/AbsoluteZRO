/** The configuration selected by the owner in the paired Portuguese speech test. */
export const restorationD = {
  id: 'resemble-d-v1',
  label: 'NOSSOM Restore · D',
  lambd: 0.5,
  tau: 0.1,
  solver: 'midpoint',
  nfe: 64,
  sampleRate: 44100,
} as const;
export const vocalSeparation = {
  id: 'htdemucs-vocals-v1',
  label: 'Voz isolada da música',
  model: 'htdemucs',
  sampleRate: 44100,
} as const;
export type CloudPreset = typeof restorationD.id | typeof vocalSeparation.id;
export function isCloudPreset(value: unknown): value is CloudPreset {
  return value === restorationD.id || value === vocalSeparation.id;
}
export function outputParts(preset: CloudPreset) {
  return preset === vocalSeparation.id ? 11 : 6;
}
export const CLOUD_PART_BYTES = 20 * 1024 * 1024;
export const CLOUD_MAX_BYTES = 100 * 1024 * 1024;
export const CLOUD_MAX_SECONDS = 600;
export const CLOUD_OUTPUT_PARTS = 6;
export type CloudState =
  | 'uploading'
  | 'submitting'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'released';
export type CloudReport = {
  preset: CloudPreset;
  chunks: { index: number; bytes: number }[];
  totalBytes: number;
  frames: number;
  sampleRate: number;
  channels: number;
  gainDb: number;
};
export function validCloudReport(value: unknown): value is CloudReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as CloudReport;
  return (
    isCloudPreset(r.preset) &&
    r.sampleRate === 44100 &&
    r.channels === (r.preset === vocalSeparation.id ? 2 : 1) &&
    Number.isInteger(r.frames) &&
    r.frames >= 4410 &&
    r.frames <= 44100 * CLOUD_MAX_SECONDS &&
    Number.isFinite(r.gainDb) &&
    r.gainDb <= 0 &&
    r.gainDb >= -100 &&
    Number.isInteger(r.totalBytes) &&
    r.totalBytes === r.frames * r.channels * 4 + 44 &&
    Array.isArray(r.chunks) &&
    r.chunks.length >= 1 &&
    r.chunks.length <= outputParts(r.preset) &&
    r.chunks.every(
      (c, i) =>
        c.index === i &&
        Number.isInteger(c.bytes) &&
        c.bytes > 0 &&
        c.bytes <= CLOUD_PART_BYTES &&
        (i === r.chunks.length - 1 || c.bytes === CLOUD_PART_BYTES),
    ) &&
    r.chunks.reduce((sum, c) => sum + c.bytes, 0) === r.totalBytes
  );
}

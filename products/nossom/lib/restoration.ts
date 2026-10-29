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
/** Earlier vocal stem engine; kept so jobs started before the switch still finish. */
export const vocalSeparation = {
  id: 'htdemucs-vocals-v1',
  label: 'Voz isolada da música',
  model: 'htdemucs',
  sampleRate: 44100,
} as const;
/** Speech from any recording: music, noise and crowd removed. Mono 48 kHz. */
export const voiceIsolator = {
  id: 'voice-isolator-v1',
  label: 'NOSSOM Isolar voz',
  model: 'Mel-Band RoFormer + MossFormer2 SE 48K',
  sampleRate: 48000,
} as const;
/** Vocal stem of a song, stereo 44.1 kHz. */
export const singingSeparation = {
  id: 'roformer-vocals-v1',
  label: 'Vocal da música',
  model: 'Mel-Band RoFormer',
  sampleRate: 44100,
} as const;
export type CloudPreset =
  | typeof restorationD.id
  | typeof vocalSeparation.id
  | typeof voiceIsolator.id
  | typeof singingSeparation.id;
const presetSpecs: Record<CloudPreset, { sampleRate: number; channels: number; parts: number }> = {
  [restorationD.id]: { sampleRate: 44100, channels: 1, parts: 6 },
  [vocalSeparation.id]: { sampleRate: 44100, channels: 2, parts: 11 },
  [voiceIsolator.id]: { sampleRate: 48000, channels: 1, parts: 6 },
  [singingSeparation.id]: { sampleRate: 44100, channels: 2, parts: 11 },
};
export function isCloudPreset(value: unknown): value is CloudPreset {
  return typeof value === 'string' && Object.hasOwn(presetSpecs, value);
}
/** Presets handled by the voice tool (`vocals`), new and legacy. */
export function isVoiceToolPreset(preset: unknown) {
  return (
    preset === voiceIsolator.id || preset === singingSeparation.id || preset === vocalSeparation.id
  );
}
export function presetSpec(preset: CloudPreset) {
  return presetSpecs[preset];
}
export function outputParts(preset: CloudPreset) {
  return presetSpecs[preset].parts;
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
  if (!isCloudPreset(r.preset)) return false;
  const spec = presetSpecs[r.preset];
  return (
    r.sampleRate === spec.sampleRate &&
    r.channels === spec.channels &&
    Number.isInteger(r.frames) &&
    r.frames >= spec.sampleRate / 10 &&
    r.frames <= spec.sampleRate * CLOUD_MAX_SECONDS &&
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

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
/** Words with times (Whisper large-v3-turbo); subtitles are built in the browser. */
export const transcription = {
  id: 'whisper-transcript-v1',
  label: 'Legendas',
  model: 'Whisper large-v3-turbo',
} as const;
export type AudioPreset =
  | typeof restorationD.id
  | typeof vocalSeparation.id
  | typeof voiceIsolator.id
  | typeof singingSeparation.id;
/** Five stems that add back up to the original, for the remixer. */
export const stemSeparation = {
  id: 'stems-v1',
  label: 'Remixar',
  model: 'Mel-Band RoFormer + HTDemucs 6s',
  sampleRate: 44100,
} as const;
export const STEM_NAMES = ['voz', 'bateria', 'baixo', 'guitarra', 'outros'] as const;
/** Five stereo 24-bit FLAC stems of 10 minutes fit even when nothing compresses. */
export const STEMS_PARTS = 40;
export type CloudPreset = AudioPreset | typeof transcription.id | typeof stemSeparation.id;
const presetSpecs: Record<AudioPreset, { sampleRate: number; channels: number; parts: number }> = {
  [restorationD.id]: { sampleRate: 44100, channels: 1, parts: 6 },
  [vocalSeparation.id]: { sampleRate: 44100, channels: 2, parts: 11 },
  [voiceIsolator.id]: { sampleRate: 48000, channels: 1, parts: 6 },
  [singingSeparation.id]: { sampleRate: 44100, channels: 2, parts: 11 },
};
function isAudioPreset(value: unknown): value is AudioPreset {
  return typeof value === 'string' && Object.hasOwn(presetSpecs, value);
}
export function isCloudPreset(value: unknown): value is CloudPreset {
  return isAudioPreset(value) || value === transcription.id || value === stemSeparation.id;
}
/** Presets handled by the voice tool (`vocals`), new and legacy. */
export function isVoiceToolPreset(preset: unknown) {
  return (
    preset === voiceIsolator.id || preset === singingSeparation.id || preset === vocalSeparation.id
  );
}
export function presetSpec(preset: AudioPreset) {
  return presetSpecs[preset];
}
export function outputParts(preset: CloudPreset) {
  return preset === transcription.id
    ? 1
    : preset === stemSeparation.id
      ? STEMS_PARTS
      : presetSpecs[preset].parts;
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
  preset: AudioPreset;
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
  if (!isAudioPreset(r.preset)) return false;
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
/** A transcript is one JSON object; its words are checked again after download. */
export type TranscriptReport = {
  preset: typeof transcription.id;
  chunks: [{ index: 0; bytes: number }];
  totalBytes: number;
  words: number;
  language: string | null;
};
export const TRANSCRIPT_MAX_BYTES = 4 * 1024 * 1024;
export function validTranscriptReport(value: unknown): value is TranscriptReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as TranscriptReport;
  return (
    r.preset === transcription.id &&
    Number.isInteger(r.totalBytes) &&
    r.totalBytes > 0 &&
    r.totalBytes <= TRANSCRIPT_MAX_BYTES &&
    Array.isArray(r.chunks) &&
    r.chunks.length === 1 &&
    r.chunks[0].index === 0 &&
    r.chunks[0].bytes === r.totalBytes &&
    Number.isInteger(r.words) &&
    r.words >= 0 &&
    (r.language === null || (typeof r.language === 'string' && /^[a-z]{2,3}$/.test(r.language)))
  );
}
export type StemsReport = {
  preset: typeof stemSeparation.id;
  chunks: { index: number; bytes: number }[];
  totalBytes: number;
  frames: number;
  sampleRate: 44100;
  channels: 2;
  gainDb: number;
  stems: { name: (typeof STEM_NAMES)[number]; bytes: number }[];
};
function validChunks(chunks: unknown, total: number, maxParts: number) {
  return (
    Array.isArray(chunks) &&
    chunks.length >= 1 &&
    chunks.length <= maxParts &&
    chunks.every(
      (c, i) =>
        c.index === i &&
        Number.isInteger(c.bytes) &&
        c.bytes > 0 &&
        c.bytes <= CLOUD_PART_BYTES &&
        (i === chunks.length - 1 || c.bytes === CLOUD_PART_BYTES),
    ) &&
    chunks.reduce((sum: number, c: { bytes: number }) => sum + c.bytes, 0) === total
  );
}
export function validStemsReport(value: unknown): value is StemsReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as StemsReport;
  return (
    r.preset === stemSeparation.id &&
    r.sampleRate === 44100 &&
    r.channels === 2 &&
    Number.isInteger(r.frames) &&
    r.frames >= 4410 &&
    r.frames <= 44100 * CLOUD_MAX_SECONDS &&
    Number.isFinite(r.gainDb) &&
    r.gainDb <= 0 &&
    r.gainDb >= -100 &&
    Number.isInteger(r.totalBytes) &&
    Array.isArray(r.stems) &&
    r.stems.length === STEM_NAMES.length &&
    r.stems.every(
      (stem, i) => stem.name === STEM_NAMES[i] && Number.isInteger(stem.bytes) && stem.bytes > 0,
    ) &&
    r.stems.reduce((sum, stem) => sum + stem.bytes, 0) === r.totalBytes &&
    validChunks(r.chunks, r.totalBytes, STEMS_PARTS)
  );
}
export function validJobReport(
  value: unknown,
): value is CloudReport | TranscriptReport | StemsReport {
  return validCloudReport(value) || validTranscriptReport(value) || validStemsReport(value);
}

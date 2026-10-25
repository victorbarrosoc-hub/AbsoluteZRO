import {
  operations,
  deliveryPresets,
  studioVoice,
  type Operation,
  type DenoiseMode,
  type FilterSettings,
} from './presets';
import { isEffectId } from './effects';
export type SavedRecipe = {
  id: string;
  name: string;
  operation: Operation;
  intensity: number;
  mode: DenoiseMode;
  target: number;
  peak: number;
  musicGain: number;
  settings: FilterSettings;
};
export function validRecipe(value: unknown): value is SavedRecipe {
  if (!value || typeof value !== 'object') return false;
  const v = value as SavedRecipe,
    s = v.settings;
  if (
    typeof v.id !== 'string' ||
    typeof v.name !== 'string' ||
    v.name.length > 60 ||
    !operations.some((o) => o.id === v.operation) ||
    !['studio', 'voice', 'general'].includes(v.mode) ||
    !s ||
    typeof s !== 'object'
  )
    return false;
  if (![v.intensity, v.target, v.peak, v.musicGain].every(Number.isFinite)) return false;
  if (s.automatic !== undefined && typeof s.automatic !== 'boolean') return false;
  if (s.effect !== undefined && !isEffectId(s.effect)) return false;
  if (s.deliveryPreset !== undefined && !deliveryPresets.some((p) => p.id === s.deliveryPreset))
    return false;
  for (const key of [
    'presence',
    'compression',
    'highpass',
    'noiseReduction',
    'noiseFloor',
    'neuralAttenuation',
    'deess',
    'hum',
    'effectMix',
  ] as const)
    if (s[key] !== undefined && !Number.isFinite(s[key])) return false;
  if (s.eq && (!Array.isArray(s.eq) || s.eq.length !== 5 || !s.eq.every(Number.isFinite)))
    return false;
  if (
    s.masterPreset &&
    s.masterPreset !== 'broadcast' &&
    s.masterPreset !== studioVoice.id &&
    !deliveryPresets.some((p) => p.id === s.masterPreset)
  )
    return false;
  if (s.broadcast) {
    const b = s.broadcast;
    if (
      !Array.isArray(b.crossovers) ||
      b.crossovers.length !== 3 ||
      !b.crossovers.every(Number.isFinite) ||
      !Array.isArray(b.bands) ||
      b.bands.length !== 4
    )
      return false;
    if (
      !b.bands.every(
        (b) =>
          b &&
          ['threshold', 'gain', 'ratio', 'attack', 'release'].every((k) =>
            Number.isFinite(b[k as keyof typeof b]),
          ),
      )
    )
      return false;
    if (
      ![
        'limiterThreshold',
        'limiterMargin',
        'limiterAttack',
        'limiterRelease',
        'outputGain',
        'inputBoost',
        'ceiling',
        'lookahead',
        'release',
      ].every((k) => Number.isFinite(b[k as keyof typeof b]))
    )
      return false;
  }
  return true;
}

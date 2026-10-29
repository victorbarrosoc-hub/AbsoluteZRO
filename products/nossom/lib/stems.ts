import { STEM_NAMES } from './restoration';

export type StemName = (typeof STEM_NAMES)[number];
export type StemSetting = { db: number; muted: boolean };
export const stemLabels: Record<StemName, string> = {
  voz: 'Voz',
  bateria: 'Bateria',
  baixo: 'Baixo',
  guitarra: 'Guitarra',
  outros: 'Outros',
};
export const STEM_MIN_DB = -24;
export const STEM_MAX_DB = 12;

export const flatMix = (): StemSetting[] => STEM_NAMES.map(() => ({ db: 0, muted: false }));
export const mixPresets: { id: string; label: string; settings: () => StemSetting[] }[] = [
  { id: 'all', label: 'Tudo', settings: flatMix },
  {
    id: 'instrumental',
    label: 'Só instrumental',
    settings: () => STEM_NAMES.map((name) => ({ db: 0, muted: name === 'voz' })),
  },
  {
    id: 'acapella',
    label: 'Só acapella',
    settings: () => STEM_NAMES.map((name) => ({ db: 0, muted: name !== 'voz' })),
  },
];

/** Linear gain of one fader. The bottom of the fader is silence, like the mute. */
export function stemGain({ db, muted }: StemSetting) {
  if (muted || db <= STEM_MIN_DB) return 0;
  return 10 ** (Math.min(db, STEM_MAX_DB) / 20);
}

/** A short name for the version: the preset when it matches one, the changes otherwise. */
export function mixLabel(settings: StemSetting[]) {
  const preset = mixPresets.find(
    (p) =>
      p.id !== 'all' && p.settings().every((s, i) => stemGain(s) === stemGain(settings[i] ?? s)),
  );
  if (preset) return preset.label;
  const changes = settings
    .map((s, i) => {
      const label = stemLabels[STEM_NAMES[i]];
      if (stemGain(s) === 0) return `${label} mudo`;
      if (s.db === 0) return null;
      return `${label} ${s.db > 0 ? '+' : '−'}${Math.abs(s.db)} dB`;
    })
    .filter(Boolean);
  return changes.length ? 'Remix: ' + changes.join(' · ') : 'Remix sem mudanças';
}

/**
 * Render the remix offline at 44.1 kHz stereo. The stems carry one shared gain from the
 * worker; it is undone here so that "Tudo" gives back the original level.
 */
export async function renderMix(files: Blob[], settings: StemSetting[], gainDb: number) {
  if (settings.every((s) => stemGain(s) === 0))
    throw new Error('Tudo está mudo. Deixe pelo menos uma faixa tocando.');
  const first = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(
    await files[0].arrayBuffer(),
  );
  const context = new OfflineAudioContext(2, first.length, 44100);
  const restore = 10 ** (-gainDb / 20);
  for (const [i, file] of files.entries()) {
    const gain = stemGain(settings[i]) * restore;
    if (!gain) continue;
    const source = context.createBufferSource();
    source.buffer = i === 0 ? first : await context.decodeAudioData(await file.arrayBuffer());
    const node = context.createGain();
    node.gain.value = gain;
    source.connect(node).connect(context.destination);
    source.start();
  }
  return context.startRendering();
}

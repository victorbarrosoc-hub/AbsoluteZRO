import { broadcastFilter, type BroadcastSettings } from './broadcast';
import { equalizerFilter, type EqGains } from './equalizer';
import type { RestorationAnalysis } from './neural';
import type { EffectId } from './effects';
export type Operation =
  | 'vocals'
  | 'auto'
  | 'denoise'
  | 'clarity'
  | 'eq'
  | 'wind'
  | 'level'
  | 'master'
  | 'effects'
  | 'mix';
export type Intensity = number | 'light' | 'balanced' | 'strong';
export type DenoiseMode = 'studio' | 'voice' | 'general';
export function strengthValue(value: Intensity): number {
  const n = typeof value === 'number' ? value : { light: 30, balanced: 65, strong: 100 }[value];
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 65;
}
export type FilterSettings = {
  vocalSeparation?: import('./restoration').CloudReport;
  cloudRestoration?: import('./restoration').CloudReport &
    Pick<
      typeof import('./restoration').restorationD,
      'id' | 'label' | 'lambd' | 'tau' | 'solver' | 'nfe'
    >;
  automatic?: boolean;
  restoration?: RestorationAnalysis;
  mudCut?: number;
  noiseFloor?: number;
  noiseReduction?: number;
  presence?: number;
  compression?: number;
  highpass?: number;
  deess?: number;
  hum?: number;
  neuralAttenuation?: number;
  neural?: boolean;
  eq?: EqGains;
  masterPreset?: string;
  broadcast?: BroadcastSettings;
  deliveryPreset?: string;
  effect?: EffectId;
  effectMix?: number;
  effectTailSeconds?: number;
  clippingRepair?: {
    method: 'autoregressive';
    detected: number;
    headroomGainDb: number;
    status: 'reconstructed' | 'not-detected' | 'limited';
  };
};
export const operations: { id: Operation; label: string; description: string }[] = [
  {
    id: 'vocals',
    label: 'Isolar voz',
    description: 'Fica só a voz: sem música, ruído ou conversa de fundo.',
  },
  {
    id: 'auto',
    label: 'Restaurar com IA',
    description: 'Voz mais limpa e clara, pronta para ajustar.',
  },
  {
    id: 'denoise',
    label: 'Reduzir ruído',
    description: 'Limpeza neural para fala ou redução espectral para áudio geral.',
  },
  {
    id: 'clarity',
    label: 'Melhorar voz',
    description: 'Combine limpeza, presença e compressão, com controles independentes.',
  },
  {
    id: 'eq',
    label: 'Equalização',
    description: 'Escolha uma assinatura de voz ou desenhe a sua curva em cinco bandas.',
  },
  {
    id: 'wind',
    label: 'Atenuar vento',
    description: 'Combine corte de graves com redução espectral. Ajuste a frequência de corte.',
  },
  {
    id: 'level',
    label: 'Nivelar volumes',
    description: 'Equilibre trechos baixos e altos com ganho adaptativo e compressão.',
  },
  {
    id: 'master',
    label: 'Preparar entrega',
    description: 'Ajuste o volume percebido e meça o resultado renderizado.',
  },
  {
    id: 'effects',
    label: 'Efeitos',
    description:
      'Crie ambientes, simule telefone e rádio ou dê outra textura à voz. Ajuste a intensidade e remova quando quiser.',
  },
  {
    id: 'mix',
    label: 'Mixar com música',
    description: 'Adicione uma trilha e reduza seu volume durante a fala.',
  },
];
export const deliveryPresets = [
  {
    id: 'podcast',
    label: 'Podcast estéreo',
    lufs: -16,
    peak: -1,
    version: 'nossom-guidance-1',
    note: 'Orientação editorial, não uma exigência universal.',
  },
  {
    id: 'social',
    label: 'Redes sociais · vídeo de conteúdo',
    lufs: -14,
    peak: -1,
    version: 'nossom-guidance-1',
    note: 'Ponto de partida para Reels, TikTok e Shorts. Cada plataforma pode normalizar o volume de outra forma.',
  },
  {
    id: 'youtube',
    label: 'YouTube · vídeos e entrevistas',
    lufs: -14,
    peak: -1,
    version: 'nossom-guidance-2',
    note: 'Meta editorial para vídeo online; o YouTube pode ajustar o volume de reprodução. Não é uma exigência de upload.',
  },
  {
    id: 'netflix-dialogue',
    label: 'Netflix · referência de diálogo',
    lufs: -27,
    peak: -2,
    version: 'nossom-dialogue-reference-1',
    note: 'Use em diálogo isolado. A mixagem completa exige medição por diálogo, revisão técnica e as especificações vigentes do projeto. Este preset não certifica uma entrega Netflix.',
  },
  {
    id: 'ebu',
    label: 'TV · EBU R128',
    lufs: -23,
    peak: -1,
    version: 'nossom-ebu-reference-1',
    note: 'Referência de loudness. Confirme tolerâncias e true peak com o cliente; não constitui certificação.',
  },
  {
    id: 'atsc',
    label: 'TV · ATSC A/85',
    lufs: -24,
    peak: -2,
    version: 'nossom-atsc-reference-1',
    note: 'Referência de −24 LKFS para broadcast. Confirme requisitos de medição, canais, loudness e pico com a emissora.',
  },
] as const;
/** Close-mic finishing for a restored voice: rumble cut, less box, presence, gentle de-ess and
 * compression, then two-pass loudness. Fixed and conservative; not a copy of any other product. */
export const studioVoice = {
  id: 'studio-voice',
  label: 'Voz de estúdio',
  lufs: -16,
  peak: -1,
  version: 'nossom-studio-voice-1',
} as const;
export function studioVoiceChain(strength: number) {
  const s = Math.min(1, Math.max(0, strength));
  return [
    'highpass=f=75:p=2',
    `equalizer=f=250:t=q:w=0.9:g=${(-2.5 * s).toFixed(2)}`,
    `equalizer=f=3200:t=q:w=0.8:g=${(2.5 * s).toFixed(2)}`,
    `equalizer=f=10000:t=h:w=0.7:g=${(1.5 * s).toFixed(2)}`,
    `deesser=i=${(0.35 * s).toFixed(3)}:m=0.5:f=0.5`,
    `acompressor=threshold=0.1:ratio=${(1 + 1.5 * s).toFixed(2)}:attack=12:release=200:makeup=1`,
  ].join(',');
}
export function treatmentFilter(
  operation: Operation,
  intensity: Intensity,
  target = -16,
  peak = -1,
  settings: FilterSettings = {},
): string {
  if (operation === 'vocals') throw new Error('Separar vocais requer o modelo musical na GPU.');
  if (operation === 'mix') throw new Error('Mixagem requer duas faixas.');
  const strength = strengthValue(intensity) / 100;
  if (operation === 'master' && settings.masterPreset === 'broadcast')
    return broadcastFilter(settings.broadcast, strength * 100);
  if (strength === 0 && operation !== 'master') return 'anull';
  const finite = (n: number | undefined, fallback: number, min: number, max: number) =>
    Number.isFinite(n) ? Math.min(max, Math.max(min, n!)) : fallback;
  const floor = finite(settings.noiseFloor, -50, -80, -20);
  const reduction = finite(settings.noiseReduction, 36, 0, 48) * strength;
  const spectral =
    reduction === 0
      ? 'anull'
      : `afftdn=nr=${Math.max(0.01, reduction)}:nf=${floor}:tn=1:gs=12:ad=0.6`;
  const ratio = 1 + (finite(settings.compression, 6, 1, 8) - 1) * strength;
  const presence = finite(settings.presence, 6, 0, 9) * strength;
  switch (operation) {
    case 'effects':
      return 'anull'; // The effect is rendered in float before the FFmpeg delivery stage.
    case 'auto':
      return `${treatmentFilter('clarity', 100, target, peak, settings)},volume=${settings.restoration?.normalizationGainDb ?? 0}dB,${broadcastFilter(settings.broadcast, 100)}`;
    case 'denoise':
      return settings.neural ? 'anull' : spectral;
    case 'clarity':
      return `${settings.hum === 50 || settings.hum === 60 ? [1, 2, 3, 4].map((n) => `equalizer=f=${settings.hum! * n}:t=q:w=8:g=-18`).join(',') + ',' : ''}${settings.deess ? `deesser=i=${(Math.min(1, Math.max(0, settings.deess / 100)) * strength).toFixed(3)}:m=0.5:f=0.5,` : ''}${settings.neural ? 'anull' : spectral},highpass=f=70:p=2,equalizer=f=280:t=q:w=0.7:g=${(settings.automatic ? finite(settings.mudCut, 0, -3, 0) : -strength * 3).toFixed(2)},equalizer=f=3000:t=q:w=0.7:g=${presence},acompressor=threshold=0.09:ratio=${ratio}:attack=12:release=180:makeup=${(settings.automatic ? 1 : 1 + strength * 0.8).toFixed(2)},alimiter=limit=0.8913:level=0:latency=1`;
    case 'eq':
      return equalizerFilter(settings.eq, settings.highpass, strength);
    case 'wind':
      return `highpass=f=${finite(settings.highpass, Math.round(40 + strength * 220), 30, 300)}:p=2,${spectral}`;
    case 'level':
      return `dynaudnorm=f=250:g=15:p=0.8:m=${(1 + strength * 7).toFixed(2)}:s=5,acompressor=threshold=0.12:ratio=${ratio}:attack=10:release=220:makeup=1,alimiter=limit=0.8913:level=0:latency=1`;
    case 'master':
      if (settings.masterPreset === studioVoice.id)
        return `${studioVoiceChain(strength)},loudnorm=I=${finite(target, studioVoice.lufs, -30, -10)}:TP=${finite(peak, studioVoice.peak, -6, -1)}:LRA=${Math.round(14 - strength * 7)}:print_format=json`;
      return `${settings.eq ? equalizerFilter(settings.eq, settings.highpass, strength) + ',' : ''}${settings.compression ? `acompressor=threshold=0.12:ratio=${ratio}:attack=15:release=160:makeup=1,` : ''}loudnorm=I=${finite(target, -16, -30, -10)}:TP=${finite(peak, -1, -6, -1)}:LRA=${Math.round(14 - strength * 10)}:print_format=json`;
  }
}
export function inferPlan(text: string): Operation | null {
  if (
    /(isolar|separar|extrair|s[oó] a voz|acapella|a capella|voca[li])/i.test(text) &&
    /(m[uú]sica|cantor|canto|voca[li]|instrument|acapella|a capella)/i.test(text)
  )
    return 'vocals';
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/separ|stem|eco|reverb|transcrev|clon/.test(normalized)) return null;
  if (/tratamento completo|deixar pronto|resolver tudo/.test(normalized)) return 'auto';
  if (/capela|igreja|telefone|radio|auditorio/.test(normalized)) return 'effects';
  if (/youtube|netflix|atsc|ebu|redes sociais|\btv\b/.test(normalized)) return 'master';
  if (/ruid|ar.condicionado|chiado|limp|restaur|isol/.test(normalized)) return 'denoise';
  if (/equaliz|eq\b|timbre/.test(normalized)) return 'eq';
  if (/vento|grave/.test(normalized)) return 'wind';
  if (/music|trilha|duck|mix/.test(normalized)) return 'mix';
  if (/entreg|master|lufs|public|transmiss|limitador|broadcast/.test(normalized)) return 'master';
  if (/nivel|volume/.test(normalized)) return 'level';
  if (/voz|clareza|presenca|sibil|deess|dialogo|hum/.test(normalized)) return 'clarity';
  if (/automatic/.test(normalized)) return 'auto';
  return null;
}

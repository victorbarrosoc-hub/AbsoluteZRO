export const eqFrequencies = [100, 250, 1000, 3500, 10000] as const;
export type EqGains = [number, number, number, number, number];
export const eqPresets: {
  id: string;
  label: string;
  description: string;
  gains: EqGains;
  highpass: number;
}[] = [
  {
    id: 'neutral',
    label: 'Neutro',
    description: 'Ponto de partida sem realce de frequência.',
    gains: [0, 0, 0, 0, 0],
    highpass: 30,
  },
  {
    id: 'warm',
    label: 'Corpo e calor',
    description: 'Mais corpo e agudos suaves para narração.',
    gains: [2.5, 1, 0, -1, 1],
    highpass: 65,
  },
  {
    id: 'presence',
    label: 'Voz em destaque',
    description: 'Menos graves médios e mais articulação.',
    gains: [0, -2.5, 1, 3, 1.5],
    highpass: 80,
  },
  {
    id: 'air',
    label: 'Brilho e abertura',
    description: 'Realce suave de presença e frequências altas.',
    gains: [-1, -1, 0, 1.5, 3],
    highpass: 70,
  },
];
export function equalizerFilter(
  gains: EqGains = [0, 0, 0, 0, 0],
  highpass = 30,
  strength = 1,
): string {
  const scale = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 1;
  const bands = gains.map((g) => (Number.isFinite(g) ? Math.max(-12, Math.min(12, g)) * scale : 0));
  const hp = Number.isFinite(highpass) ? Math.max(20, Math.min(300, highpass)) : 30;
  return (
    `highpass=f=${hp}:p=2,volume=${-Math.max(0, ...bands)}dB,` +
    bands.map((g, i) => `equalizer=f=${eqFrequencies[i]}:t=q:w=0.8:g=${g.toFixed(3)}`).join(',')
  );
}

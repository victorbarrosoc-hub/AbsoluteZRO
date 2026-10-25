export type CompressorBand = {
  threshold: number;
  gain: number;
  ratio: number;
  attack: number;
  release: number;
};
export type BroadcastSettings = {
  crossovers: [number, number, number];
  bands: CompressorBand[];
  limiterThreshold: number;
  limiterMargin: number;
  limiterAttack: number;
  limiterRelease: number;
  outputGain: number;
  inputBoost: number;
  ceiling: number;
  lookahead: number;
  release: number;
};
/** Values transcribed from the user's two Premiere screenshots. */
export const broadcastReference: BroadcastSettings = {
  crossovers: [137, 1147, 6910],
  bands: [
    { threshold: -20.2, gain: 1, ratio: 3, attack: 1, release: 100 },
    { threshold: -17.6, gain: 0, ratio: 2, attack: 1, release: 100 },
    { threshold: -24.8, gain: 0, ratio: 2, attack: 1, release: 100 },
    { threshold: -25, gain: 3, ratio: 3, attack: 1, release: 100 },
  ],
  limiterThreshold: -10,
  limiterMargin: -0.1,
  limiterAttack: 1,
  limiterRelease: 250,
  outputGain: 0,
  inputBoost: 6,
  ceiling: -3,
  lookahead: 7,
  release: 100,
};
export function freshBroadcast(): BroadcastSettings {
  return structuredClone(broadcastReference);
}
export function dbAmplitude(db: number) {
  return Math.pow(10, db / 20);
}
const clamp = (n: number, min: number, max: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
export function broadcastFilter(
  input: BroadcastSettings = broadcastReference,
  strength = 100,
): string {
  const wet = clamp(strength, 0, 100, 100) / 100;
  if (!wet) return 'anull';
  const cross = input.crossovers.map((n, i) =>
    clamp(n, [40, 400, 2500][i], [350, 2500, 12000][i], broadcastReference.crossovers[i]),
  );
  const parts = [
    `asplit=2[mbDryInput][mbWet];[mbDryInput]acrossover=split='${cross.join(' ')}':order=4th[md0][md1][md2][md3];[md0][md1][md2][md3]amix=inputs=4:normalize=0:duration=first[mbDry];[mbWet]acrossover=split='${cross.join(' ')}':order=4th[mb0][mb1][mb2][mb3]`,
  ];
  for (let i = 0; i < 4; i++) {
    const b = input.bands[i] ?? broadcastReference.bands[i];
    parts.push(
      `[mb${i}]acompressor=threshold=${dbAmplitude(clamp(b.threshold, -60, 0, -20))}:ratio=${clamp(b.ratio, 1, 20, 2)}:attack=${clamp(b.attack, 0.01, 2000, 1)}:release=${clamp(b.release, 1, 9000, 100)}:makeup=${dbAmplitude(clamp(b.gain, 0, 20, 0))}:knee=1:detection=rms[mc${i}]`,
    );
  }
  parts.push(
    `[mc0][mc1][mc2][mc3]amix=inputs=4:normalize=0:duration=first,alimiter=limit=${dbAmplitude(clamp(input.limiterThreshold, -24, 0, -10))}:level_out=${dbAmplitude(clamp(input.limiterMargin, -12, 0, -0.1))}:attack=${clamp(input.limiterAttack, 0.1, 80, 1)}:release=${clamp(input.limiterRelease, 1, 8000, 250)}:level=1:latency=1,volume=${clamp(input.outputGain, -24, 24, 0) + clamp(input.inputBoost, 0, 24, 6)}dB,alimiter=limit=${dbAmplitude(clamp(input.ceiling, -12, -0.1, -3))}:attack=${clamp(input.lookahead, 0.1, 80, 7)}:release=${clamp(input.release, 1, 8000, 100)}:level=0:latency=1[mbProcessed]`,
  );
  parts.push(
    `[mbDry]volume=${(1 - wet).toFixed(4)}[mbD];[mbProcessed]volume=${wet.toFixed(4)}[mbP];[mbD][mbP]amix=inputs=2:normalize=0:duration=first`,
  );
  return parts.join(';');
}

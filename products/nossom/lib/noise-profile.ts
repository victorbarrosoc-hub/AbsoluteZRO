export type NoiseProfile = { floorDb: number; confidence: 'estimated' | 'uncertain' };
/** Lower-percentile 20 ms RMS windows; never claim silent speech is a known noise sample. */
export function estimateNoiseFloor(data: Float32Array, sampleRate = 48000): NoiseProfile {
  const size = Math.round(sampleRate * 0.02),
    levels: number[] = [];
  for (let start = 0; start < data.length; start += size) {
    let sum = 0;
    const end = Math.min(start + size, data.length);
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    levels.push(10 * Math.log10(Math.max(1e-12, sum / (end - start))));
  }
  if (!levels.length) return { floorDb: -50, confidence: 'uncertain' };
  levels.sort((a, b) => a - b);
  const low = levels[Math.floor(levels.length * 0.15)],
    high = levels[Math.floor(levels.length * 0.85)];
  const confident = high - low > 8 && low > -80;
  return {
    floorDb: confident ? Math.round(Math.max(-70, Math.min(-20, low))) : -50,
    confidence: confident ? 'estimated' : 'uncertain',
  };
}

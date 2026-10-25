/** Padding keeps overlap/add analysis away from the first and last live samples. */
export function clippingRepairFilter(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('Duração inválida para reconstrução.');
  return `adelay=55:all=1,apad=pad_dur=0.055,adeclip=window=20:arorder=2:threshold=10,atrim=start=0.055:end=${(duration + 0.055).toFixed(9)},asetpts=PTS-STARTPTS`;
}
/** Dense missing samples make the AR solver cubic and unreliable. Keep a bounded fallback. */
export function denseClipping(channels: Float32Array[]) {
  let flat = 0,
    count = 0;
  for (const channel of channels) {
    count += channel.length;
    let run = 0;
    for (let i = 1; i <= channel.length; i++) {
      if (
        i < channel.length &&
        Math.abs(channel[i]) > 0.01 &&
        Math.abs(channel[i] - channel[i - 1]) < 0.000001
      )
        run++;
      else {
        if (run >= 3) flat += run;
        run = 0;
      }
    }
  }
  return { flatSamples: flat, tooDense: count > 0 && flat / count > 0.25 };
}

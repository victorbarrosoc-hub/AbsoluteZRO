// Linked spectral gains: keep the recording's phase and inter-channel relationships.
const size = 1024,
  hop = size / 2;
const window = Float64Array.from({ length: size }, (_, i) => Math.sin((Math.PI * i) / size));
const cosine = Float64Array.from({ length: hop }, (_, i) => Math.cos((2 * Math.PI * i) / size));
const sine = Float64Array.from({ length: hop }, (_, i) => Math.sin((2 * Math.PI * i) / size));
function fft(real, imag, inverse = false) {
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2,
      step = size / length;
    for (let start = 0; start < size; start += length) {
      for (let j = 0; j < half; j++) {
        const a = start + j,
          b = a + half,
          k = j * step;
        const s = sine[k] * (inverse ? 1 : -1),
          c = cosine[k];
        const r = real[b] * c - imag[b] * s,
          im = real[b] * s + imag[b] * c;
        real[b] = real[a] - r;
        imag[b] = imag[a] - im;
        real[a] += r;
        imag[a] += im;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < size; i++) {
      real[i] /= size;
      imag[i] /= size;
    }
}
function percentiles(channels) {
  const levels = [],
    frame = 960,
    length = channels[0].length;
  for (let offset = 0; offset < length; offset += frame) {
    let energy = 0;
    const end = Math.min(length, offset + frame);
    for (const channel of channels) for (let i = offset; i < end; i++) energy += channel[i] ** 2;
    const rms = Math.sqrt(energy / ((end - offset) * channels.length));
    if (rms > 0.00001) levels.push(rms); // Digital silence is not evidence of a noise floor.
  }
  levels.sort((a, b) => a - b);
  const q = (p) => levels[Math.min(levels.length - 1, Math.floor(p * levels.length))] ?? 0;
  return { low: q(0.15), voice: q(0.85) };
}
/** @param {Float32Array[]} original @param {Float32Array[]} enhanced
 * @param {{ automatic?: boolean, attenuation?: number, progress?: (value: number) => void }} options
 * Mutates enhanced only after those samples have been consumed by the next analysis frame.
 */
export function restoreNatural(original, enhanced, options = {}) {
  if (
    !original.length ||
    original.length !== enhanced.length ||
    original.some((c, i) => c.length !== enhanced[i].length)
  )
    throw new Error('Os canais restaurados não correspondem à gravação.');
  const levels = percentiles(original);
  const gap = 20 * Math.log10(Math.max(1e-8, levels.voice) / Math.max(1e-8, levels.low));
  const quietDb = 20 * Math.log10(Math.max(1e-8, levels.low));
  const confident = gap > 12 && quietDb > -75;
  const automatic = options.automatic !== false;
  const attenuation = automatic
    ? confident && quietDb >= -60
      ? 36
      : 24
    : Math.max(0, Math.min(80, options.attenuation ?? 24));
  const baseExponent = automatic
    ? quietDb < -60
      ? 0.03
      : confident
        ? Math.max(0.04, Math.min(0.3, (0.5 * levels.low) / Math.max(1e-8, levels.voice)))
        : 0.15
    : 0.75;
  // Extra suppression belongs to clearly audible background, not already separated speech.
  // A smooth transition avoids removing speech harmonics on higher-SNR recordings.
  const noisyWeight = automatic && quietDb > -50 ? Math.max(0, Math.min(1, (24 - gap) / 6)) : 0;
  const noiseExponent = confident
    ? Math.max(0.3, Math.min(0.7, 0.3 + levels.low / Math.max(1e-8, levels.voice)))
    : 0.55;
  const exponent = baseExponent + (noiseExponent - baseExponent) * noisyWeight;
  const minimum = 10 ** (-attenuation / 20),
    length = original[0].length;
  const buffers = original.map(() => ({
    real: new Float64Array(size),
    imag: new Float64Array(size),
    cleanReal: new Float64Array(size),
    cleanImag: new Float64Array(size),
    carry: new Float64Array(hop),
  }));
  const previous = new Float64Array(hop + 1).fill(1),
    raw = new Float64Array(hop + 1),
    gains = new Float64Array(hop + 1);
  const bandPower = new Float64Array(5);
  for (let offset = -hop, count = 0; offset < length; offset += hop, count++) {
    let inputEnergy = 0,
      foregroundEnergy = 0;
    for (let c = 0; c < original.length; c++) {
      const b = buffers[c];
      b.imag.fill(0);
      b.cleanImag.fill(0);
      for (let i = 0; i < size; i++) {
        const at = offset + i;
        b.real[i] = (original[c][at] ?? 0) * window[i];
        b.cleanReal[i] = (enhanced[c][at] ?? 0) * window[i];
        inputEnergy += b.real[i] ** 2;
        foregroundEnergy += b.cleanReal[i] ** 2;
      }
      fft(b.real, b.imag);
      fft(b.cleanReal, b.cleanImag);
    }
    const foregroundRatio = Math.sqrt(foregroundEnergy / Math.max(1e-20, inputEnergy));
    const frameExponent = automatic
      ? exponent + (1 - exponent) * Math.max(0, Math.min(1, (0.25 - foregroundRatio) / 0.17))
      : exponent;
    for (let bin = 0; bin <= hop; bin++) {
      let input = 0,
        clean = 0;
      for (const b of buffers) {
        input += b.real[bin] ** 2 + b.imag[bin] ** 2;
        clean += b.cleanReal[bin] ** 2 + b.cleanImag[bin] ** 2;
      }
      const foregroundBin = Math.min(1, Math.sqrt(clean / Math.max(1e-20, input)));
      const binExponent = automatic
        ? Math.max(
            frameExponent,
            exponent + (1 - exponent) * Math.max(0, Math.min(1, (0.15 - foregroundBin) / 0.1)),
          )
        : frameExponent;
      raw[bin] = attenuation === 0 ? 1 : Math.max(minimum, foregroundBin ** binExponent);
    }
    for (let bin = 0; bin <= hop; bin++) {
      const smoothed = (raw[Math.max(0, bin - 1)] + 2 * raw[bin] + raw[Math.min(hop, bin + 1)]) / 4;
      const response = smoothed >= previous[bin] ? 0.08 : 0.6;
      gains[bin] = previous[bin] = previous[bin] * response + smoothed * (1 - response);
      const frequency = (bin * 48000) / size;
      const band =
        frequency < 150 ? 0 : frequency < 500 ? 1 : frequency < 2500 ? 2 : frequency < 5000 ? 3 : 4;
      for (const b of buffers)
        bandPower[band] += (b.real[bin] ** 2 + b.imag[bin] ** 2) * gains[bin] ** 2;
    }
    for (let c = 0; c < original.length; c++) {
      const b = buffers[c];
      for (let bin = 0; bin < size; bin++) {
        const gain = gains[bin <= hop ? bin : size - bin];
        b.real[bin] *= gain;
        b.imag[bin] *= gain;
      }
      fft(b.real, b.imag, true);
      for (let i = 0; i < hop; i++) {
        const at = offset + i;
        if (at >= 0 && at < length) enhanced[c][at] = b.carry[i] + b.real[i] * window[i];
        b.carry[i] = b.real[i + hop] * window[i + hop];
      }
    }
    if (count % 100 === 0) options.progress?.(Math.max(0, Math.round((offset / length) * 100)));
  }
  const output = percentiles(enhanced);
  const gainDb =
    automatic && output.voice > 0
      ? Math.max(0, Math.min(3, 20 * Math.log10(Math.max(1e-8, levels.voice) / output.voice)))
      : 0;
  const presenceRatio =
    10 * Math.log10(Math.max(1e-20, bandPower[3]) / Math.max(1e-20, bandPower[2]));
  const bodyRatio = 10 * Math.log10(Math.max(1e-20, bandPower[1]) / Math.max(1e-20, bandPower[2]));
  const highRatio = 10 * Math.log10(Math.max(1e-20, bandPower[4]) / Math.max(1e-20, bandPower[2]));
  return {
    channels: enhanced,
    analysis: {
      version: 'natural-3',
      automatic,
      attenuationDb: attenuation,
      estimatedGapDb: Math.round(gap),
      noiseConfidence: confident ? 'estimated' : 'uncertain',
      maskExponent: exponent,
      linkedStereo: true,
      gainCompensationDb: Math.round(gainDb * 100) / 100,
      voiceLevelDb: Math.round(20 * Math.log10(Math.max(1e-8, output.voice)) * 100) / 100,
      normalizationGainDb:
        output.voice > 0
          ? Math.round(Math.max(-12, Math.min(24, -18 - 20 * Math.log10(output.voice))) * 100) / 100
          : 0,
      presence: presenceRatio < -10 ? Math.min(2, (-10 - presenceRatio) / 4) : 0,
      mudCut: bodyRatio > 5 ? -Math.min(2, (bodyRatio - 5) / 3) : 0,
      deess: highRatio > -8 ? 20 : 0,
      compression: gap > 24 ? 1.5 : 1.2,
    },
  };
}

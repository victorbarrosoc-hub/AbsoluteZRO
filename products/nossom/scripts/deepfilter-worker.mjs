import { DeepFilter } from './deepfilter.js';
import { restoreNatural } from './voice-restoration.js';
// Bundled DF3: FFT 960, hop 480, look-ahead 2. Total algorithmic delay: 1440 samples.
self.onmessage = async ({ data }) => {
  try {
    const channels = [];
    for (let c = 0; c < data.channels.length; c++) {
      const filter = await DeepFilter.create({
        wasmUrl: new URL('./df_bg.wasm', import.meta.url).href,
        attenuationLimit: 100,
      });
      const size = filter.frameLength,
        delay = 1440;
      if (size !== 480) throw new Error('O modelo de restauração não corresponde ao motor NOSSOM.');
      const source = data.channels[c],
        result = new Float32Array(source.length),
        frame = new Float32Array(size);
      const total = Math.ceil((source.length + delay) / size);
      try {
        for (let f = 0; f < total; f++) {
          frame.fill(0);
          frame.set(source.subarray(f * size, Math.min(source.length, (f + 1) * size)));
          const out = filter.process(frame);
          for (let j = 0; j < size; j++) {
            const at = f * size + j - delay;
            if (at >= 0 && at < result.length) result[at] = out[j];
          }
          if (f % 50 === 0)
            self.postMessage({
              type: 'progress',
              value: Math.round(((c + f / total) / data.channels.length) * 80),
            });
        }
      } finally {
        filter.destroy();
      }
      channels.push(result);
    }
    const result = restoreNatural(data.channels, channels, {
      automatic: data.automatic,
      attenuation: data.attenuation,
      progress: (value) =>
        self.postMessage({ type: 'progress', value: 80 + Math.round(value * 0.2) }),
    });
    self.postMessage(
      { type: 'result', ...result },
      channels.map((c) => c.buffer),
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Falha no motor de restauração.',
    });
  }
};

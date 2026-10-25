import { Rnnoise } from './rnnoise.js';
// RNNoise works at 48 kHz, with 480 sample frames and one frame of algorithmic delay.
// Each channel has independent recurrent state. Flush and trim the delay to preserve A/B alignment.
self.onmessage = async ({ data }) => {
  try {
    const rnnoise = await Rnnoise.load();
    const outputs = [];
    const size = rnnoise.frameSize;
    if (size !== 480) throw new Error('Modelo de voz incompatível com esta versão.');
    for (let channel = 0; channel < data.channels.length; channel++) {
      const source = data.channels[channel],
        output = new Float32Array(source.length);
      const state = rnnoise.createDenoiseState(),
        frame = new Float32Array(size);
      const frames = Math.ceil(source.length / size);
      try {
        for (let f = 0; f <= frames; f++) {
          for (let j = 0; j < size; j++) frame[j] = (source[f * size + j] ?? 0) * 32768;
          state.processFrame(frame);
          if (f > 0)
            for (let j = 0; j < size && (f - 1) * size + j < output.length; j++)
              output[(f - 1) * size + j] = frame[j] / 32768;
          if (f % 100 === 0)
            self.postMessage({
              type: 'progress',
              value: Math.round(((channel + f / (frames + 1)) / data.channels.length) * 100),
            });
        }
      } finally {
        state.destroy();
      }
      outputs.push(output);
    }
    self.postMessage(
      { type: 'result', channels: outputs },
      outputs.map((c) => c.buffer),
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Falha no modelo de voz.',
    });
  }
};

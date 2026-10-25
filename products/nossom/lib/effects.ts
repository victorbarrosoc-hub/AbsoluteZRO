export const effectPresets = [
  {
    id: 'none',
    label: 'Sem efeito',
    description: 'Som da versão de origem, sem coloração.',
    mix: 0,
  },
  {
    id: 'room',
    label: 'Sala de estúdio',
    description: 'Reflexões curtas e discretas para dar espaço à voz.',
    mix: 20,
  },
  {
    id: 'chapel',
    label: 'Capela',
    description: 'Ambiente íntimo, com reflexões suaves e cauda de 1,3 s.',
    mix: 30,
  },
  {
    id: 'church',
    label: 'Igreja',
    description: 'Reverberação ampla e difusa, com cauda de 4,2 s.',
    mix: 40,
  },
  {
    id: 'hall',
    label: 'Auditório',
    description: 'Espaço de apresentação, com profundidade e cauda de 2,2 s.',
    mix: 30,
  },
  {
    id: 'radio-am',
    label: 'Rádio vintage',
    description: 'Faixa estreita e voz compacta, como em um rádio AM.',
    mix: 100,
  },
  {
    id: 'radio-fm',
    label: 'Rádio FM',
    description: 'Voz próxima, comprimida e com graves controlados.',
    mix: 100,
  },
  {
    id: 'telephone',
    label: 'Telefone',
    description: 'Voz mono com faixa de 300 a 3.400 Hz.',
    mix: 100,
  },
] as const;
export type EffectId = (typeof effectPresets)[number]['id'];
export const isEffectId = (value: unknown): value is EffectId =>
  effectPresets.some((p) => p.id === value);

function biquad(input: Float32Array, rate: number, frequency: number, highpass: boolean) {
  const w = (2 * Math.PI * frequency) / rate,
    c = Math.cos(w),
    s = Math.sin(w),
    alpha = s / Math.SQRT2,
    a0 = 1 + alpha;
  const b0 = (highpass ? 1 + c : 1 - c) / (2 * a0),
    b1 = (highpass ? -(1 + c) : 1 - c) / a0,
    b2 = b0,
    a1 = (-2 * c) / a0,
    a2 = (1 - alpha) / a0;
  const out = new Float32Array(input.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = b0 * input[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = input[i];
    y2 = y1;
    y1 = y;
  }
  return out;
}
function reverb(input: Float32Array, rate: number, decay: number, channel: number) {
  const predelay = Math.round(rate * (decay > 3 ? 0.035 : 0.016));
  const output = new Float32Array(input.length + Math.ceil(rate * (decay + 0.1)));
  // Parallel damped combs, followed by serial all-pass diffusers (Schroeder network).
  for (const milliseconds of [29.7, 37.1, 41.1, 43.7, 53.3, 61.7]) {
    const delay = Math.round((rate * (milliseconds + channel * 0.7)) / 1000),
      feedback = 10 ** ((-3 * delay) / (rate * decay)),
      line = new Float32Array(delay);
    let low = 0;
    for (let i = 0, at = 0; i < output.length; i++, at = (at + 1) % delay) {
      const tap = line[at];
      low = tap * 0.55 + low * 0.45;
      line[at] = (input[i - predelay] ?? 0) + low * feedback;
      output[i] += tap / 6;
    }
  }
  for (const milliseconds of [5, 1.7, 0.6]) {
    const delay = Math.max(1, Math.round((rate * milliseconds) / 1000)),
      line = new Float32Array(delay);
    for (let i = 0, at = 0; i < output.length; i++, at = (at + 1) % delay) {
      const value = output[i],
        tap = line[at];
      output[i] = tap - value * 0.5;
      line[at] = value + output[i] * 0.5;
    }
  }
  return output;
}

/** Deterministic float render. Original channels are never mutated; 0% is an exact bypass. */
export function renderEffect(
  channels: Float32Array[],
  rate: number,
  effect: EffectId,
  intensity: number,
) {
  if (!isEffectId(effect)) throw new Error('Escolha um efeito disponível.');
  const wet = Number.isFinite(intensity) ? Math.max(0, Math.min(100, intensity)) / 100 : 0;
  if (!channels.length || channels.some((c) => c.length !== channels[0].length))
    throw new Error('Os canais do efeito não correspondem ao áudio.');
  if (!Number.isFinite(rate) || rate < 8000) throw new Error('Taxa de amostragem inválida.');
  if (effect === 'none' || wet === 0)
    return { channels: channels.map((c) => c.slice()), tailSeconds: 0 };
  const decay = ({ room: 0.35, chapel: 1.3, church: 4.2, hall: 2.2 } as Record<string, number>)[
    effect
  ];
  const mono =
    effect === 'telephone'
      ? Float32Array.from(
          channels[0],
          (_, i) => channels.reduce((sum, c) => sum + c[i], 0) / channels.length,
        )
      : null;
  const output = channels.map((source, c) => {
    let treated: Float32Array;
    if (decay) treated = reverb(source, rate, decay, c);
    else {
      const high = effect === 'telephone' ? 300 : effect === 'radio-am' ? 180 : 70,
        low = effect === 'telephone' ? 3400 : effect === 'radio-am' ? 4500 : 12000;
      treated = biquad(biquad(mono ?? source, rate, high, true), rate, low, false);
      if (effect !== 'telephone') {
        let envelope = 0;
        const attack = Math.exp(-1 / (rate * 0.003)),
          release = Math.exp(-1 / (rate * 0.12));
        for (let i = 0; i < treated.length; i++) {
          const value = Math.abs(treated[i]),
            response = value > envelope ? attack : release;
          envelope = response * envelope + (1 - response) * value;
          const gain = envelope > 0.15 ? (envelope / 0.15) ** (-2 / 3) : 1;
          treated[i] *= gain * 1.5;
        }
      }
    }
    return Float32Array.from(treated, (value, i) => (source[i] ?? 0) * (1 - wet) + value * wet);
  });
  return { channels: output, tailSeconds: (output[0].length - channels[0].length) / rate };
}

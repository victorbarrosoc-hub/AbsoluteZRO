import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreNatural } from '../lib/voice-restoration.mjs';

function voice(length = 12037) {
  return Float32Array.from(
    { length },
    (_, i) =>
      0.2 * Math.sin((2 * Math.PI * 220 * i) / 48000) +
      0.05 * Math.sin((2 * Math.PI * 730 * i) / 48000),
  );
}
test('spectral restoration at zero attenuation preserves samples, duration and both boundary impulses', () => {
  const input = voice();
  input[0] = 0.6;
  input[input.length - 1] = -0.5;
  const before = input.slice();
  const result = restoreNatural([input], [input.slice().fill(0)], {
    automatic: false,
    attenuation: 0,
  });
  assert.equal(result.channels[0].length, input.length);
  let error = 0;
  for (let i = 0; i < input.length; i++)
    error = Math.max(error, Math.abs(result.channels[0][i] - input[i]));
  assert.ok(error < 1e-6, `reconstruction error: ${error}`);
  assert.deepEqual(input, before);
});
test('one spectral gain preserves stereo balance even when the neural channel estimates differ', () => {
  const left = voice(),
    right = left.map((v) => v * 0.6);
  const result = restoreNatural(
    [left, right],
    [left.map((v) => v * 0.5), right.map((v) => v * 0.1)],
    { automatic: false, attenuation: 24 },
  );
  let error = 0;
  for (let i = 0; i < left.length; i++)
    error = Math.max(error, Math.abs(result.channels[1][i] - result.channels[0][i] * 0.6));
  assert.ok(error < 1e-7, `stereo balance error: ${error}`);
});
test('automatic restoration adapts to differing background levels and does not treat digital silence as a measured noise floor', () => {
  function sample(background: number) {
    return Float32Array.from({ length: 48000 }, (_, i) => {
      const level = i < 16000 ? background : 0.2;
      return level * Math.sin((2 * Math.PI * 300 * i) / 48000);
    });
  }
  const clean = sample(0.002),
    noisy = sample(0.06);
  const a = restoreNatural([clean], [clean.map((v) => v * 0.7)]).analysis;
  const b = restoreNatural([noisy], [noisy.map((v) => v * 0.7)]).analysis;
  assert.notEqual(a.attenuationDb, b.attenuationDb);
  assert.ok(a.maskExponent < b.maskExponent);
  const silent = restoreNatural([new Float32Array(4100)], [new Float32Array(4100)]);
  assert.equal(silent.analysis.noiseConfidence, 'uncertain');
  assert.ok(silent.channels[0].every((v) => v === 0));
  assert.ok(Number.isFinite(silent.analysis.gainCompensationDb));
});

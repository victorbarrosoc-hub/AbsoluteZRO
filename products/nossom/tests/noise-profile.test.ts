import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNoiseFloor } from '../lib/noise-profile';
import { treatmentFilter } from '../lib/presets';
test('noise estimate identifies quiet windows without treating continuous sound as a confident noise sample', () => {
  const audio = new Float32Array(48000 * 3);
  for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i * 0.1) * (i < 48000 ? 0.003 : 0.2);
  const result = estimateNoiseFloor(audio);
  assert.equal(result.confidence, 'estimated');
  assert.ok(result.floorDb >= -55 && result.floorDb <= -51);
  const continuous = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i * 0.1) * 0.2);
  assert.equal(estimateNoiseFloor(continuous).confidence, 'uncertain');
});
test('zero-strength processing is a bypass and invalid filter values remain bounded', () => {
  for (const operation of ['denoise', 'clarity', 'wind', 'level'] as const)
    assert.equal(treatmentFilter(operation, 0), 'anull');
  assert.ok(!treatmentFilter('clarity', NaN, -16, -1, { presence: Infinity }).includes('NaN'));
  assert.ok(
    !treatmentFilter('denoise', 100, -16, -1, { noiseReduction: Infinity }).includes('Infinity'),
  );
});

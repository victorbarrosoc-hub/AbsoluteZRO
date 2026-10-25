import test from 'node:test';
import assert from 'node:assert/strict';
import { effectPresets, renderEffect } from '../lib/effects';
import { deliveryPresets, treatmentFilter } from '../lib/presets';
import { encodeWav } from '../lib/audio';
import { validRecipe } from '../lib/saved-presets';
import { denseClipping } from '../lib/declip';

test('room effects have distinct decaying tails, do not truncate the input, and never mutate the original', () => {
  const input = new Float32Array(4800);
  input[0] = 0.5;
  input[4799] = 0.2;
  const before = input.slice();
  const chapel = renderEffect([input], 48000, 'chapel', 60).channels[0];
  const church = renderEffect([input], 48000, 'church', 60).channels[0];
  assert.ok(church.length > chapel.length && chapel.length > input.length);
  assert.ok(church.subarray(input.length).some((v) => Math.abs(v) > 0.0001));
  const energy = (a: Float32Array) => a.reduce((sum, v) => sum + v * v, 0);
  assert.ok(energy(church.subarray(-4800)) < energy(church.subarray(4800, 9600)) * 0.01);
  assert.deepEqual(input, before);
  for (const preset of effectPresets) {
    const bypass = renderEffect([input], 48000, preset.id, 0);
    assert.deepEqual(bypass.channels[0], input);
    assert.equal(bypass.tailSeconds, 0);
  }
});
test('telephone removes low/high frequencies, links the mono wet signal, and differs from dry audio', () => {
  function tone(frequency: number) {
    return Float32Array.from(
      { length: 48000 },
      (_, i) => 0.2 * Math.sin((2 * Math.PI * frequency * i) / 48000),
    );
  }
  const rms = (a: Float32Array) =>
    Math.sqrt(a.subarray(1000).reduce((s, v) => s + v * v, 0) / (a.length - 1000));
  const low = renderEffect([tone(80)], 48000, 'telephone', 100).channels[0];
  const middle = renderEffect([tone(1000)], 48000, 'telephone', 100).channels[0];
  const high = renderEffect([tone(12000)], 48000, 'telephone', 100).channels[0];
  assert.ok(rms(middle) > rms(low) * 8);
  assert.ok(rms(middle) > rms(high) * 8);
  const stereo = renderEffect([tone(800), tone(1200)], 48000, 'telephone', 100);
  assert.deepEqual(stereo.channels[0], stereo.channels[1]);
});
test('float intermediates retain reconstructed peaks above full scale instead of clipping them again', async () => {
  const samples = new Float32Array([1.2, -1.3, 0.25]);
  const buffer = {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate: 48000,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
  const view = new DataView(await encodeWav(buffer, true).arrayBuffer());
  assert.equal(view.getUint16(20, true), 3);
  assert.equal(view.getUint16(34, true), 32);
  assert.equal(view.getFloat32(44, true), samples[0]);
  assert.equal(view.getFloat32(48, true), samples[1]);
});
test('destination presets include online video, TV and isolated-dialogue references, and all can be saved', () => {
  for (const p of deliveryPresets) {
    assert.match(
      treatmentFilter('master', 100, p.lufs, p.peak),
      new RegExp(`I=${p.lufs}:TP=${p.peak}`),
    );
    assert.ok(
      validRecipe({
        id: p.id,
        name: p.label,
        operation: 'master',
        intensity: 100,
        mode: 'studio',
        target: p.lufs,
        peak: p.peak,
        musicGain: 0.2,
        settings: { masterPreset: p.id },
      }),
    );
  }
  for (const id of ['social', 'youtube', 'netflix-dialogue', 'ebu', 'atsc', 'podcast'])
    assert.ok(deliveryPresets.some((p) => p.id === id));
  assert.match(deliveryPresets.find((p) => p.id === 'netflix-dialogue')!.note, /diálogo isolado/);
});
test('dense saturation is distinguished from digital silence and naturally rounded peaks', () => {
  assert.equal(denseClipping([new Float32Array(4800)]).tooDense, false);
  const clean = Float32Array.from(
    { length: 4800 },
    (_, i) => 0.4 * Math.sin((2 * Math.PI * 170 * i) / 48000),
  );
  assert.equal(denseClipping([clean]).tooDense, false);
  assert.equal(denseClipping([clean.map((v) => Math.max(-0.1, Math.min(0.1, v)))]).tooDense, true);
});

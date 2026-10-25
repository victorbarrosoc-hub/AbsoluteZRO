import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPlan, treatmentFilter } from '../lib/presets';
import { validRecipe } from '../lib/saved-presets';
import { parseMeasurements, formatTime } from '../lib/audio';
test('assistant recognizes Portuguese intents but rejects unavailable operations', () => {
  assert.equal(
    inferPlan('Reduza o ruído do ar-condicionado preservando a naturalidade da voz'),
    'denoise',
  );
  assert.equal(inferPlan('Nivele os diálogos do podcast'), 'level');
  assert.equal(inferPlan('Aplique ducking automático na trilha durante as falas'), 'mix');
  assert.equal(inferPlan('Separe voz e instrumental'), null);
  assert.equal(inferPlan('Remova o eco da voz'), null);
  assert.equal(inferPlan('execute rm -rf /'), null);
});
test('measurements come from input of the post-render analysis, not loudnorm output estimates', () => {
  const result = parseMeasurements([
    '[noise]',
    '{"input_i":"-18.50", "input_tp":"-2.18", "input_lra":"4.10", "output_i":"-16.00"}',
  ]);
  assert.deepEqual(result, { lufs: -18.5, truePeak: -2.18, lra: 4.1 });
  assert.throws(() => parseMeasurements(['incomplete render']), /não retornou/);
  assert.deepEqual(parseMeasurements(['{"input_i":"-inf","input_tp":"-inf","input_lra":"0"}']), {
    lufs: null,
    truePeak: null,
    lra: 0,
  });
});
test('unsupported operation cannot silently become a fake processing result', () => {
  assert.throws(() => treatmentFilter('mix', 'balanced'), /duas faixas/);
  assert.equal(formatTime(125.6), '2:05');
  assert.equal(formatTime(Infinity), '0:00');
});
test('studio voice finishing is a fixed conservative chain ending in two-pass loudness', () => {
  const filter = treatmentFilter('master', 100, -16, -1, { masterPreset: 'studio-voice' });
  assert.match(filter, /^highpass=f=75:p=2,/);
  assert.match(filter, /equalizer=f=250:t=q:w=0\.9:g=-2\.50/);
  assert.match(filter, /deesser=i=0\.350/);
  assert.match(filter, /acompressor=threshold=0\.1:ratio=2\.50/);
  assert.match(filter, /loudnorm=I=-16:TP=-1:/);
  assert.match(
    treatmentFilter('master', 0, -19, -2, { masterPreset: 'studio-voice' }),
    /g=0\.00.*ratio=1\.00.*loudnorm=I=-19:TP=-2/,
  );
  const recipe = (masterPreset: string) => ({
    id: 'r1',
    name: 'Minha voz',
    operation: 'master',
    intensity: 100,
    mode: 'studio',
    target: -16,
    peak: -1,
    musicGain: 0.25,
    settings: { masterPreset },
  });
  assert.ok(validRecipe(recipe('studio-voice')));
  assert.ok(!validRecipe(recipe('adobe')));
});

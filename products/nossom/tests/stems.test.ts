import test from 'node:test';
import assert from 'node:assert/strict';
import { flatMix, mixLabel, mixPresets, stemGain, STEM_MIN_DB } from '../lib/stems';
import { presetOperation } from '../lib/studio-routes';

test('faders are in dB, the bottom and the mute are silence', () => {
  assert.equal(stemGain({ db: 0, muted: false }), 1);
  assert.ok(Math.abs(stemGain({ db: 6, muted: false }) - 1.995) < 0.001);
  assert.ok(Math.abs(stemGain({ db: -6, muted: false }) - 0.501) < 0.001);
  assert.equal(stemGain({ db: STEM_MIN_DB, muted: false }), 0);
  assert.equal(stemGain({ db: 3, muted: true }), 0);
  assert.equal(stemGain({ db: 40, muted: false }), stemGain({ db: 12, muted: false }));
});

test('versions are named by the preset they match or by what changed', () => {
  const preset = (id: string) => mixPresets.find((p) => p.id === id)!.settings();
  assert.equal(mixLabel(preset('instrumental')), 'Só instrumental');
  assert.equal(mixLabel(preset('acapella')), 'Só acapella');
  // Pulling the voice fader to the bottom is the same as muting it.
  const bottom = flatMix();
  bottom[0] = { db: STEM_MIN_DB, muted: false };
  assert.equal(mixLabel(bottom), 'Só instrumental');
  const custom = flatMix();
  custom[2] = { db: 6, muted: false };
  custom[1] = { db: -3, muted: false };
  custom[3] = { db: 0, muted: true };
  assert.equal(mixLabel(custom), 'Remix: Bateria −3 dB · Baixo +6 dB · Guitarra mudo');
  assert.equal(mixLabel(flatMix()), 'Remix sem mudanças');
});

test('a pending GPU job reopens in the tool that started it', () => {
  assert.equal(presetOperation('stems-v1'), 'remix');
  assert.equal(presetOperation('whisper-transcript-v1'), 'transcribe');
  assert.equal(presetOperation('voice-isolator-v1'), 'vocals');
  assert.equal(presetOperation('roformer-vocals-v1'), 'vocals');
  assert.equal(presetOperation('htdemucs-vocals-v1'), 'vocals');
  assert.equal(presetOperation('resemble-d-v1'), 'auto');
  assert.equal(presetOperation(undefined), 'auto');
});

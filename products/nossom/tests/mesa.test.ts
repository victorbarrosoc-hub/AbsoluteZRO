// A mesa de faixas (lib/mesa.ts): a cadeia segue a versão aberta até o original, cada faixa ganha o papel certo e o
// resumo da Z só usa números medidos.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bandasPresence, cadeia, nomeCurto, nomeDaFaixa, papel, resumoDaZ } from '../lib/mesa';
import type { Version } from '../lib/storage';

const v = (id: string, extra: Partial<Version> = {}): Version => ({
  id,
  label: id,
  createdAt: 0,
  blob: new Blob(),
  info: { duration: 10, channels: 1, sampleRate: 48000, peak: -3, clipped: 0, wave: [0.2] },
  metrics: { lufs: null, truePeak: null, lra: null },
  ...extra,
});

const original = v('o', { info: { ...v('x').info, noiseFloor: -48 } });
const z = v('z', {
  parentId: 'o',
  operation: 'auto',
  info: { ...v('x').info, noiseFloor: -66.4 },
  processing: { engine: 'x', strength: 100, noiseFloor: -66, mode: 'cloud' },
});
const presence = v('p', {
  parentId: 'z',
  operation: 'master',
  preset: 'Quasar Presence',
  info: { ...v('x').info, noiseFloor: -66 },
  metrics: { lufs: -14.04, truePeak: -3.02, lra: 4 },
});
const eq = v('e', { parentId: 'o', operation: 'eq', preset: 'EQ: Quente' });

test('a cadeia vai do original até a versão aberta, sem os ramos ao lado', () => {
  const todas = [original, z, eq, presence];
  assert.deepEqual(
    cadeia(todas, 'p').map((x) => x.id),
    ['o', 'z', 'p'],
  );
  assert.deepEqual(
    cadeia(todas, 'e').map((x) => x.id),
    ['o', 'e'],
  );
  assert.deepEqual(
    cadeia(todas, 'o').map((x) => x.id),
    ['o'],
  );
  // ciclo por dado corrompido não trava
  const a = v('a', { parentId: 'b' }),
    b = v('b', { parentId: 'a' });
  assert.deepEqual(
    cadeia([original, a, b], 'a').map((x) => x.id),
    ['o', 'b', 'a'],
  );
});

test('cada faixa ganha o papel e o nome certos', () => {
  assert.equal(papel(original, 0), 'original');
  assert.equal(papel(z, 1), 'z');
  assert.equal(papel(presence, 2), 'presence');
  assert.equal(papel(eq, 1), 'ajuste');
  assert.equal(nomeDaFaixa(z, 1), 'Z · voz limpa');
  assert.equal(
    nomeDaFaixa({ ...z, processing: { ...z.processing!, iaAvancada: true } }, 1),
    'Z avançada',
  );
  assert.equal(nomeDaFaixa(presence, 2), 'Quasar Presence');
  assert.equal(nomeDaFaixa(eq, 1), 'EQ: Quente');
  assert.deepEqual(
    [nomeCurto(original, 0), nomeCurto(z, 1), nomeCurto(presence, 2), nomeCurto(eq, 1)],
    ['Original', 'Z', 'Presence', 'EQ'],
  );
});

test('o resumo da Z fala só do que foi medido', () => {
  const r = resumoDaZ([original, z, presence])!;
  assert.equal(r.frase, 'Limpei o fundo e deixei sua voz mais presente.');
  assert.deepEqual(r.chips, ['Fundo −18 dB', '−14 LUFS', 'Pico −3 dBTP']);
  const semMedida = resumoDaZ([original, z])!;
  assert.equal(semMedida.frase, 'Limpei o fundo da sua voz.');
  assert.deepEqual(semMedida.chips, ['Fundo −18,4 dB']);
  assert.equal(resumoDaZ([original]), null);
});

test('as quatro bandas da Quasar Presence seguem os cortes da receita', () => {
  const b = bandasPresence();
  assert.deepEqual(
    b.map((x) => x.nome),
    ['Graves', 'Corpo', 'Voz', 'Brilho'],
  );
  assert.equal(b[0].faixa, 'até 137 Hz');
  assert.equal(b[3].faixa, 'acima de 6,9 kHz');
  assert.equal(b[0].threshold, -20.2);
});

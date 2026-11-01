// O Quasar como IA (lib/quasar-ia.ts): a onda corre pela borda o tempo todo, pensando ela cresce e acelera, a chegada
// acende em 1,4 s e reduzir movimento fica na pose da logo, já acesa.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOV_QUASAR, MotorQuasar, RITMOS, raioQuasar } from '../lib/quasar-ia';

const rodar = (m: MotorQuasar, s: number, dt = 1 / 30) => {
  for (let t = 0; t < s; t += dt) m.passo(dt);
};

test('a onda corre pela borda e a chegada acende', () => {
  const m = new MotorQuasar();
  const fase = m.fase;
  rodar(m, 1);
  assert.ok(m.fase > fase, 'a onda andou');
  assert.ok(m.entrada < 1);
  rodar(m, MOV_QUASAR.entrada);
  assert.equal(m.entrada, 1);
});

test('pensando, a onda cresce e acelera; ao parar, volta ao repouso', () => {
  const m = new MotorQuasar();
  rodar(m, 2);
  const f0 = m.fase;
  rodar(m, 1);
  const repouso = m.fase - f0;
  m.mudar('thinking');
  rodar(m, 3);
  const f1 = m.fase;
  rodar(m, 1);
  assert.ok(m.fase - f1 > repouso * 2, 'acelerou');
  assert.ok(m.amp > RITMOS.idle.amp * 1.4, `cresceu: ${m.amp}`);
  m.mudar('idle');
  rodar(m, 4);
  assert.ok(Math.abs(m.amp - RITMOS.idle.amp) < 0.05, `voltou: ${m.amp}`);
});

test('estático (reduzir movimento) é a pose da logo, já acesa', () => {
  const m = new MotorQuasar();
  rodar(m, 2);
  m.estatico();
  assert.equal(m.fase, 0.6);
  assert.equal(m.entrada, 1);
});

test('o anel cabe na altura e deixa espaço para o feixe à direita', () => {
  assert.equal(raioQuasar(760, 400), 132);
  assert.ok(raioQuasar(358, 300) * 2 < 358 / 1.7);
});

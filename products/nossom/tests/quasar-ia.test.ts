// O Quasar como IA (lib/quasar-ia.ts): parado, o clarão espera na pose da logo, dá uma volta e volta à pose; pensando,
// gira sem pausa; ao parar de pensar, freia até a pose; reduzir movimento fica na pose.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOV_QUASAR, MotorQuasar } from '../lib/quasar-ia';

const rodar = (m: MotorQuasar, s: number, dt = 1 / 30) => {
  for (let t = 0; t < s; t += dt) m.passo(dt);
};

test('em repouso: pausa na pose da logo, uma volta inteira e de volta à pose', () => {
  const m = new MotorQuasar();
  rodar(m, MOV_QUASAR.pausa - 0.2);
  assert.equal(m.theta, 0);
  rodar(m, 0.2 + MOV_QUASAR.volta / 2);
  assert.ok(m.theta > 1 && m.theta < 2 * Math.PI - 1, `no meio da volta: ${m.theta}`);
  rodar(m, MOV_QUASAR.volta / 2 + 0.1);
  assert.ok(Math.abs(m.theta) < 1e-6, `voltou à pose: ${m.theta}`);
});

test('pensando gira sem pausa e, ao parar, freia até a pose', () => {
  const m = new MotorQuasar();
  m.mudar('thinking');
  rodar(m, 1);
  const a = m.theta;
  rodar(m, 0.5);
  assert.ok(m.theta > a + 1, 'continua girando');
  m.mudar('idle');
  rodar(m, 3.5);
  assert.ok(Math.abs(m.theta) < 1e-6, `parou na pose: ${m.theta}`);
});

test('estático (reduzir movimento) é a pose da logo, já acesa', () => {
  const m = new MotorQuasar();
  m.mudar('thinking');
  rodar(m, 2);
  m.estatico();
  assert.equal(m.theta, 0);
  assert.equal(m.entrada, 1);
});

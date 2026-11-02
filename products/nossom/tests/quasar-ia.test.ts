// O Quasar como IA (lib/quasar-ia.ts): a onda corre pela borda o tempo todo, pensando ela cresce e acelera, a chegada
// acende em 1,4 s e reduzir movimento fica na pose da logo, já acesa.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOV_QUASAR, MotorQuasar, RITMOS, misturar, raioQuasar } from '../lib/quasar-ia';

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

test('opção 2 da cor: a Z pensando leva a Coroa ao violeta e ela volta ao azul', () => {
  assert.equal(misturar([0, 100, 200], [100, 0, 200], 0), '0,100,200');
  assert.equal(misturar([0, 100, 200], [100, 0, 200], 0.5), '50,50,200');
  assert.equal(misturar([0, 100, 200], [100, 0, 200], 3), '100,0,200');
  const m = new MotorQuasar();
  rodar(m, 1);
  assert.equal(m.violeta, 0, 'em repouso é azul');
  m.mudar('working');
  rodar(m, 3);
  assert.equal(m.violeta, 0, 'trabalho local continua azul');
  m.mudar('thinking');
  rodar(m, 0.3);
  assert.ok(m.violeta > 0.2 && m.violeta < 0.9, `transição suave: ${m.violeta}`);
  rodar(m, 3);
  assert.ok(m.violeta > 0.99, 'a Z pensando é violeta');
  m.mudar('idle');
  rodar(m, 3);
  assert.ok(m.violeta < 0.01, 'volta ao azul');
  m.mudar('thinking');
  m.estatico();
  assert.equal(m.violeta, 1, 'reduzir movimento: já no violeta, sem transição');
});

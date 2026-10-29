// A família Absolute ZRO no menu do estúdio: o Maestro entra no lançamento em Beta grátis, atrás de uma chave só
// (MAESTRO_NA_FAMILIA, virada por scripts/lancamento-maestro.mjs na raiz), com o ícone dele em public/familia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../components/family-nav.tsx', import.meta.url), 'utf8');

test('o Maestro tem chave única, link oficial e ícone próprio', () => {
  assert.match(fonte, /^const MAESTRO_NA_FAMILIA = (true|false);$/m);
  assert.match(
    fonte,
    /\.\.\.\(MAESTRO_NA_FAMILIA\s+\? \[\{ href: 'https:\/\/maestro\.absolutezro\.com', name: 'Maestro', icon: '\/familia\/maestro\.svg' \}\]\s+: \[\]\)/,
  );
  assert.ok(existsSync(new URL('../public/familia/maestro.svg', import.meta.url)));
});

test('cada ícone da família existe em public/', () => {
  for (const [, icone] of fonte.matchAll(/icon: '([^']+)'/g)) {
    assert.ok(existsSync(new URL(`../public${icone}`, import.meta.url)), icone);
  }
});

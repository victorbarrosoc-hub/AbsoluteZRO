// A mixagem (lib/mixagem.ts): voz manda na duração; a trilha abaixa com a voz; cada efeito entra no seu segundo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filtroMixagem } from '../lib/mixagem';

const fim = 'alimiter=limit=0.8913';

test('só a trilha: o mesmo grafo de antes, com a trilha abaixando sob a voz', () => {
  const f = filtroMixagem({ trilha: true, ganhoTrilha: 0.25, forca: 100, efeitos: [], fim });
  assert.match(f, /^\[0:a\]asplit=2\[voz\]\[lado\];\[1:a\]volume=0\.25\[trilha\]/);
  assert.match(f, /sidechaincompress=threshold=0\.02:ratio=16\.00/);
  assert.match(f, /\[voz\]\[abaixada\]amix=inputs=2:duration=first:normalize=0,alimiter/);
  assert.ok(f.endsWith('[out]'));
});

test('trilha e efeitos: cada efeito vem depois da trilha e entra no seu ponto', () => {
  const f = filtroMixagem({
    trilha: true,
    forca: 50,
    efeitos: [{ em: 1.25 }, { em: 0, ganho: 1.5 }],
    fim,
  });
  assert.match(f, /\[2:a\]adelay=delays=1250:all=1,volume=0\.8\[efeito0\]/);
  assert.match(f, /\[3:a\]adelay=delays=0:all=1,volume=1\.5\[efeito1\]/);
  assert.match(f, /\[voz\]\[abaixada\]\[efeito0\]\[efeito1\]amix=inputs=4/);
});

test('só efeitos: sem trilha, a voz passa direto e os efeitos começam na entrada 1', () => {
  const f = filtroMixagem({ trilha: false, forca: 100, efeitos: [{ em: -3, ganho: 9 }], fim });
  assert.match(f, /^\[0:a\]anull\[voz\];\[1:a\]adelay=delays=0:all=1,volume=2\[efeito0\]/);
  assert.match(f, /\[voz\]\[efeito0\]amix=inputs=2/);
});

test('sem trilha nem efeito não há mixagem', () => {
  assert.throws(
    () => filtroMixagem({ trilha: false, forca: 0, efeitos: [], fim }),
    /trilha ou um efeito/,
  );
});

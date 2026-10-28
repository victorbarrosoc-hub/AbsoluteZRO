import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { installerPath } from '../lib/desktop-releases';

// Fechado ao público (28/10/2026): public/instalar.sh (o que o site serve) só avisa e sai com erro; o instalador de
// verdade (sem a quarentena do navegador; o xattr depois falha nas versões novas do macOS sem a permissão de
// Gerenciamento de Apps) fica guardado em scripts/instalar-mac.sh, fora do site, até o produto abrir.
const root = new URL('..', import.meta.url);
const stub = readFileSync(new URL('../public/instalar.sh', import.meta.url), 'utf8');
const script = readFileSync(new URL('../scripts/instalar-mac.sh', import.meta.url), 'utf8');

test('instalar.sh servido: sintaxe válida, tudo dentro de main, só a mensagem e exit 1', () => {
  execFileSync('sh', ['-n', 'public/instalar.sh'], { cwd: root });
  assert.match(stub.trimEnd(), /\nmain "\$@"$/);
  assert.match(stub, /em desenvolvimento/i);
  assert.match(stub, /exit 1/);
  // Fora dos comentários, nenhum comando que baixe ou instale.
  const code = stub
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(code, /curl|hdiutil|\/baixar\/|github\.com|ditto|codesign|xattr/);
  // Rodando de verdade: nada baixado, nada instalado, saída de erro.
  assert.throws(
    () => execFileSync('sh', ['public/instalar.sh'], { cwd: root, stdio: 'pipe' }),
    (error: { status?: number; stdout?: Buffer }) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stdout), /Nada foi baixado nem instalado/);
      return true;
    },
  );
});

test('instalador guardado: sintaxe de sh válida e tudo dentro de main', () => {
  execFileSync('sh', ['-n', 'scripts/instalar-mac.sh'], { cwd: root });
  assert.match(script.trimEnd(), /\nmain "\$@"$/);
});

test('instalador guardado: baixa pelas rotas do próprio site, nunca do github.com', () => {
  assert.ok(script.includes(`$SITE${installerPath('macArm64').replace('mac-arm64', '$ARQ')}`));
  assert.match(script, /ARQ="mac-arm64"/);
  assert.match(script, /ARQ="mac-x64"/);
  assert.doesNotMatch(script, /github\.com/);
});

test('instalador guardado: confere a imagem, recusa o "indisponível" e refaz a assinatura local se precisar', () => {
  assert.match(script, /hdiutil verify/);
  assert.match(script, /\*indisponivel\*\)/);
  assert.match(script, /codesign --force --deep --sign -/);
  assert.match(script, /DEST="\/Applications\/NOSSOM\.app"/);
});

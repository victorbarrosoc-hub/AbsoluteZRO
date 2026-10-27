import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { installerPath } from '../lib/desktop-releases';

// public/instalar.sh: instala o NOSSOM no Mac pelo Terminal, sem a quarentena do navegador (o xattr depois falha nas
// versões novas do macOS sem a permissão de Gerenciamento de Apps).
const script = readFileSync(new URL('../public/instalar.sh', import.meta.url), 'utf8');

test('instalar.sh: sintaxe de sh válida e tudo dentro de main', () => {
  execFileSync('sh', ['-n', 'public/instalar.sh'], { cwd: new URL('..', import.meta.url) });
  assert.match(script.trimEnd(), /\nmain "\$@"$/);
});

test('instalar.sh: baixa pelas rotas do próprio site, nunca do github.com', () => {
  assert.ok(script.includes(`$SITE${installerPath('macArm64').replace('mac-arm64', '$ARQ')}`));
  assert.match(script, /ARQ="mac-arm64"/);
  assert.match(script, /ARQ="mac-x64"/);
  assert.doesNotMatch(script, /github\.com/);
});

test('instalar.sh: confere a imagem, recusa o "indisponível" e refaz a assinatura local se precisar', () => {
  assert.match(script, /hdiutil verify/);
  assert.match(script, /\*indisponivel\*\)/);
  assert.match(script, /codesign --force --deep --sign -/);
  assert.match(script, /DEST="\/Applications\/NOSSOM\.app"/);
});

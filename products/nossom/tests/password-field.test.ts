import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasswordField } from '../components/password-field';

test('campo de senha: olho é botão comum com rótulo e aria-pressed, autocomplete preservado', () => {
  const html = renderToStaticMarkup(
    createElement(PasswordField, {
      id: 'nova',
      name: 'password',
      autoComplete: 'new-password',
      minLength: 8,
    }),
  );
  assert.match(html, /<input[^>]*type="password"/);
  assert.match(html, /autoComplete="new-password"/);
  assert.match(html, /minLength="8"/);
  assert.match(html, /<button type="button" class="account-password-toggle"/);
  assert.match(html, /aria-label="Mostrar senha"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-controls="nova"/);
  assert.doesNotMatch(html, /type="submit"/);
});

test('nenhum campo de senha da interface sem o olho', () => {
  const dir = path.join(import.meta.dirname, '..', 'components');
  const soltos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && f !== 'password-field.tsx')
    .filter((f) =>
      /type=\{?["'][^"']*password|'password'\s*\}|: 'password'/.test(
        fs.readFileSync(path.join(dir, f), 'utf8'),
      ),
    );
  assert.deepEqual(soltos, []);
});

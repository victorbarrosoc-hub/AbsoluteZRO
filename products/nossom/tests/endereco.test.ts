// O endereço antigo (nossom.absolutezro.com) leva ao novo (quasar.absolutezro.com) com o mesmo caminho, de vez (308).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../next.config';

test('nossom.absolutezro.com redireciona para quasar.absolutezro.com mantendo o caminho', async () => {
  const regras = (await config.redirects?.()) ?? [];
  const antigo = regras.find((r) =>
    r.has?.some((h) => h.type === 'host' && h.value === 'nossom.absolutezro.com'),
  );
  assert.ok(antigo, 'falta a regra do endereço antigo');
  assert.equal(antigo.source, '/:path*');
  assert.equal(antigo.destination, 'https://quasar.absolutezro.com/:path*');
  assert.equal(antigo.permanent, true);
  // nenhuma regra mexe no endereço novo nem no do aplicativo de computador
  for (const r of regras) {
    assert.ok(r.has?.length, 'regra sem condição de endereço redirecionaria tudo');
    assert.ok(
      !r.has.some(
        (h) =>
          h.type === 'host' &&
          /quasar\.absolutezro\.com|nossom-teal\.vercel\.app/.test(h.value ?? ''),
      ),
    );
  }
});

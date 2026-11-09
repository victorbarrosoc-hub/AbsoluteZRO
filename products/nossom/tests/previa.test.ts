/**
 * Prévia do titular no team grátis (lib/server/previa.ts, decisão de 09/11/2026): sem ZRO_CHAVE_PREVIA nada muda; com
 * ela, só quem abre /previa com a chave certa vê a interface (cookie com o HMAC, nunca a chave). O resto, o fechado de
 * sempre.
 */
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import {
  chaveConfere,
  chavePrevia,
  CONTA_PREVIA,
  emPrevia,
  iguais,
  PREVIA_COOKIE,
  selo,
} from '../lib/server/previa';

const SITE = 'https://quasar.test';
const CHAVE = 'uma-frase-longa-so-do-titular-para-a-previa';
const VARS = [
  'ZRO_CHAVE_PREVIA',
  'RELEASE',
  'NOSSOM_AUTH_SECRET',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
];
let antes: Record<string, string | undefined>;

beforeEach(() => {
  antes = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
});
afterEach(() => {
  for (const k of VARS) {
    if (antes[k] === undefined) delete process.env[k];
    else process.env[k] = antes[k];
  }
});

const pedido = (
  caminho: string,
  { cookie, method = 'GET' }: { cookie?: string; method?: string } = {},
) => new NextRequest(`${SITE}${caminho}`, { method, headers: cookie ? { cookie } : {} });

test('sem a variável (projeto oficial): /previa segue como antes e o fechado não muda', async () => {
  assert.equal(chavePrevia(), null);
  const r = await proxy(pedido(`/previa?chave=${CHAVE}`));
  assert.equal(r.headers.get('x-middleware-next'), '1');
  assert.equal(r.headers.get('set-cookie'), null);
  // estúdio e páginas fechados: Absolute ZRO, mesmo com um cookie de prévia qualquer
  const s = await proxy(pedido('/studio', { cookie: `${PREVIA_COOKIE}=${await selo(CHAVE)}` }));
  assert.equal(s.status, 307);
  assert.equal(s.headers.get('location'), 'https://absolutezro.com/');
});

test('chave curta desliga a porta', async () => {
  process.env.ZRO_CHAVE_PREVIA = 'curta-demais';
  assert.equal(chavePrevia(), null);
  assert.equal(chaveConfere('curta-demais'), false);
  const r = await proxy(pedido('/previa?chave=curta-demais'));
  assert.equal(r.headers.get('set-cookie'), null);
});

test('chave errada: o mesmo de qualquer página fechada, sem cookie nem pista', async () => {
  process.env.ZRO_CHAVE_PREVIA = CHAVE;
  const r = await proxy(pedido('/previa?chave=errada'));
  assert.equal(r.status, 307);
  assert.equal(r.headers.get('location'), 'https://absolutezro.com/');
  assert.equal(r.headers.get('set-cookie'), null);
});

test('chave certa: 303 para o estúdio, cookie com o HMAC (sem a chave), HttpOnly, Secure, 30 dias', async () => {
  process.env.ZRO_CHAVE_PREVIA = CHAVE;
  const r = await proxy(pedido(`/previa?chave=${encodeURIComponent(CHAVE)}`));
  assert.equal(r.status, 303);
  assert.equal(new URL(r.headers.get('location')!).pathname, '/studio');
  const c = r.headers.get('set-cookie')!;
  assert.match(
    c,
    new RegExp(
      `^${PREVIA_COOKIE}=[A-Za-z0-9_-]+; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$`,
    ),
  );
  assert.ok(!c.includes(CHAVE));
  assert.equal(c.split(';')[0].split('=')[1], await selo(CHAVE));
});

test('o cookie da prévia abre páginas e estúdio; as APIs dizem "indisponível nesta prévia"; Sair apaga', async () => {
  process.env.ZRO_CHAVE_PREVIA = CHAVE;
  const cookie = `${PREVIA_COOKIE}=${await selo(CHAVE)}`;
  assert.equal(await emPrevia(await selo(CHAVE)), true);
  for (const c of ['/', '/studio', '/studio/inicio', '/entrar']) {
    const r = await proxy(pedido(c, { cookie }));
    assert.equal(r.headers.get('x-middleware-next'), '1', c);
  }
  const api = await proxy(pedido('/api/usage', { cookie }));
  assert.equal(api.status, 503);
  assert.deepEqual(await api.json(), { error: 'Indisponível nesta prévia.', code: 'previa' });
  const sair = await proxy(pedido('/api/account', { cookie, method: 'DELETE' }));
  assert.equal(sair.status, 200);
  assert.match(
    sair.headers.get('set-cookie')!,
    new RegExp(`^${PREVIA_COOKIE}=; Path=/; Max-Age=0`),
  );
});

test('cookie forjado ou de outra chave não abre nada', async () => {
  process.env.ZRO_CHAVE_PREVIA = CHAVE;
  for (const v of ['abc', await selo('outra-chave-longa-de-outra-pessoa-xyz'), CHAVE]) {
    assert.equal(await emPrevia(v), false);
    const r = await proxy(pedido('/studio', { cookie: `${PREVIA_COOKIE}=${v}` }));
    assert.equal(r.status, 307, v);
    assert.equal(r.headers.get('location'), 'https://absolutezro.com/');
  }
  assert.equal(iguais('a', 'a'), true);
  assert.equal(iguais('a', 'ab'), false);
});

test('a conta de prévia serve ao armazenamento local do estúdio (id em forma de UUID) e não é admin', () => {
  assert.match(CONTA_PREVIA.id, /^[a-f0-9-]{36}$/);
  assert.equal(CONTA_PREVIA.isAdmin, false);
  assert.equal(CONTA_PREVIA.zroBlocked, undefined);
});

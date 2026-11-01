/**
 * Ponte com o AEON (lib/server/irmaos.ts): o AEON pede a separação de faixas pelo navegador da mesma pessoa. O pré-voo
 * do CORS só responde para a origem irmã e nos caminhos dela; as respostas levam o CORS com credenciais (nunca "*");
 * a origem irmã só pode pedir stems-v1; uma origem qualquer continua recusada; e o portão de lançamento vale igual
 * (fechado, o 403 chega ao AEON com CORS para ele poder dizer "a NOSSOM ainda não abriu").
 */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { POST } from '../app/api/audio/jobs/route';
import { cabecalhosIrmao, origemIrma, preVoo } from '../lib/server/irmaos';
import { resetRequestLimits } from '../lib/server/ai-access';
import { authEnvironment, testCookie, testUser } from './helpers/auth';

const AEON = 'https://aeon.absolutezro.com';
const SITE = 'https://nossom.test';

beforeEach(resetRequestLimits);

test('origem irmã: só o AEON, exato; o CORS nunca é "*"', () => {
  const com = (origin?: string) =>
    new Request(SITE + '/api/audio/jobs', { headers: origin ? { origin } : {} });
  assert.equal(origemIrma(com(AEON)), AEON);
  for (const outra of [
    'https://aeon.absolutezro.com.evil.test',
    'http://aeon.absolutezro.com',
    'https://evil.test',
    'null',
    undefined,
  ])
    assert.equal(origemIrma(com(outra)), null, String(outra));
  assert.deepEqual(cabecalhosIrmao(AEON), {
    'Access-Control-Allow-Origin': AEON,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });
});

test('pré-voo: 204 para o AEON nos caminhos dele; 403 sem CORS para o resto', () => {
  const pre = (path: string, origin: string) =>
    preVoo(new Request(SITE + path, { method: 'OPTIONS', headers: { origin } }), path);
  for (const [path, metodos] of [
    ['/api/audio/jobs', 'GET, POST'],
    ['/api/usage', 'GET'],
    ['/api/account', 'GET'],
  ]) {
    const r = pre(path, AEON);
    assert.equal(r.status, 204, path);
    assert.equal(r.headers.get('access-control-allow-origin'), AEON);
    assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(r.headers.get('access-control-allow-methods'), metodos, path);
  }
  for (const [path, origin] of [
    ['/api/admin', AEON],
    ['/api/subscription', AEON],
    ['/api/audio/jobs', 'https://evil.test'],
  ]) {
    const r = pre(path, origin);
    assert.equal(r.status, 403, `${path} ${origin}`);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
});

test('proxy: o pré-voo responde sem sessão; fechado, o 403 chega ao AEON com CORS; a outra origem não ganha CORS', async () => {
  const restore = authEnvironment('closed');
  try {
    const opcoes = await proxy(
      new NextRequest(SITE + '/api/audio/jobs', { method: 'OPTIONS', headers: { origin: AEON } }),
    );
    assert.equal(opcoes.status, 204);
    const fechado = await proxy(
      new NextRequest(SITE + '/api/audio/jobs', { headers: { origin: AEON } }),
    );
    assert.equal(fechado.status, 403);
    assert.equal((await fechado.json()).code, 'product_closed');
    assert.equal(fechado.headers.get('access-control-allow-origin'), AEON);
    const estranho = await proxy(
      new NextRequest(SITE + '/api/audio/jobs', { headers: { origin: 'https://evil.test' } }),
    );
    assert.equal(estranho.status, 403);
    assert.equal(estranho.headers.get('access-control-allow-origin'), null);
    // fora dos caminhos do irmão, nem a origem do AEON ganha CORS
    const planos = await proxy(new NextRequest(SITE + '/api/plans', { headers: { origin: AEON } }));
    assert.equal(planos.headers.get('access-control-allow-origin'), null);
  } finally {
    restore();
  }
});

test('pedido do AEON: prepara e separa faixas (stems-v1); qualquer outro tratamento é recusado; outra origem, 403', async () => {
  const restore = authEnvironment();
  const before = globalThis.fetch;
  const keys = ['RUNPOD_API_KEY', 'RUNPOD_ENDPOINT_ID', 'SUPABASE_SERVICE_ROLE_KEY'];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.RUNPOD_API_KEY = 'private-runpod-test';
  process.env.RUNPOD_ENDPOINT_ID = 'endpoint-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-storage-test';
  let job: any = null;
  let dispatches = 0;
  let preset = '';
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/auth/v1/user')) return Response.json(testUser);
    if (url.endsWith('/rpc/nossom_plan_usage'))
      return Response.json({ allowed: true, used: 0, remaining: 600 });
    if (url.endsWith('/rpc/nossom_restoration_job')) {
      if (body.p_action === 'prepare')
        job = { id: body.p_id, user_id: body.p_user, status: 'uploading', ...body.p_data };
      let claimed = false;
      if (body.p_action === 'claim' && job.status === 'uploading') {
        job.status = 'submitting';
        claimed = true;
      }
      if (body.p_action === 'update') Object.assign(job, body.p_data);
      if (body.p_action === 'fail') job.status = 'failed';
      return Response.json({ job, claimed });
    }
    if (url.includes('/storage/v1/object/upload/sign/'))
      return Response.json({
        url: new URL(url).pathname.replace('/storage/v1', '') + '?token=write-test',
      });
    if (url.includes('/storage/v1/object/sign/'))
      return Response.json({
        signedURL: new URL(url).pathname.replace('/storage/v1', '') + '?token=read-test',
      });
    if (url.endsWith('/run')) {
      dispatches++;
      preset = body.input.preset;
      return Response.json({ id: 'provider-job-test' });
    }
    if (url.includes('/status/')) return Response.json({ status: 'IN_QUEUE' });
    throw new Error('Unexpected network call: ' + new URL(url).pathname);
  };
  const pedido = (body: unknown, origin = AEON) =>
    new Request('http://localhost/api/audio/jobs', {
      method: 'POST',
      headers: { cookie: testCookie(), origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (
        await POST(
          pedido({ action: 'prepare', bytes: 1_000_000, duration: 5 }, 'https://evil.test'),
        )
      ).status,
      403,
    );
    const pronto = await POST(pedido({ action: 'prepare', bytes: 1_000_000, duration: 5 }));
    assert.equal(pronto.status, 200);
    const { id } = await pronto.json();
    // restauração, isolar voz, transcrição: não por este caminho (nada despacha)
    for (const outro of [
      'resemble-d-v1',
      'roformer-vocals-v1',
      'whisper-transcript-v1',
      undefined,
    ]) {
      const r = await POST(pedido({ action: 'submit', id, ...(outro ? { preset: outro } : {}) }));
      assert.ok([400, 403].includes(r.status), `${outro}: ${r.status}`);
    }
    assert.equal(dispatches, 0);
    const separar = await POST(pedido({ action: 'submit', id, preset: 'stems-v1' }));
    assert.equal(separar.status, 200);
    assert.equal(dispatches, 1);
    assert.equal(preset, 'stems-v1');
  } finally {
    globalThis.fetch = before;
    for (const k of keys)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    restore();
  }
});

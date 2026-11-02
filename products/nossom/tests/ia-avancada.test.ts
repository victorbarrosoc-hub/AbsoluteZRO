// IA avançada (lib/server/ia-avancada.ts): a reserva do Melhorar com a Z roda no servidor, usa os mesmos minutos do
// plano, nunca chama a GPU, não expõe a chave e, se falhar ou passar do prazo, encerra o pedido (minutos devolvidos).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../app/api/audio/jobs/route';
import { iaAvancada, outputParts, validAdvancedReport, validJobReport } from '../lib/restoration';
import { nomeDoAudio, segundoPlano } from '../lib/server/ia-avancada';
import { encaixarDuracao } from '../lib/audio';
import { authEnvironment, testCookie, testUser } from './helpers/auth';
import { resetRequestLimits } from '../lib/server/ai-access';

beforeEach(resetRequestLimits);

const chave = 'private-advanced-test-key-123456';

test('o resultado da IA avançada é um arquivo só, limitado, e não passa por outro tipo', () => {
  const ok = { preset: iaAvancada.id, chunks: [{ index: 0, bytes: 900 }], totalBytes: 900 };
  assert.equal(validAdvancedReport(ok), true);
  assert.equal(validJobReport(ok), true);
  assert.equal(outputParts(iaAvancada.id), 1);
  for (const bad of [
    { ...ok, totalBytes: 0, chunks: [{ index: 0, bytes: 0 }] },
    { ...ok, totalBytes: 21 * 1024 * 1024, chunks: [{ index: 0, bytes: 21 * 1024 * 1024 }] },
    { ...ok, chunks: [{ index: 0, bytes: 899 }] },
    { ...ok, chunks: [ok.chunks[0], ok.chunks[0]] },
    { ...ok, preset: 'resemble-d-v1' },
  ])
    assert.equal(validAdvancedReport(bad), false);
});

test('o nome do arquivo segue o conteúdo, não o que o navegador disse', () => {
  const bytes = (texto: string) => new Uint8Array([...texto].map((c) => c.charCodeAt(0)));
  assert.equal(nomeDoAudio(bytes('RIFF\0\0\0\0WAVE')), 'audio.wav');
  assert.equal(nomeDoAudio(bytes('fLaC\0\0\0\0')), 'audio.flac');
  assert.equal(nomeDoAudio(bytes('ID3\x04\0\0')), 'audio.mp3');
  assert.equal(nomeDoAudio(new Uint8Array([0xff, 0xfb, 0x90, 0x64])), 'audio.mp3');
  assert.equal(nomeDoAudio(bytes('\0\0\0\x20ftypM4A ')), 'audio.m4a');
  assert.equal(nomeDoAudio(bytes('<html>')), 'audio');
});

test('a duração da voz limpa é acertada para a do original', () => {
  const longo = encaixarDuracao(new Float32Array([0.1, 0.2, 0.3, 0.4]), 3);
  assert.deepEqual(
    [...longo].map((n) => +n.toFixed(2)),
    [0.1, 0.2, 0.3],
  );
  const curto = encaixarDuracao(new Float32Array([0.5]), 3);
  assert.deepEqual([...curto], [0.5, 0, 0]);
});

function ambiente(parceiro: (init?: RequestInit) => Response | Promise<Response>) {
  const restore = authEnvironment(),
    before = globalThis.fetch,
    rodarAntes = segundoPlano.rodar;
  const keys = [
    'RUNPOD_API_KEY',
    'RUNPOD_ENDPOINT_ID',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ELEVENLABS_API_KEY',
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.RUNPOD_API_KEY = 'private-runpod-test';
  process.env.RUNPOD_ENDPOINT_ID = 'endpoint-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-storage-test';
  process.env.ELEVENLABS_API_KEY = chave;
  const estado = {
    job: null as any,
    gpu: 0,
    chamadas: 0,
    guardado: null as Blob | null,
    tarefas: [] as Promise<void>[],
    cabecalho: '',
  };
  segundoPlano.rodar = (tarefa) => {
    estado.tarefas.push(tarefa());
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body && typeof init.body === 'string' ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/auth/v1/user')) return Response.json(testUser);
    if (url.endsWith('/rpc/nossom_plan_usage'))
      return Response.json({ allowed: true, used: body.p_request_id ? 60 : 0, remaining: 540 });
    if (url.endsWith('/rpc/nossom_job_runtime')) return Response.json({});
    if (url.endsWith('/rpc/nossom_restoration_job')) {
      if (body.p_action === 'prepare')
        estado.job = {
          id: body.p_id,
          user_id: body.p_user,
          status: 'uploading',
          created_at: new Date().toISOString(),
          ...body.p_data,
        };
      let claimed = false;
      if (body.p_action === 'claim' && estado.job.status === 'uploading') {
        estado.job.status = 'submitting';
        claimed = true;
      }
      if (body.p_action === 'update' && estado.job.status !== 'failed')
        Object.assign(estado.job, body.p_data, { updated_at: new Date().toISOString() });
      if (body.p_action === 'fail') estado.job.status = 'failed';
      return Response.json({ job: estado.job, claimed });
    }
    if (url.includes('/storage/v1/object/upload/sign/'))
      return Response.json({
        url: new URL(url).pathname.replace('/storage/v1', '') + '?token=write-test',
      });
    if (url.includes('/storage/v1/object/sign/'))
      return Response.json({
        signedURL: new URL(url).pathname.replace('/storage/v1', '') + '?token=read-test',
      });
    if (url.includes('/storage/v1/object/nossom-restoration/') && url.includes('/source-'))
      return new Response(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]));
    if (url.includes('/storage/v1/object/nossom-restoration/') && url.includes('/output-0')) {
      assert.equal(new Headers(init?.headers).get('x-upsert'), 'true');
      estado.guardado = init?.body as Blob;
      return Response.json({});
    }
    if (url.startsWith('https://api.elevenlabs.io/')) {
      estado.chamadas++;
      estado.cabecalho = new Headers(init?.headers).get('xi-api-key') ?? '';
      return parceiro(init);
    }
    if (url.includes('api.runpod.ai')) {
      estado.gpu++;
      return Response.json({ id: 'nao-devia' });
    }
    throw new Error('Unexpected network call: ' + new URL(url).pathname);
  };
  const desfazer = () => {
    globalThis.fetch = before;
    segundoPlano.rodar = rodarAntes;
    restore();
    for (const k of keys)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  };
  return { estado, desfazer };
}
const pedido = (body?: unknown) =>
  new Request('http://localhost/api/audio/jobs', {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: testCookie(),
      origin: 'http://localhost',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const status = async (id: string) =>
  (
    await GET(
      new Request(`http://localhost/api/audio/jobs?id=${id}`, {
        headers: { cookie: testCookie() },
      }),
    )
  ).json();

test('IA avançada: limpa no servidor, guarda um arquivo e entrega sem tocar na GPU', async () => {
  const { estado, desfazer } = ambiente(
    () => new Response(new Uint8Array(900).fill(7), { headers: { 'Content-Type': 'audio/mpeg' } }),
  );
  try {
    const pronto = await (await GET(pedido())).json();
    assert.equal(pronto.advanced, true);
    assert.equal(JSON.stringify(pronto).includes(chave), false);
    const { id } = await (
      await POST(pedido({ action: 'prepare', bytes: 4096, duration: 30 }))
    ).json();
    const enviado = await POST(pedido({ action: 'submit', id, preset: iaAvancada.id }));
    assert.equal(enviado.status, 200);
    const resposta = await enviado.json();
    assert.equal(resposta.status, 'running');
    assert.equal(resposta.usage.used, 60, 'os minutos do plano foram reservados');
    assert.equal(JSON.stringify(resposta).includes(chave), false);
    await Promise.all(estado.tarefas);
    assert.equal(estado.gpu, 0);
    assert.equal(estado.chamadas, 1);
    assert.equal(estado.cabecalho, chave);
    assert.equal(estado.guardado?.size, 900);
    const final = await status(id);
    assert.equal(final.status, 'completed');
    assert.equal(final.report.preset, iaAvancada.id);
    assert.equal(final.downloadUrls.length, 1);
    // pedir de novo não dispara outra chamada
    assert.equal((await POST(pedido({ action: 'submit', id, preset: iaAvancada.id }))).status, 200);
    await Promise.all(estado.tarefas);
    assert.equal(estado.chamadas, 1);
  } finally {
    desfazer();
  }
});

test('IA avançada: recusa do parceiro encerra o pedido (minutos voltam) e não tenta de novo', async () => {
  const { estado, desfazer } = ambiente(() => new Response('{"detail":"x"}', { status: 500 }));
  try {
    const { id } = await (
      await POST(pedido({ action: 'prepare', bytes: 4096, duration: 30 }))
    ).json();
    assert.equal((await POST(pedido({ action: 'submit', id, preset: iaAvancada.id }))).status, 200);
    await Promise.all(estado.tarefas);
    assert.equal(estado.chamadas, 1);
    assert.equal(estado.job.status, 'failed');
    assert.equal((await status(id)).status, 'failed');
  } finally {
    desfazer();
  }
});

test('IA avançada: sem chave, o pedido nem começa; passou do prazo, encerra', async () => {
  const { estado, desfazer } = ambiente(() => new Response(new Uint8Array(10)));
  try {
    process.env.ELEVENLABS_API_KEY = '';
    assert.equal((await (await GET(pedido())).json()).advanced, false);
    const { id } = await (
      await POST(pedido({ action: 'prepare', bytes: 4096, duration: 30 }))
    ).json();
    assert.equal((await POST(pedido({ action: 'submit', id, preset: iaAvancada.id }))).status, 503);
    assert.equal(estado.job.status, 'failed');
    assert.equal(estado.chamadas, 0);

    process.env.ELEVENLABS_API_KEY = chave;
    estado.job = null;
    segundoPlano.rodar = () => {}; // a função caiu antes de terminar
    const novo = await (
      await POST(pedido({ action: 'prepare', bytes: 4096, duration: 30 }))
    ).json();
    await POST(pedido({ action: 'submit', id: novo.id, preset: iaAvancada.id }));
    assert.equal((await status(novo.id)).status, 'running');
    estado.job.updated_at = new Date(Date.now() - 9 * 60000).toISOString();
    assert.equal((await status(novo.id)).status, 'failed');
  } finally {
    desfazer();
  }
});

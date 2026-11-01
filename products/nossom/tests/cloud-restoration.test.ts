import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../app/api/audio/jobs/route';
import {
  CLOUD_PART_BYTES,
  outputParts,
  presetSpec,
  restorationD,
  singingSeparation,
  stemSeparation,
  transcription,
  validStemsReport,
  validTranscriptReport,
  vocalSeparation,
  voiceIsolator,
  validCloudReport,
} from '../lib/restoration';
import { authEnvironment, testCookie, testUser } from './helpers/auth';
import { resetRequestLimits } from '../lib/server/ai-access';

beforeEach(resetRequestLimits);

const report = {
  preset: restorationD.id,
  chunks: [{ index: 0, bytes: 44100 * 4 + 44 }],
  totalBytes: 44100 * 4 + 44,
  frames: 44100,
  sampleRate: 44100,
  channels: 1,
  gainDb: 0,
};
test('cloud result contract rejects truncated, unbounded and wrong-preset output', () => {
  assert.equal(validCloudReport(report), true);
  for (const bad of [
    { ...report, totalBytes: 4 },
    { ...report, frames: 44100 * 601 },
    { ...report, channels: 2 },
    { ...report, preset: 'other' },
    { ...report, gainDb: 6 },
    { ...report, chunks: [{ index: 1, bytes: report.totalBytes }] },
    { ...report, chunks: [{ index: 0, bytes: CLOUD_PART_BYTES + 1 }] },
  ])
    assert.equal(validCloudReport(bad), false);
});
for (const preset of [
  restorationD.id,
  vocalSeparation.id,
  voiceIsolator.id,
  singingSeparation.id,
  transcription.id,
] as const)
  test(`cloud ${preset} verifies identity, owns jobs, dispatches once and privately releases parts`, async () => {
    const parts = outputParts(preset);
    const outputReport =
      preset === transcription.id
        ? {
            preset,
            chunks: [{ index: 0, bytes: 120 }],
            totalBytes: 120,
            words: 3,
            language: 'pt',
          }
        : (() => {
            const { channels, sampleRate } = presetSpec(preset);
            return {
              ...report,
              preset,
              channels,
              sampleRate,
              frames: sampleRate,
              totalBytes: sampleRate * channels * 4 + 44,
              chunks: [{ index: 0, bytes: sampleRate * channels * 4 + 44 }],
            };
          })();
    const restore = authEnvironment(),
      before = globalThis.fetch;
    const keys = ['RUNPOD_API_KEY', 'RUNPOD_ENDPOINT_ID', 'SUPABASE_SERVICE_ROLE_KEY'];
    const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.RUNPOD_API_KEY = 'private-runpod-test';
    process.env.RUNPOD_ENDPOINT_ID = 'endpoint-test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-storage-test';
    let job: any = null,
      dispatches = 0,
      providerPayload: any = null,
      removed: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input),
        body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.endsWith('/auth/v1/user')) return Response.json(testUser);
      if (url.endsWith('/rpc/nossom_plan_usage'))
        return Response.json({ allowed: true, used: body.p_request_id ? 1 : 0, remaining: 9 });
      if (url.endsWith('/rpc/nossom_restoration_job')) {
        assert.equal(new Headers(init?.headers).get('apikey'), 'private-storage-test');
        if (body.p_action === 'prepare')
          job = { id: body.p_id, user_id: body.p_user, status: 'uploading', ...body.p_data };
        if (job && body.p_user !== job.user_id) return Response.json({ job: null });
        let claimed = false;
        if (body.p_action === 'claim' && job.status === 'uploading') {
          job.status = 'submitting';
          claimed = true;
        }
        if (body.p_action === 'update') Object.assign(job, body.p_data);
        if (body.p_action === 'fail') job.status = 'failed';
        if (body.p_action === 'release') job.status = 'released';
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
      if (url.endsWith('/storage/v1/object/nossom-restoration')) {
        removed = body.prefixes;
        return Response.json({});
      }
      if (url.endsWith('/run')) {
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-runpod-test');
        dispatches++;
        providerPayload = body;
        return Response.json({ id: 'provider-job-test' });
      }
      if (url.includes('/status/'))
        return Response.json({ status: 'COMPLETED', output: outputReport });
      throw new Error('Unexpected network call: ' + new URL(url).pathname);
    };
    const request = (body?: unknown, cookie = testCookie(), origin = 'http://localhost') =>
      new Request('http://localhost/api/audio/jobs', {
        method: body ? 'POST' : 'GET',
        headers: { cookie, origin, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
      assert.equal((await POST(request({ action: 'prepare' }, ''))).status, 401);
      assert.equal(
        (await POST(request({ action: 'prepare' }, testCookie(), 'https://evil.test'))).status,
        403,
      );
      assert.equal(
        (await POST(request({ action: 'prepare', bytes: 50, duration: 601 }))).status,
        400,
      );
      const prepared = await (
        await POST(request({ action: 'prepare', bytes: 30 * 1024 * 1024, duration: 1 }))
      ).json();
      assert.equal(prepared.uploadUrls.length, 2);
      assert.equal(prepared.partBytes, CLOUD_PART_BYTES);
      const id = prepared.id;
      assert.equal(
        (await POST(request({ action: 'submit', id, preset: 'untrusted' }))).status,
        400,
      );
      assert.equal(dispatches, 0);
      const first = await POST(request({ action: 'submit', id, preset, tau: 1, nfe: 128 }));
      assert.equal(first.status, 200);
      assert.equal((await POST(request({ action: 'submit', id }))).status, 200);
      assert.equal(dispatches, 1);
      assert.equal(providerPayload.input.preset, preset);
      assert.equal(providerPayload.input.tau, undefined);
      assert.equal(providerPayload.input.output_urls.length, parts);
      assert.equal(providerPayload.policy.executionTimeout, 900000);
      const own = await GET(
        new Request(`http://localhost/api/audio/jobs?id=${id}`, {
          headers: { cookie: testCookie() },
        }),
      );
      const data = await own.json();
      assert.equal(data.status, 'completed');
      assert.equal(data.downloadUrls.length, 1);
      assert.equal(JSON.stringify(data).includes('private-runpod-test'), false);
      const source = await GET(
        new Request(`http://localhost/api/audio/jobs?id=${id}&source=1`, {
          headers: { cookie: testCookie() },
        }),
      );
      const recovered = await source.json();
      assert.equal(source.status, 200);
      assert.equal(recovered.bytes, 30 * 1024 * 1024);
      assert.equal(recovered.downloadUrls.length, 2);
      assert.ok(recovered.downloadUrls.every((url: string) => url.includes(`/source-`)));

      const other = testCookie({ ...testUser, id: '22222222-2222-4222-8222-222222222222' });
      // Auth provider validates the actual identity, not the encrypted-cookie metadata.
      const previousFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) =>
        String(input).endsWith('/auth/v1/user')
          ? Response.json({ ...testUser, id: '22222222-2222-4222-8222-222222222222' })
          : previousFetch(input, init);
      assert.equal((await POST(request({ action: 'release', id }, other))).status, 404);
      assert.equal(
        (
          await GET(
            new Request(`http://localhost/api/audio/jobs?id=${id}&source=1`, {
              headers: { cookie: other },
            }),
          )
        ).status,
        404,
      );

      globalThis.fetch = previousFetch;
      assert.equal((await POST(request({ action: 'release', id }))).status, 200);
      assert.equal(removed.length, 2 + parts);
      assert.ok(removed.every((p) => p.startsWith(`${testUser.id}/${id}/`)));
    } finally {
      globalThis.fetch = before;
      restore();
      for (const k of keys)
        if (old[k] === undefined) delete process.env[k];
        else process.env[k] = old[k];
    }
  });

test('RunPod owner diagnostics hide secrets and explicit provider rejection releases the reservation', async () => {
  const restore = authEnvironment(),
    previous = globalThis.fetch;
  const keys = [
    'RUNPOD_API_KEY',
    'RUNPOD_ENDPOINT_ID',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ZRO_CLIENT_ID',
    'ZRO_CLIENT_SECRET',
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.RUNPOD_API_KEY = 'private-diagnostic-placeholder';
  process.env.RUNPOD_ENDPOINT_ID = 'endpoint-diagnostic';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-storage-placeholder';
  process.env.ZRO_CLIENT_ID = 'nossom-web';
  process.env.ZRO_CLIENT_SECRET = 'zro-test-secret-placeholder';
  let owner = false,
    code = 404,
    failed = 0,
    providerRuns = 0;
  const job = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: testUser.id,
    input_parts: 1,
    input_bytes: 5000,
    duration: 1,
    status: 'submitting',
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/auth/v1/user')) return Response.json(testUser);
    // O ADM é o admin da plataforma guardado no vínculo com a Absolute ZRO (claim `zro_admin`).
    if (url.endsWith('/rpc/nossom_zro_link'))
      return Response.json({
        link: {
          email: testUser.email,
          organization: null,
          products: ['nossom'],
          release: {},
          admin: owner,
        },
      });
    if (url.endsWith('/health'))
      return code === 200
        ? Response.json({
            workers: { ready: 0, running: 0, unhealthy: 0 },
            ignored: 'private-diagnostic-placeholder',
          })
        : Response.json({ error: 'private-diagnostic-placeholder' }, { status: code });
    if (url.endsWith('/rpc/nossom_restoration_job')) {
      if (body.p_action === 'fail') failed++;
      return Response.json({ job, claimed: true });
    }
    if (url.endsWith('/rpc/nossom_plan_usage')) return Response.json({ allowed: true });
    if (url.includes('/storage/v1/object/upload/sign/'))
      return Response.json({ url: new URL(url).pathname + '?token=placeholder' });
    if (url.includes('/storage/v1/object/sign/'))
      return Response.json({ signedURL: new URL(url).pathname + '?token=placeholder' });
    if (url.endsWith('/run')) {
      providerRuns++;
      return Response.json({}, { status: code });
    }
    throw new Error('Unexpected mocked request');
  };
  const req = () =>
    new Request('http://localhost/api/audio/jobs?diagnostic=1', {
      headers: { cookie: testCookie() },
    });
  try {
    assert.equal((await GET(req())).status, 403);
    owner = true;
    const unavailable = await (await GET(req())).json();
    assert.equal(unavailable.providerStatus, 404);
    assert.match(unavailable.hint, /RUNPOD_ENDPOINT_ID/);
    assert.equal(JSON.stringify(unavailable).includes('private-diagnostic-placeholder'), false);
    code = 200;
    const healthy = await (await GET(req())).json();
    assert.equal(healthy.reachable, true);
    assert.deepEqual(healthy.workers, { ready: 0, running: 0, unhealthy: 0 });
    assert.equal(JSON.stringify(healthy).includes('private-diagnostic-placeholder'), false);
    for (const status of [401, 403, 404, 429, 500]) {
      code = status;
      const before = failed;
      const response = await POST(
        new Request('http://localhost/api/audio/jobs', {
          method: 'POST',
          headers: {
            cookie: testCookie(),
            Origin: 'http://localhost',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'submit', id: job.id }),
        }),
      );
      assert.equal(response.status, 503);
      assert.equal(failed - before, status < 500 ? 1 : 0);
      assert.equal(JSON.stringify(await response.json()).includes('RUNPOD_API_KEY'), false);
    }
    assert.equal(providerRuns, 5);
  } finally {
    globalThis.fetch = previous;
    restore();
    for (const key of keys)
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
  }
});

test('confirmed provider cancellation ends the reservation without dispatching another job', async () => {
  const restore = authEnvironment(),
    before = globalThis.fetch;
  const keys = ['RUNPOD_API_KEY', 'RUNPOD_ENDPOINT_ID', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const key of keys) process.env[key] = 'test-cancellation-only';
  const job = {
    id: '99999999-9999-4999-8999-999999999999',
    user_id: testUser.id,
    status: 'queued',
    provider_id: 'private-provider-id',
    input_parts: 1,
    input_bytes: 500,
    duration: 1,
  };
  let cancelled = 0,
    failed = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/auth/v1/user')) return Response.json(testUser);
    if (url.endsWith('/rpc/nossom_restoration_job')) {
      if (body.p_action === 'fail') {
        failed++;
        job.status = 'failed';
      }
      return Response.json({ job });
    }
    if (url.endsWith('/cancel/private-provider-id')) {
      cancelled++;
      return Response.json({ status: 'CANCELLED' });
    }
    throw new Error('Unexpected request');
  };
  try {
    const response = await POST(
      new Request('http://localhost/api/audio/jobs', {
        method: 'POST',
        headers: { cookie: testCookie(), Origin: 'http://localhost' },
        body: JSON.stringify({ action: 'cancel', id: job.id }),
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'cancelled');
    assert.equal(cancelled, 1);
    assert.equal(failed, 1);
    assert.equal(job.status, 'failed');
  } finally {
    globalThis.fetch = before;
    restore();
    for (const key of keys)
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
  }
});

test('vocals report preserves stereo and refuses speech reports disguised as separation', () => {
  const stereo = {
    ...report,
    preset: vocalSeparation.id,
    channels: 2,
    totalBytes: report.frames * 8 + 44,
    chunks: [{ index: 0, bytes: report.frames * 8 + 44 }],
  };
  assert.equal(validCloudReport(stereo), true);
  assert.equal(validCloudReport({ ...stereo, channels: 1 }), false);
  assert.equal(validCloudReport({ ...stereo, totalBytes: report.totalBytes }), false);
});

test('voice isolator reports 48 kHz mono speech; the singing stem stays stereo 44.1 kHz', () => {
  const speech = {
    ...report,
    preset: voiceIsolator.id,
    sampleRate: 48000,
    frames: 48000 * 600,
    totalBytes: 48000 * 600 * 4 + 44,
    chunks: Array.from({ length: 6 }, (_, index) => ({
      index,
      bytes: index < 5 ? CLOUD_PART_BYTES : 48000 * 600 * 4 + 44 - 5 * CLOUD_PART_BYTES,
    })),
  };
  assert.equal(validCloudReport(speech), true);
  assert.equal(validCloudReport({ ...speech, sampleRate: 44100 }), false);
  assert.equal(validCloudReport({ ...speech, channels: 2 }), false);
  assert.equal(validCloudReport({ ...speech, frames: 48000 * 601 }), false);
  const stem = {
    ...report,
    preset: singingSeparation.id,
    channels: 2,
    totalBytes: report.frames * 8 + 44,
    chunks: [{ index: 0, bytes: report.frames * 8 + 44 }],
  };
  assert.equal(validCloudReport(stem), true);
  assert.equal(validCloudReport({ ...stem, channels: 1 }), false);
  assert.equal(validCloudReport({ ...stem, sampleRate: 48000 }), false);
});

test('a transcript report is one bounded JSON part and never passes as audio', () => {
  const ok = {
    preset: transcription.id,
    chunks: [{ index: 0, bytes: 900 }],
    totalBytes: 900,
    words: 120,
    language: 'pt',
  };
  assert.equal(validTranscriptReport(ok), true);
  assert.equal(validTranscriptReport({ ...ok, language: null }), true);
  assert.equal(validCloudReport(ok), false);
  for (const bad of [
    { ...ok, preset: voiceIsolator.id },
    { ...ok, totalBytes: 5 * 1024 * 1024, chunks: [{ index: 0, bytes: 5 * 1024 * 1024 }] },
    { ...ok, chunks: [{ index: 0, bytes: 899 }] },
    { ...ok, chunks: [ok.chunks[0], { index: 1, bytes: 1 }] },
    { ...ok, words: -1 },
    { ...ok, language: 'Português' },
  ])
    assert.equal(validTranscriptReport(bad), false);
  assert.equal(outputParts(transcription.id), 1);
});

test('stems report: five named stems that fill the package exactly', () => {
  const sizes = [30, 40, 50, 60, 70];
  const ok = {
    preset: stemSeparation.id,
    chunks: [{ index: 0, bytes: 250 }],
    totalBytes: 250,
    frames: 44100,
    sampleRate: 44100,
    channels: 2,
    gainDb: -0.4,
    stems: ['voz', 'bateria', 'baixo', 'guitarra', 'outros'].map((name, i) => ({
      name,
      bytes: sizes[i],
    })),
  };
  assert.equal(validStemsReport(ok), true);
  assert.equal(validCloudReport(ok), false);
  assert.equal(outputParts(stemSeparation.id), 40);
  for (const bad of [
    { ...ok, stems: ok.stems.slice(0, 4) },
    { ...ok, stems: [...ok.stems].reverse() },
    { ...ok, totalBytes: 251, chunks: [{ index: 0, bytes: 251 }] },
    { ...ok, channels: 1 },
    { ...ok, sampleRate: 48000 },
    { ...ok, gainDb: 3 },
    { ...ok, frames: 44100 * 601 },
    {
      ...ok,
      chunks: [
        { index: 0, bytes: 100 },
        { index: 1, bytes: 150 },
      ],
    },
  ])
    assert.equal(validStemsReport(bad), false);
});

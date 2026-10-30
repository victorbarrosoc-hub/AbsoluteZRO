import { randomUUID } from 'node:crypto';
import { supabaseConfig } from './supabase';
import { audioUsage } from './usage';
import {
  CLOUD_PART_BYTES,
  type CloudReport,
  type TranscriptReport,
  type StemsReport,
  type CloudState,
  restorationD,
  type CloudPreset,
  outputParts,
  validJobReport,
} from '../restoration';

const bucket = 'nossom-restoration';
export type RestorationJob = {
  id: string;
  user_id: string;
  status: CloudState;
  input_parts: number;
  input_bytes: number;
  duration: number;
  provider_id: string | null;
  report: CloudReport | TranscriptReport | StemsReport | { preset: CloudPreset } | null;
  created_at: string;
};
export class RestorationError extends Error {
  constructor(
    message: string,
    public status = 503,
    public providerStatus?: number,
  ) {
    super(message);
  }
}
function config() {
  const sb = supabaseConfig();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = process.env.RUNPOD_API_KEY;
  const endpoint = process.env.RUNPOD_ENDPOINT_ID;
  if (!sb || !service || !key || !endpoint || !/^[a-zA-Z0-9_-]{3,100}$/.test(endpoint)) return null;
  return { ...sb, service, runpodKey: key, endpoint };
}
export const restorationConfigured = () => !!config();
async function service<T>(path: string, method = 'POST', body?: unknown): Promise<T> {
  const c = config();
  if (!c)
    throw new RestorationError(
      'A restauração avançada está sendo conectada. As ferramentas de acabamento continuam disponíveis.',
    );
  const response = await fetch(c.url + path, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    headers: {
      apikey: c.service,
      Authorization: `Bearer ${c.service}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new RestorationError(
      'Não foi possível acessar o processamento. Tente novamente em instantes.',
    );
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function jobAction(action: string, user: string | null, id?: string, data?: unknown) {
  return service<{ job: RestorationJob | null; claimed?: boolean; jobs?: RestorationJob[] }>(
    '/rest/v1/rpc/nossom_restoration_job',
    'POST',
    { p_action: action, p_user: user, p_id: id ?? null, p_data: data ?? {} },
  );
}
function objectPath(job: RestorationJob, kind: 'source' | 'output', part: number) {
  return `${job.user_id}/${job.id}/${kind}-${part}.bin`;
}
function storageURL(path: string) {
  const c = config()!;
  const url = new URL(path, c.url);
  if (url.origin !== new URL(c.url).origin || !url.pathname.startsWith('/storage/v1/'))
    throw new RestorationError('O armazenamento retornou um endereço inválido.');
  return url.href;
}
async function uploadURL(job: RestorationJob, kind: 'source' | 'output', part: number) {
  const path = objectPath(job, kind, part);
  const data = await service<{ url: string }>(
    `/storage/v1/object/upload/sign/${bucket}/${path}`,
    'POST',
    { upsert: true },
  );
  // Supabase returns a path relative to /storage/v1, not the API origin.
  return storageURL(data.url.startsWith('/storage/v1/') ? data.url : '/storage/v1' + data.url);
}
async function readURL(job: RestorationJob, kind: 'source' | 'output', part: number) {
  const path = objectPath(job, kind, part);
  const data = await service<{ signedURL: string }>(
    `/storage/v1/object/sign/${bucket}/${path}`,
    'POST',
    { expiresIn: 3600 },
  );
  return storageURL(
    data.signedURL.startsWith('/storage/v1/') ? data.signedURL : '/storage/v1' + data.signedURL,
  );
}
async function runpod(path: string, method = 'GET', body?: unknown, timeout = 25000) {
  const c = config();
  if (!c) throw new RestorationError('O motor de restauração ainda não está conectado.');
  const response = await fetch(`https://api.runpod.ai/v2/${c.endpoint}/${path}`, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    headers: { Authorization: `Bearer ${c.runpodKey}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'Não foi possível iniciar o tratamento. Nossa equipe precisa verificar o serviço.',
      401: 'Não foi possível conectar ao serviço de áudio. Nossa equipe precisa verificar a conexão.',
      403: 'O serviço de áudio não autorizou o tratamento. Nossa equipe precisa verificar a conexão.',
      404: 'Não foi possível encontrar o serviço de áudio. Nossa equipe precisa verificar a conexão.',
      429: 'Há muitas solicitações agora. Aguarde um pouco antes de tentar novamente.',
    };
    throw new RestorationError(
      messages[response.status] ||
        'O servidor de restauração está indisponível. Tente novamente em instantes.',
      503,
      response.status,
    );
  }
  return response.json();
}
export async function prepareJob(user: string, bytes: number, duration: number) {
  const result = await jobAction('prepare', user, randomUUID(), {
    input_bytes: bytes,
    duration,
    input_parts: Math.ceil(bytes / CLOUD_PART_BYTES),
  });
  const job = result.job;
  if (!job && (result as { limited?: boolean }).limited)
    throw new RestorationError(
      'Você atingiu o limite de envios de hoje. Tente novamente amanhã.',
      429,
    );
  if (!job)
    throw new RestorationError(
      'Você já tem um áudio em processamento. Aguarde a conclusão ou cancele o pedido anterior.',
      409,
    );
  return uploadPlan(job);
}
export async function uploadPlan(job: RestorationJob) {
  if (job.status !== 'uploading')
    throw new RestorationError('O envio deste trabalho já foi encerrado.', 409);
  return {
    id: job.id,
    partBytes: CLOUD_PART_BYTES,
    uploadUrls: await Promise.all(
      Array.from({ length: job.input_parts }, (_, i) => uploadURL(job, 'source', i)),
    ),
  };
}
export async function ownedJob(user: string, id: string) {
  const { job } = await jobAction('get', user, id);
  if (!job) throw new RestorationError('Tratamento não encontrado para esta conta.', 404);
  return job;
}
export async function submitJob(
  request: Request,
  user: string,
  id: string,
  preset: CloudPreset = restorationD.id,
) {
  const { job, claimed } = await jobAction('claim', user, id);
  if (!job) throw new RestorationError('Tratamento não encontrado.', 404);
  if (!claimed) return { id, status: job.status };
  let dispatched = false;
  try {
    const usage = await audioUsage(request, job.id, 'auto');
    if (!usage.allowed)
      throw new RestorationError(
        'A franquia mensal não cobre este áudio. Faça upgrade ou aguarde a renovação no dia 1.',
        429,
      );
    const [inputUrls, outputUrls] = await Promise.all([
      Promise.all(Array.from({ length: job.input_parts }, (_, i) => readURL(job, 'source', i))),
      Promise.all(
        Array.from({ length: outputParts(preset) }, (_, i) => uploadURL(job, 'output', i)),
      ),
    ]);
    // Once dispatch begins its outcome can be ambiguous on a network failure.
    // Never retry dispatch or refund blindly: that could create duplicate GPU work.
    dispatched = true;
    const result = await runpod('run', 'POST', {
      input: {
        preset,
        input_urls: inputUrls,
        output_urls: outputUrls,
        input_bytes: job.input_bytes,
        duration: job.duration,
        storage_origin: new URL(config()!.url).origin,
      },
      policy: { executionTimeout: 900000, ttl: 1800000 },
    });
    if (typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(result.id))
      throw new RestorationError('O servidor não confirmou o tratamento.');
    await jobAction('update', user, id, {
      status: 'queued',
      provider_id: result.id,
      report: { preset },
    });
    return { id, status: 'queued', usage };
  } catch (error) {
    const rejected =
      error instanceof RestorationError &&
      error.providerStatus !== undefined &&
      error.providerStatus >= 400 &&
      error.providerStatus < 500 &&
      error.providerStatus !== 408;
    // An explicit rejection did not accept a job. Network timeouts/5xx remain
    // ambiguous and must never trigger a blind retry or refund.
    if (!dispatched || rejected) await jobAction('fail', user, id).catch(() => {});
    throw error;
  }
}
export async function jobStatus(user: string, id: string) {
  let job = await ownedJob(user, id);
  if (['queued', 'running'].includes(job.status) && job.provider_id) {
    const result = await runpod(`status/${job.provider_id}`);
    if (
      ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(result.status) &&
      Number.isInteger(result.executionTime) &&
      result.executionTime >= 0 &&
      result.executionTime <= 3600000
    ) {
      await service('/rest/v1/rpc/nossom_job_runtime', 'POST', {
        p_id: id,
        p_user: user,
        p_runtime: result.executionTime,
      });
    }
    if (result.status === 'COMPLETED') {
      if (
        !validJobReport(result.output) ||
        (job.report?.preset && result.output.preset !== job.report.preset)
      ) {
        await jobAction('fail', user, id);
        throw new RestorationError(
          'O motor não gerou um áudio válido. Seu tratamento foi devolvido.',
        );
      }
      const updated = await jobAction('update', user, id, {
        status: 'completed',
        report: result.output,
      });
      job = updated.job ?? job;
    } else if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(result.status)) {
      // The worker reports only its own fixed reasons; keep the log free of anything else.
      const reason =
        typeof result.error === 'string'
          ? result.error.match(/failed: ([\w .,()-]{1,120})$/)?.[1]
          : undefined;
      console.warn('NOSSOM job ' + id + ' ' + result.status + (reason ? ': ' + reason : ''));
      const failed = await jobAction('fail', user, id);
      job = failed.job ?? job;
    } else if (result.status === 'IN_PROGRESS' && job.status !== 'running') {
      job = (await jobAction('update', user, id, { status: 'running' })).job ?? job;
    }
  }
  return {
    id,
    status: job.status,
    preset: job.report?.preset ?? restorationD.id,
    ...(job.status === 'completed' && validJobReport(job.report)
      ? {
          report: job.report,
          downloadUrls: await Promise.all(
            job.report.chunks.map((_, i) => readURL(job, 'output', i)),
          ),
        }
      : {}),
  };
}
/** Recover only the authenticated owner's uploaded original on another device. */
export async function jobSource(user: string, id: string) {
  const job = await ownedJob(user, id);
  if (!['submitting', 'queued', 'running', 'completed'].includes(job.status))
    throw new RestorationError(
      'O envio do original não foi concluído. Retome no navegador onde você começou ou cancele este pedido.',
      409,
    );
  return {
    id,
    duration: job.duration,
    bytes: job.input_bytes,
    downloadUrls: await Promise.all(
      Array.from({ length: job.input_parts }, (_, i) => readURL(job, 'source', i)),
    ),
  };
}
export async function clearJob(job: RestorationJob) {
  const prefixes = [
    ...Array.from({ length: job.input_parts }, (_, i) => objectPath(job, 'source', i)),
    ...Array.from({ length: job.report?.preset ? outputParts(job.report.preset) : 11 }, (_, i) =>
      objectPath(job, 'output', i),
    ),
  ];
  await service(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes });
  await jobAction('release', job.user_id, job.id);
}
export async function cancelJob(user: string, id: string) {
  const job = await ownedJob(user, id);
  if (job.provider_id && ['queued', 'running'].includes(job.status)) {
    const result = await runpod(`cancel/${job.provider_id}`, 'POST');
    if (['CANCELLED', 'FAILED', 'TIMED_OUT'].includes(result.status)) {
      await jobAction('fail', user, id);
      return { id, status: result.status === 'CANCELLED' ? 'cancelled' : 'failed' };
    }
    // Do not stop a shared worker: RunPod handles the queue and scale-down.
    return { id, status: 'cancelling' };
  }
  if (job.status === 'uploading') {
    const failed = await jobAction('fail', user, id);
    if (failed.job) await clearJob(failed.job);
    return { id, status: 'released' };
  }
  return { id, status: job.status };
}

/** Read-only owner diagnostics: no provider credentials, signed URLs or raw errors. */
export async function restorationHealth() {
  const checks = {
    runpodKey: !!process.env.RUNPOD_API_KEY,
    endpointId: /^[a-zA-Z0-9_-]{3,100}$/.test(process.env.RUNPOD_ENDPOINT_ID || ''),
    serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    storage: !!supabaseConfig(),
    cleanupSecret: (process.env.CRON_SECRET?.length || 0) >= 32,
  };
  if (!config())
    return {
      configured: false,
      reachable: false,
      checks,
      error: 'Há uma variável de restauração ausente ou inválida na Vercel.',
    };
  try {
    const result = await runpod('health', 'GET', undefined, 5000);
    const workers: Record<string, number> = {};
    for (const key of ['idle', 'initializing', 'ready', 'running', 'throttled', 'unhealthy'])
      if (Number.isFinite(result.workers?.[key])) workers[key] = result.workers[key];
    return { configured: true, reachable: true, checks, workers };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      checks,
      providerStatus: error instanceof RestorationError ? (error.providerStatus ?? null) : null,
      hint:
        error instanceof RestorationError
          ? ((
              {
                401: 'Confira RUNPOD_API_KEY na Vercel.',
                403: 'Confira permissões da API key, saldo e restrições na RunPod.',
                404: 'Copie RUNPOD_ENDPOINT_ID diretamente da RunPod para a Vercel e faça redeploy.',
                429: 'Aguarde o limite de solicitações da RunPod.',
              } as Record<number, string>
            )[error.providerStatus ?? 0] ?? 'Confira os logs do endpoint na RunPod.')
          : 'Confira se a RunPod responde e tente novamente.',
      error:
        error instanceof RestorationError
          ? error.message
          : 'A RunPod não respondeu ao diagnóstico. Tente novamente em instantes.',
    };
  }
}

let readiness: { expires: number; result: Promise<boolean> } | undefined;
/** Public uptime indicator only; never returns keys, identifiers, counts or provider messages. */
export function restorationAvailable(): Promise<boolean> {
  if (!config()) return Promise.resolve(false);
  if (!readiness || Date.now() >= readiness.expires) {
    readiness = {
      expires: Date.now() + 60000,
      result: runpod('health', 'GET', undefined, 5000)
        .then(() => true)
        .catch(() => false),
    };
  }
  return readiness.result;
}

import { currentAccount } from '@/lib/server/account';
import { allowRequest, privateHeaders, sameOrigin } from '@/lib/server/ai-access';
import { audioUsage } from '@/lib/server/usage';
import {
  cancelJob,
  clearJob,
  jobAction,
  jobStatus,
  jobSource,
  ownedJob,
  prepareJob,
  restorationConfigured,
  restorationHealth,
  RestorationError,
  submitJob,
  uploadPlan,
} from '@/lib/server/restoration';
import { CLOUD_MAX_BYTES, CLOUD_MAX_SECONDS, restorationD, isCloudPreset } from '@/lib/restoration';
export const runtime = 'nodejs';
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof RestorationError
          ? error.message
          : 'Não foi possível concluir o tratamento. Tente novamente em instantes.',
    },
    { status: error instanceof RestorationError ? error.status : 503, headers: privateHeaders },
  );
}
export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers: privateHeaders },
    );
  try {
    if (new URL(request.url).searchParams.get('diagnostic') === '1') {
      if (!account.isAdmin)
        return Response.json(
          { error: 'Acesso restrito ao administrador.' },
          { status: 403, headers: privateHeaders },
        );
      if (!allowRequest('cloud-health:' + account.id, 6, 60000))
        throw new RestorationError('Aguarde um instante.', 429);
      const health = await restorationHealth();
      let pending = null;
      let requestStateUnavailable = false;
      try {
        const { job } = await jobAction('pending', account.id);
        if (job) {
          let status = job.status;
          try {
            status = (await jobStatus(account.id, job.id)).status;
          } catch {
            requestStateUnavailable = true;
          }
          pending = {
            status,
            dispatchConfirmed: !!job.provider_id,
            createdAt: job.created_at,
            duration: job.duration,
          };
        }
      } catch {
        requestStateUnavailable = true;
      }
      return Response.json(
        { ...health, request: pending, requestStateUnavailable },
        { headers: privateHeaders },
      );
    }
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      if (!uuid.test(id)) throw new RestorationError('Pedido inválido.', 400);
      if (!allowRequest('cloud-poll:' + account.id, 60, 60000))
        throw new RestorationError('Aguarde um instante.', 429);
      return Response.json(
        new URL(request.url).searchParams.get('source') === '1'
          ? await jobSource(account.id, id)
          : await jobStatus(account.id, id),
        { headers: privateHeaders },
      );
    }
    const configured = restorationConfigured();
    let ready = false;
    let pending: {
      id: string;
      status: string;
      duration: number;
      bytes: number;
      createdAt: string;
      preset?: string;
    } | null = null;
    if (configured) {
      try {
        const result = await jobAction('pending', account.id);
        await audioUsage(request);
        ready = true;
        if (result.job) {
          let status = result.job.status;
          try {
            status = (await jobStatus(account.id, result.job.id)).status;
          } catch {
            /* Keep the last confirmed state when the provider cannot be reached. */
          }
          if (!['released', 'failed', 'cancelled'].includes(status))
            pending = {
              id: result.job.id,
              status,
              duration: result.job.duration,
              bytes: result.job.input_bytes,
              createdAt: result.job.created_at,
              preset: result.job.report?.preset,
            };
        }
      } catch {
        /* Database migration must exist before enabling cloud work. */
      }
    }
    return Response.json(
      { configured: configured && ready, preset: restorationD, pending },
      { headers: privateHeaders },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const account = await currentAccount(request);
  if (!account)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers: privateHeaders },
    );
  if (!allowRequest('cloud-write:' + account.id, 30, 60000))
    return Response.json(
      { error: 'Aguarde um instante.' },
      { status: 429, headers: privateHeaders },
    );
  try {
    const text = await request.text();
    if (text.length > 2000) throw new RestorationError('Pedido inválido.', 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new RestorationError('Pedido inválido.', 400);
    }
    if (!body || typeof body !== 'object') throw new RestorationError('Pedido inválido.', 400);
    if (body.action === 'prepare') {
      if (
        !Number.isInteger(body.bytes) ||
        body.bytes <= 44 ||
        body.bytes > CLOUD_MAX_BYTES ||
        !Number.isFinite(body.duration) ||
        body.duration < 0.1 ||
        body.duration > CLOUD_MAX_SECONDS
      )
        throw new RestorationError('Use um arquivo de até 100 MB e 10 minutos.', 400);
      const usage = await audioUsage(request);
      if (
        !usage.allowed ||
        (!usage.unlimited &&
          usage.remainingSeconds !== undefined &&
          (usage.remainingSeconds ?? 0) < Math.max(60, Math.ceil(body.duration)))
      )
        throw new RestorationError(
          'A franquia mensal não cobre este áudio. Faça upgrade ou aguarde a renovação no dia 1.',
          429,
        );
      return Response.json(await prepareJob(account.id, body.bytes, body.duration), {
        headers: privateHeaders,
      });
    }
    if (!uuid.test(body.id ?? '')) throw new RestorationError('Pedido inválido.', 400);
    if (body.action === 'resume-upload')
      return Response.json(await uploadPlan(await ownedJob(account.id, body.id)), {
        headers: privateHeaders,
      });
    if (body.action === 'submit' && body.preset !== undefined && !isCloudPreset(body.preset))
      throw new RestorationError('Escolha um tratamento válido.', 400);
    if (body.action === 'submit')
      return Response.json(
        await submitJob(request, account.id, body.id, body.preset ?? restorationD.id),
        {
          headers: privateHeaders,
        },
      );
    if (body.action === 'cancel')
      return Response.json(await cancelJob(account.id, body.id), { headers: privateHeaders });
    if (body.action === 'release') {
      const job = await ownedJob(account.id, body.id);
      if (!['completed', 'failed', 'cancelled', 'released'].includes(job.status))
        throw new RestorationError('O áudio ainda está em processamento.', 409);
      await clearJob(job);
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    throw new RestorationError('Pedido inválido.', 400);
  } catch (error) {
    return failure(error);
  }
}

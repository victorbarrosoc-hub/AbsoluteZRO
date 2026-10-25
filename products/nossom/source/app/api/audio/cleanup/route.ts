import { timingSafeEqual } from 'node:crypto';
import { clearJob, jobAction } from '@/lib/server/restoration';
import { privateHeaders } from '@/lib/server/ai-access';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  if (
    !secret ||
    secret.length < 32 ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return Response.json(
      { error: 'Acesso não autorizado.' },
      { status: 401, headers: privateHeaders },
    );
  try {
    const { jobs } = await jobAction('stale', null);
    let deleted = 0;
    // The batch is bounded; provider TTL guarantees no 24-hour-old work is active.
    for (const job of (jobs ?? []).slice(0, 20)) {
      await clearJob(job);
      deleted++;
    }
    // Uploads can still land through signed URLs issued before a release: sweep recent
    // released/failed jobs again by prefix. Skipped quietly until the migration exists.
    let swept = 0;
    const started = Date.now();
    try {
      const { jobs: orphans } = await jobAction('orphans', null);
      for (const job of orphans ?? []) {
        if (Date.now() - started > 40000) break;
        await clearJob(job);
        swept++;
      }
    } catch {}
    return Response.json({ deleted, swept }, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: 'Limpeza temporariamente indisponível.' },
      { status: 503, headers: privateHeaders },
    );
  }
}

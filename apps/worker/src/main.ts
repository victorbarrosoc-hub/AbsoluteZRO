/**
 * Worker do HUB (PRD §7.3): processa a fila de execuções do banco novo.
 *   DATABASE_URL=... npm run worker
 * Para com SIGINT/SIGTERM depois da execução em curso. Não chama nenhum serviço dos apps originais.
 */
import { randomUUID } from 'node:crypto'
import { recoverStaleRuns, runOnce } from '@zro/core'
import { getDatabase } from '@zro/db'
import { HANDLERS, ROUTES } from '@zro/integrations'
import { createLogger } from '@zro/observability'

const log = createLogger('worker')
const db = getDatabase()
const workerId = `worker-${process.env.HOSTNAME ?? 'local'}-${randomUUID().slice(0, 6)}`
const idleMs = Number(process.env.ZRO_WORKER_IDLE_MS || 2000)
const leaseMs = Number(process.env.ZRO_WORKER_LEASE_MS || 10 * 60_000)
let stopping = false

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopping = true
    log.info('worker.stopping', { signal: sig })
  })
}

log.info('worker.started', { workerId, handlers: Object.keys(HANDLERS) })
let lastRecovery = 0
while (!stopping) {
  try {
    if (Date.now() - lastRecovery > leaseMs / 2) {
      const r = await recoverStaleRuns(db, HANDLERS, leaseMs)
      if (r.requeued || r.review) log.warn('worker.recovered', r)
      lastRecovery = Date.now()
    }
    const n = await runOnce(db, { handlers: HANDLERS, routes: ROUTES, workerId, log })
    if (n === 0) await new Promise((ok) => setTimeout(ok, idleMs))
  } catch (err) {
    log.error('worker.loop_error', { error: err })
    await new Promise((ok) => setTimeout(ok, idleMs * 5))
  }
}
await db.close()
log.info('worker.stopped', { workerId })

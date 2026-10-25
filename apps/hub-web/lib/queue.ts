import 'server-only'
import { after } from 'next/server'
import { recoverStaleRuns, runOnce } from '@zro/core'
import { HANDLERS, ROUTES } from '@zro/integrations'
import { createLogger } from '@zro/observability'
import { db } from './session'

const log = createLogger('fila-inline')

/**
 * Processa a fila logo depois da resposta, no mesmo servidor. Serve para quem roda só a Vercel, sem worker contínuo
 * (`npm run worker`). Com o worker ligado não atrapalha: a reserva é por SKIP LOCKED e só pega o que está na fila.
 */
export function drainQueueAfterResponse() {
  if (process.env.ZRO_INLINE_QUEUE === 'false') return
  after(async () => {
    try {
      await recoverStaleRuns(db(), HANDLERS)
      for (let i = 0; i < 3; i++) if ((await runOnce(db(), { handlers: HANDLERS, routes: ROUTES, batchSize: 5, log })) === 0) break
    } catch (err) {
      log.error('fila.inline_falhou', { error: err })
    }
  })
}

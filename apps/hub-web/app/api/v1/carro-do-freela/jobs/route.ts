import { importCarroJob } from '@zro/integrations'
import { json, readJson, route } from '@/lib/api'

/** Cria (ou devolve) o projeto de um job no contrato carro-do-freela.job/1. Aceita a sessão do HUB ou o token do Carro. */
export const POST = route(
  async ({ db, auth, req }) => {
    const r = await importCarroJob(db, auth, await readJson(req, 200_000))
    return json(r, r.created ? 201 : 200)
  },
  { mutation: true, bearer: 'carro-do-freela.jobs' },
)

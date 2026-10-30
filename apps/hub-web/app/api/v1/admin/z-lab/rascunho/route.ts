import { salvarRascunho } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/** Grava o rascunho da configuração da Z (o que o laboratório testa). Não cria versão nem muda a Z dos clientes. */
export const PUT = route(async ({ db, auth, req }) => json({ rascunho: await salvarRascunho(db, auth, await readJson(req, 400_000)) }), { mutation: true })

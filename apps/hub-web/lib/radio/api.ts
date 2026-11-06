import 'server-only'
import type { Tx } from '@zro/db'
import { DomainError } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'
import { acessoAoRadio, noRadio, pessoaDoRadio } from '.'

type Regra = (tx: Tx, p: { sub: string; nome: string }, corpo: Record<string, unknown>) => Promise<{ status: number; corpo: unknown }>

/**
 * Rota /api/v1/radio/*: sessão do HUB (cookie), origem conferida nas mutações, gate do rádio (fora dele, 404: o app não
 * lançado não aparece nem pela API) e a regra do núcleo dentro de `noRadio`.
 */
export function rotaDoRadio(regra: Regra, { mutation = false } = {}) {
  return route(
    async ({ db, auth, req }) => {
      const actor = await acessoAoRadio(db, auth)
      if (!actor) throw new DomainError('not_found', 'Não encontrado.')
      const corpo = mutation ? await readJson(req, 64_000) : {}
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new DomainError('invalid_input', 'JSON inválido.')
      const p = pessoaDoRadio(actor)
      const r = await noRadio(db, p.sub, (tx) => regra(tx, p, corpo as Record<string, unknown>))
      return json(r.corpo, r.status)
    },
    { mutation },
  )
}

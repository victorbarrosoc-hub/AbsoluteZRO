import { enviarMensagemSet, ESCOPO_SET } from '@zro/core'
import { json, route } from '@/lib/api'
import { corpo, texto } from '@/lib/set'

/**
 * POST /api/v1/set/conversas/{id}/mensagens { texto, chave? } — envia (texto e links, até 4000). `chave` torna o envio
 * idempotente. 30 mensagens por minuto por pessoa.
 */
export const POST = route<{ id: string }>(
  async ({ db, auth, req }, { id }) => {
    const b = await corpo(req)
    const r = await enviarMensagemSet(db, auth, id, { texto: b.texto, chave: texto(b.chave) ?? null })
    return json({ mensagem: r }, r.repetida ? 200 : 201)
  },
  { bearer: ESCOPO_SET, mutation: true },
)

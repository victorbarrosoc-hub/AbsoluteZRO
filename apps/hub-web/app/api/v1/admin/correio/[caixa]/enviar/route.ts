import { requireCaixa } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'
import { enviarDoCorreio } from '@/lib/correio/enviar'
import { lerUid } from '@/lib/correio/imap'
import { exigirConfig } from '@/lib/correio/servico'

export const maxDuration = 30

const texto = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Responde (responderA = uid do original) ou escreve um e-mail novo, saindo da caixa da rota (From = o alias). Cópia em
 * "Sent Messages" e registro em audit_logs, sem o corpo.
 */
export const POST = route<{ caixa: string }>(
  async ({ db, auth, req }, { caixa }) => {
    const a = requireCaixa(auth, caixa, { mudar: true })
    const corpo = await readJson(req, 400_000)
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new DomainError('invalid_input', 'Pedido inválido.')
    const b = corpo as Record<string, unknown>
    const r = await enviarDoCorreio(db, exigirConfig(), a, a.caixa, {
      para: texto(b.para),
      cc: texto(b.cc),
      assunto: texto(b.assunto),
      texto: texto(b.texto),
      responderA: b.responderA == null || b.responderA === '' ? null : lerUid(b.responderA),
      todos: b.todos === true,
    })
    return json({ ok: true, ...r }, 201)
  },
  { mutation: true },
)

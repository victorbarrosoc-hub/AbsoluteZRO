import { arquivarConhecimento } from '@zro/core'
import { json, route } from '@/lib/api'

/** Arquiva um texto de referência: sai da lista e do rascunho; versões antigas que o citam continuam iguais. */
export const DELETE = route<{ id: string }>(
  async ({ db, auth }, { id }) => {
    await arquivarConhecimento(db, auth, id)
    return json({ ok: true })
  },
  { mutation: true },
)

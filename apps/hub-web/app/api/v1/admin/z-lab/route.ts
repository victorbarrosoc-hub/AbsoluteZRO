import { adminDoLab } from '@zro/core'
import { json, route } from '@/lib/api'
import { estadoDaTela } from '@/lib/ia/lab/estado'

/** Laboratório da Z (só admin da plataforma): chaves ligadas, rascunho, versões, conhecimento, recursos e gasto. */
export const GET = route(async ({ db, auth }) => {
  adminDoLab(auth)
  return json(await estadoDaTela(db, auth))
})

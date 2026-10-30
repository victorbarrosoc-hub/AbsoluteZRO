import { adminDoLab, conflitosDaLista, editarAprendizado, rascunhoDoLab, removerAprendizado } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/** Edita ou move um aprendizado do rascunho (texto, seção, plataforma, exemplo). Auditado com o antes e o depois. */
export const PATCH = route<{ id: string }>(
  async ({ db, auth, req }, { id }) => {
    adminDoLab(auth)
    const aprendizado = await editarAprendizado(db, auth, id, await readJson(req, 20_000))
    return json({ aprendizado, conflitos: conflitosDaLista((await rascunhoDoLab(db, auth)).aprendizados) })
  },
  { mutation: true },
)

/** Tira um aprendizado do rascunho. As versões salvas continuam iguais. Auditado. */
export const DELETE = route<{ id: string }>(
  async ({ db, auth }, { id }) => {
    await removerAprendizado(db, auth, id)
    return json({ ok: true, conflitos: conflitosDaLista((await rascunhoDoLab(db, auth)).aprendizados) })
  },
  { mutation: true },
)

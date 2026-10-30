import { salvarRascunho, salvarVersao } from '@zro/core'
import { json, readJson, route } from '@/lib/api'
import { iaModelo } from '@/lib/ia/modelo'

/**
 * "Salvar versão": grava o rascunho (quando vem junto) e cria um número novo, imutável, com a nota. Não muda a Z dos
 * clientes.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    const corpo = (await readJson(req, 400_000)) as { nota?: unknown; rascunho?: unknown } | null
    if (corpo?.rascunho !== undefined) await salvarRascunho(db, auth, corpo.rascunho)
    return json({ versao: await salvarVersao(db, auth, { nota: corpo?.nota }, iaModelo()) }, 201)
  },
  { mutation: true },
)

import { requireCaixa } from '@zro/core'
import { DomainError } from '@zro/observability'
import { route } from '@/lib/api'
import { cabecalhosDoAnexo } from '@/lib/correio/anexo'
import { baixarAnexo, lerUid } from '@/lib/correio/imap'
import { exigirConfig } from '@/lib/correio/servico'

export const maxDuration = 30

/** Baixa um anexo sob demanda, passando pelo servidor com a mesma checagem de papel e de caixa. Sempre como download. */
export const GET = route<{ caixa: string; uid: string; indice: string }>(async ({ auth }, { caixa, uid, indice }) => {
  const a = requireCaixa(auth, caixa)
  if (!/^\d{1,3}$/.test(indice)) throw new DomainError('not_found', 'Anexo não encontrado.')
  const anexo = await baixarAnexo(exigirConfig(), a.caixa, lerUid(uid), Number(indice))
  return new Response(new Uint8Array(anexo.conteudo), { headers: cabecalhosDoAnexo(anexo) })
})

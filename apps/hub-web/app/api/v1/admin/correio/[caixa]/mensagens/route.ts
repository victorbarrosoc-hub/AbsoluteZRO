import { requireCaixa } from '@zro/core'
import { json, route } from '@/lib/api'
import { listarMensagens } from '@/lib/correio/imap'
import { exigirConfig } from '@/lib/correio/servico'

export const maxDuration = 30

/** As mensagens mais novas da caixa (até 50), direto do iCloud. Nada fica guardado no HUB. */
export const GET = route<{ caixa: string }>(async ({ auth }, { caixa }) => {
  const a = requireCaixa(auth, caixa)
  return json({ caixa: a.caixa, mensagens: await listarMensagens(exigirConfig(), a.caixa) })
})

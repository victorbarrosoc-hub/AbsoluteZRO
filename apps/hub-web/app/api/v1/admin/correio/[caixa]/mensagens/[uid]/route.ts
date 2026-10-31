import { requireCaixa } from '@zro/core'
import { json, route } from '@/lib/api'
import { abrirMensagem, lerUid } from '@/lib/correio/imap'
import { exigirConfig } from '@/lib/correio/servico'

export const maxDuration = 30

/**
 * Abre a mensagem (e marca como lida). O HTML vem limpo, num documento com CSP própria para o iframe sandbox; imagens
 * remotas só com ?imagens=1. Mensagem de outra caixa = 404.
 */
export const GET = route<{ caixa: string; uid: string }>(async ({ auth, req }, { caixa, uid }) => {
  const a = requireCaixa(auth, caixa)
  const imagens = new URL(req.url).searchParams.get('imagens') === '1'
  return json({ mensagem: await abrirMensagem(exigirConfig(), a.caixa, lerUid(uid), { imagens }) })
})

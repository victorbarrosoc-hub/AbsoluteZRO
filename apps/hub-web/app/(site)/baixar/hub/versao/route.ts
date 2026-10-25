// Versão mais nova do Absolute ZRO para computador (o aviso de versão nova do app lê daqui).
import { respostaVersao } from '@/lib/hub-desktop-release'

export const dynamic = 'force-dynamic'

export function GET() {
  return respostaVersao()
}

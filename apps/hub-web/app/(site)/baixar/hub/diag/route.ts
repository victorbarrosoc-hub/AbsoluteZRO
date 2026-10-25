// Diagnóstico do download do app para computador (token, acesso ao Release), sem mostrar segredos.
import { respostaDiag } from '@/lib/hub-desktop-release'

export const dynamic = 'force-dynamic'

export function GET() {
  return respostaDiag()
}

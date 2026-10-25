// Instalador do Absolute ZRO para computador (windows): redireciona para o arquivo do Release "hub-desktop" no GitHub.
import { respostaInstalador } from '@/lib/hub-desktop-release'

export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return respostaInstalador('windows', new URL(req.url))
}

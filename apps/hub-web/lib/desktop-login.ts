import type { DesktopLoginApp } from '@zro/auth'

/** Nome do app na tela "Voltar para o app" (a lista de esquemas é a de @zro/auth, fechada). */
export const DESKTOP_LOGIN_NOMES: Record<DesktopLoginApp, string> = {
  absolutezro: 'Absolute ZRO',
  relay: 'Relay',
  maestro: 'Maestro',
  tpeasy: 'TPeasy',
  carrodofreela: 'Carro do Freela',
  rift: 'Rift Motion',
  radion: 'RADION',
}

/** Endereço canônico do pedido (só os campos conhecidos, já validados). */
export function desktopLoginQuery(req: { app: string; state: string; challenge: string; next: string | null }): string {
  const q = new URLSearchParams({ app: req.app, state: req.state, challenge: req.challenge })
  if (req.next) q.set('next', req.next)
  return q.toString()
}

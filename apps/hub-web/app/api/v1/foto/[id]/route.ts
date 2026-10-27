import { publicAvatar } from '@zro/core'
import { getDatabase } from '@zro/db'

/**
 * Foto do perfil para os apps da família (perfil único, 0015): o endereço vem no claim `picture` do login único, é
 * impossível de adivinhar e muda a cada foto nova, então pode ficar em cache para sempre. Sem cookie: qualquer app
 * mostra a foto num <img>. Foto trocada ou conta inativa: 404 (o app relê o perfil e pega o endereço novo).
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await publicAvatar(getDatabase(), (await params).id)
  if (!a) return new Response('Sem foto.', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } })
  return new Response(new Uint8Array(a.data), {
    headers: {
      'Content-Type': a.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

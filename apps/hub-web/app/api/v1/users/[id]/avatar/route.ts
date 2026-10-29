import { readAvatar, requireUser } from '@zro/core'
import { DomainError } from '@zro/observability'
import { route } from '@/lib/api'

/** Foto do perfil (a própria ou de quem está na organização ativa). O endereço muda quando a foto muda (?v=). */
export const GET = route<{ id: string }>(async ({ db, auth }, { id }) => {
  requireUser(auth)
  const a = await readAvatar(db, auth, id)
  if (!a) throw new DomainError('not_found', 'Sem foto.')
  return new Response(new Uint8Array(a.data), {
    headers: {
      'Content-Type': a.type,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Last-Modified': a.updatedAt.toUTCString(),
    },
  })
})

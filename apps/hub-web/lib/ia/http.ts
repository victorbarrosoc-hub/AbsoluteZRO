import 'server-only'
/**
 * A IA é chamada pelo HUB (cookie) e pelos apps da família com o token do login único (Bearer `zro.ia`), inclusive do
 * navegador, em outro domínio. O token é a credencial (nada de cookie entre domínios), então qualquer origem pode
 * chamar com ele: o CORS só libera o cabeçalho Authorization, sem credenciais.
 */
export const IA_ESCOPO = 'zro.ia'

export function comCors(req: Request, res: Response): Response {
  const origin = req.headers.get('origin')
  if (!origin || !req.headers.get('authorization')?.startsWith('Bearer ')) return res
  const h = new Headers(res.headers)
  h.set('Access-Control-Allow-Origin', origin)
  h.set('Vary', 'Origin')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
}

export function preflight(req: Request): Response {
  const origin = req.headers.get('origin')
  return new Response(null, {
    status: 204,
    headers: origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        }
      : {},
  })
}

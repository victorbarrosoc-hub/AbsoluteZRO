/**
 * Proteção CSRF para rotas que mudam algo com cookie: o Origin (ou Referer) precisa ser do próprio HUB.
 * Server Actions do Next já conferem a origem; isto cobre as rotas de API.
 */
export function originAllowed(headers: Headers, requestUrl: string, allowed: string[]): boolean {
  const origin = headers.get('origin') ?? (headers.get('referer') ? safeOrigin(headers.get('referer')!) : null)
  if (!origin) return false
  const self = safeOrigin(requestUrl)
  return origin === self || allowed.includes(origin)
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

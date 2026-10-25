import 'server-only'

export const isProduction = process.env.ZRO_ENV === 'production'
/** Em desenvolvimento, links de convite e confirmação aparecem na tela, porque o provedor de e-mail não foi escolhido. */
export const showDevLinks = !isProduction
export const appOrigin = process.env.ZRO_APP_ORIGIN || 'http://localhost:3000'
export const allowedOrigins = (process.env.ZRO_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

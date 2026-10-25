import 'server-only'
import { zroEnv } from '@zro/observability'

export const environment = zroEnv()
export const isProduction = environment === 'production'
/** Fora de produção, links de convite e confirmação aparecem na tela, porque o provedor de e-mail não foi escolhido. */
export const showDevLinks = !isProduction
/** Origem pública: ZRO_APP_ORIGIN; na Vercel, o domínio de produção ou o da própria prévia. */
export const appOrigin =
  process.env.ZRO_APP_ORIGIN ||
  (environment === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  'http://localhost:3000'
export const allowedOrigins = (process.env.ZRO_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

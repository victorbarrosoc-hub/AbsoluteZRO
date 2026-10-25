/**
 * Ambiente do HUB. `ZRO_ENV` manda; sem ele, na Vercel vale o ambiente da própria Vercel
 * (production → production, preview → staging). Fora da Vercel: development.
 */
export type ZroEnv = 'production' | 'staging' | 'development'

export function zroEnv(env: NodeJS.ProcessEnv = process.env): ZroEnv {
  const explicit = env.ZRO_ENV
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') return explicit
  if (env.VERCEL_ENV === 'production') return 'production'
  if (env.VERCEL_ENV === 'preview') return 'staging'
  return 'development'
}

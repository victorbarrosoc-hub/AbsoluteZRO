import { caixasDoPapel, requireConsole } from '@zro/core'
import { json, route } from '@/lib/api'
import { configDoCorreio } from '@/lib/correio/config'

/** Correio do console (ADR 0034): as caixas do papel e se o iCloud está configurado (nomes das variáveis que faltam). */
export const GET = route(async ({ auth }) => {
  const a = requireConsole(auth, 'correio')
  const { faltam } = configDoCorreio(process.env)
  return json({ configurado: faltam.length === 0, faltam, caixas: caixasDoPapel(a.papel) })
})

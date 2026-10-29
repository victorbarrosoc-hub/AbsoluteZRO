import 'server-only'
import { revalidatePath } from 'next/cache'
import { redirect as redirecionar } from 'next/navigation'

/**
 * Redireciona esquecendo as telas que o navegador guardou (staleTimes em next.config.ts). Usado quando a sessão, a
 * organização ativa ou um consentimento mudam: nenhuma tela de antes pode reaparecer do cache (inclusive a mesma
 * rota, como /oauth/authorize depois do "Permitir").
 */
export function redirect(url: string): never {
  revalidatePath('/', 'layout')
  return redirecionar(url)
}

import 'server-only'
import { isDomainError } from '@zro/observability'
import { createLogger } from '@zro/observability'
import type { FormState } from '@/components/action-form'

const log = createLogger('action')

/** Converte erro de domínio em mensagem para o formulário; o resto vira mensagem genérica (e vai para o log). */
export function toFormError(err: unknown): FormState {
  if (isDomainError(err)) return { error: err.message }
  if (err && typeof err === 'object' && 'digest' in err) throw err // redirect/notFound do Next seguem adiante
  log.error('action.unhandled', { error: err })
  return { error: 'Algo deu errado do nosso lado. Tente de novo.' }
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

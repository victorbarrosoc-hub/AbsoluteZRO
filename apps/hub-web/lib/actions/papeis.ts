'use server'
/** Papéis do console (/admin/papeis, ADR 0034): só admin, como sistema, nunca o próprio papel, com auditoria. */
import { revalidatePath } from 'next/cache'
import { definirPapelDoConsole, lerPapel, NOME_DO_PAPEL, requireConsole } from '@zro/core'
import type { FormState } from '@/components/action-form'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

export async function definirPapelAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = requireConsole(await getAuth(), 'papeis', { mudar: true })
    const papel = lerPapel(str(fd, 'papel'))
    const alvo = str(fd, 'userId') ? { userId: str(fd, 'userId') } : { email: str(fd, 'email') }
    const r = await db().asSystem('admin: papel do console', (tx) => definirPapelDoConsole(tx, a, alvo, papel))
    revalidatePath('/admin/papeis')
    if (!r.mudou) return { ok: 'Já estava assim.' }
    return { ok: papel ? `Agora é ${NOME_DO_PAPEL[papel]}.` : 'Papel removido.' }
  } catch (e) {
    return toFormError(e)
  }
}

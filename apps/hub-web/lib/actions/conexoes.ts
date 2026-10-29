'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { alternarAppDaConexao, chaveDasConexoes, desconectarGoogle, escolherCalendarios } from '@zro/core'
import type { FormState } from '@/components/action-form'
import { ambienteAgenda, googleAgendaConfig } from '../conexoes'
import { db, getAuth } from '../session'
import { toFormError } from './helpers'

/** Conexões (ADR 0026): cada ação confere a sessão; o banco confere de novo (RLS por pessoa). */
async function pessoa() {
  const auth = await getAuth()
  if (!auth) redirect('/entrar?next=%2Fconexoes')
  return auth
}

export async function escolherAgendasAction(_: FormState, fd: FormData): Promise<FormState> {
  const auth = await pessoa()
  const amb = ambienteAgenda()
  if (!amb) return { error: 'As Conexões estão indisponíveis agora.' }
  try {
    await escolherCalendarios(
      db(),
      amb.cfg,
      amb.chave,
      auth,
      fd.getAll('agenda').map((v) => String(v)),
    )
  } catch (e) {
    return toFormError(e)
  }
  revalidatePath('/conexoes')
  return { ok: 'Agendas salvas.' }
}

export async function alternarAppAction(_: FormState, fd: FormData): Promise<FormState> {
  const auth = await pessoa()
  try {
    await alternarAppDaConexao(db(), auth, String(fd.get('app') ?? ''), fd.get('ativo') === 'on')
  } catch (e) {
    return toFormError(e)
  }
  revalidatePath('/conexoes')
  return { ok: 'Salvo.' }
}

export async function desconectarGoogleAction(_: FormState, __: FormData): Promise<FormState> {
  const auth = await pessoa()
  try {
    await desconectarGoogle(db(), googleAgendaConfig(), chaveDasConexoes(), auth)
  } catch (e) {
    return toFormError(e)
  }
  redirect('/conexoes?ok=desconectado')
}

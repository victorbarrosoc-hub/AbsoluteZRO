'use server'
/** Custos do ecossistema (/admin/custos, ADR 0028): admin e Financeiro (ADR 0034), como sistema, com auditoria. */
import { revalidatePath } from 'next/cache'
import {
  apagarCusto,
  atualizarDolar,
  hojeNoFuso,
  lerFormularioConfig,
  lerFormularioCotacao,
  lerFormularioCusto,
  requireConsole,
  salvarConfig,
  salvarCotacaoManual,
  salvarCusto,
  usarCotacaoAutomatica,
} from '@zro/core'
import type { FormState } from '@/components/action-form'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

async function ator() {
  const u = requireConsole(await getAuth(), 'custos', { mudar: true })
  return { userId: u.userId }
}

const campos = (fd: FormData) => {
  const out: Record<string, string> = {}
  for (const [k, v] of fd.entries()) if (typeof v === 'string' && !k.startsWith('$')) out[k] = v
  out.produtos = fd.getAll('produtos').map(String).join(',')
  return out
}

export async function salvarCustoAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await ator()
    const id = str(fd, 'id') || null
    await db().asSystem('admin: custos', async (tx) => {
      const produtos = await tx`select id from zro.products`
      const dados = lerFormularioCusto(
        campos(fd),
        produtos.map((p) => p.id as string),
      )
      return salvarCusto(tx, a, dados, id)
    })
    revalidatePath('/admin/custos')
    return { ok: id ? 'Salvo.' : 'Item criado.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function apagarCustoAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await ator()
    await db().asSystem('admin: custos', (tx) => apagarCusto(tx, a, str(fd, 'id')))
    revalidatePath('/admin/custos')
    return { ok: 'Item apagado.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function salvarConfigCustosAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await ator()
    await db().asSystem('admin: custos', (tx) => salvarConfig(tx, a, lerFormularioConfig(campos(fd))))
    revalidatePath('/admin/custos')
    return { ok: 'Salvo.' }
  } catch (e) {
    return toFormError(e)
  }
}

/** "Usar valor manual": vale o valor digitado até voltar ao automático. Auditado. */
export async function salvarCotacaoManualAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await ator()
    const v = lerFormularioCotacao(campos(fd), hojeNoFuso())
    await db().asSystem('admin: custos', (tx) => salvarCotacaoManual(tx, a, v))
    revalidatePath('/admin/custos')
    return { ok: 'Valor manual salvo.' }
  } catch (e) {
    return toFormError(e)
  }
}

/** "Voltar ao automático": vale de novo o Banco Central. Auditado. */
export async function usarCotacaoAutomaticaAction(_: FormState, _fd: FormData): Promise<FormState> {
  try {
    const a = await ator()
    await db().asSystem('admin: custos', (tx) => usarCotacaoAutomatica(tx, a))
    revalidatePath('/admin/custos')
    return { ok: 'Automático de novo.' }
  } catch (e) {
    return toFormError(e)
  }
}

/** "Atualizar agora": busca a PTAX na hora. Falha não apaga o último valor. */
export async function atualizarDolarAction(_: FormState, _fd: FormData): Promise<FormState> {
  try {
    await ator()
    const r = await atualizarDolar(db(), { forcar: true })
    revalidatePath('/admin/custos')
    return r.ok ? { ok: 'Atualizado.' } : { error: 'O Banco Central não respondeu agora. Fica a última cotação.' }
  } catch (e) {
    return toFormError(e)
  }
}

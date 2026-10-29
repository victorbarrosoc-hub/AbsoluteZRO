'use server'
/** Custos do ecossistema (/admin/custos, ADR 0028): só admin da plataforma, como sistema, com auditoria. */
import { revalidatePath } from 'next/cache'
import { apagarCusto, lerFormularioConfig, lerFormularioCusto, requirePlatformAdmin, salvarConfig, salvarCusto } from '@zro/core'
import type { FormState } from '@/components/action-form'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

async function ator() {
  const u = requirePlatformAdmin(await getAuth(), ['admin'])
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

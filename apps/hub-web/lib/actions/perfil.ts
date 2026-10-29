'use server'
/**
 * Perfil profissional com @ (ADR 0029): editar o perfil, trocar o @, aparecer ou não na busca, o aviso único, a busca e
 * o convite por @ em Equipe, e responder convites. Autorização no núcleo (packages/core/src/perfis.ts e organizations.ts).
 */
import { revalidatePath } from 'next/cache'
import { redirect } from './ir'
import {
  buscarPerfis,
  convidarPorArroba,
  definirVisibilidade,
  marcarAvisoDoPerfil,
  respondInvitation,
  salvarPerfil,
  trocarArroba,
  type OrgRole,
  type PerfilPublico,
} from '@zro/core'
import { isDomainError } from '@zro/observability'
import type { FormState } from '@/components/action-form'
import { avisarConvitePorArroba } from '../pessoas'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

export async function salvarPerfilAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await salvarPerfil(db(), await getAuth(), {
      funcoes: fd.getAll('funcao').map(String),
      funcaoOutra: str(fd, 'funcao_outra'),
      cidade: str(fd, 'cidade'),
      portfolio: str(fd, 'portfolio'),
      bio: str(fd, 'bio'),
      selos: fd.getAll('selo').map(String),
    })
    revalidatePath('/perfil', 'layout')
    return { ok: 'Perfil salvo.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function trocarArrobaAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await trocarArroba(db(), await getAuth(), str(fd, 'arroba'))
    revalidatePath('/', 'layout')
    return { ok: `Agora você é @${a}.` }
  } catch (e) {
    return toFormError(e)
  }
}

/** Aparecer na busca: liga e desliga na hora (o interruptor do perfil). */
export async function visibilidadeAction(fd: FormData) {
  await definirVisibilidade(db(), await getAuth(), str(fd, 'visivel') === '1')
  revalidatePath('/', 'layout')
}

/** O aviso único: "Entendi" mantém visível; "Esconder meu perfil" desliga a busca. */
export async function avisoPerfilAction(fd: FormData) {
  const auth = await getAuth()
  if (str(fd, 'esconder') === '1') await definirVisibilidade(db(), auth, false, { aviso: true })
  else await marcarAvisoDoPerfil(db(), auth)
  revalidatePath('/', 'layout')
}

export type ResultadoBusca = { pessoas: PerfilPublico[]; erro?: string }

/** Busca da tela Equipe › Convidar (como a pessoa, com o mesmo limite da API). */
export async function buscarPessoasAction(q: string): Promise<ResultadoBusca> {
  try {
    return { pessoas: await buscarPerfis(db(), await getAuth(), q, { limite: 8 }) }
  } catch (e) {
    return { pessoas: [], erro: isDomainError(e) ? e.message : 'Não deu para buscar agora.' }
  }
}

export async function convidarArrobaAction(arroba: string, papel: string): Promise<FormState> {
  try {
    const r = await convidarPorArroba(db(), await getAuth(), { arroba, role: papel as Exclude<OrgRole, 'owner' | 'guest'> })
    const aviso = await avisarConvitePorArroba(r.invitationId, r.token)
    revalidatePath('/equipe')
    return { ok: aviso.enviado ? `Convite enviado para @${r.arroba}.` : `@${r.arroba} vê o convite na Absolute ZRO.`, devLink: aviso.devLink }
  } catch (e) {
    return toFormError(e)
  }
}

export async function responderConviteAction(fd: FormData) {
  const resposta = str(fd, 'resposta') === 'aceitar' ? 'aceitar' : 'recusar'
  await respondInvitation(db(), await getAuth(), str(fd, 'id'), resposta)
  revalidatePath('/', 'layout')
  redirect(resposta === 'aceitar' ? '/inicio' : '/equipe')
}

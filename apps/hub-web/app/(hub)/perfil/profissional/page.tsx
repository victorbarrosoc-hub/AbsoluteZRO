import type { Metadata } from 'next'
import { avatarVersion, meuPerfil } from '@zro/core'
import { AccountFrame } from '@/components/account-frame'
import { EditorPerfil } from '@/components/pessoas/editor-perfil'
import { salvarPerfilAction, trocarArrobaAction, visibilidadeAction } from '@/lib/actions/perfil'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Perfil profissional' }

/** Perfil profissional (ADR 0029): como o audiovisual te acha na Absolute ZRO. Nome e foto são os da Visão geral. */
export default async function PerfilProfissional() {
  const auth = await requireOrgPage()
  const [avatar, perfil] = await Promise.all([avatarVersion(db(), auth), meuPerfil(db(), auth)])
  return (
    <AccountFrame auth={auth} avatar={avatar} title="Perfil profissional">
      <EditorPerfil perfil={perfil} salvar={salvarPerfilAction} trocarArroba={trocarArrobaAction} visibilidade={visibilidadeAction} />
    </AccountFrame>
  )
}

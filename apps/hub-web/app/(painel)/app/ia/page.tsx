import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { avatarVersion } from '@zro/core'
import { PainelIa } from '@/components/ia/painel-ia'
import { PainelLado, PainelMovel } from '@/components/painel-lado'
import { estadoDaIa, SUGESTOES_HUB } from '@/lib/ia/estado'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Z' }
export const dynamic = 'force-dynamic'

/**
 * A Z, a IA do ecossistema, no app Absolute ZRO: a saudação, o campo de conversa e as conversas de todas as
 * plataformas. Desde 29/10/2026 (titular; Plano de Integração §7–8) ela não é a primeira tela: o app abre nos apps
 * (/app), e a Z abre pelo item discreto no pé da barra, pelo anel do topo no celular ou por este endereço.
 */
export default async function PainelZ() {
  const auth = await getAuth()
  if (!auth) redirect('/app/entrar')
  if (!auth.session.activeOrgId) redirect('/boas-vindas')
  const [e, avatar] = await Promise.all([estadoDaIa(auth), avatarVersion(db(), auth)])
  const nome = auth.user.displayName || auth.user.email
  return (
    <div className="painel">
      <PainelLado ativo="z" userId={auth.user.id} nome={nome} email={auth.user.email} avatar={avatar} />
      <section className="painel__corpo painel__corpo--ia" aria-label="Z, a IA da Absolute ZRO">
        <PainelMovel userId={auth.user.id} nome={nome} avatar={avatar} naZ />
        <PainelIa {...e} sugestoes={SUGESTOES_HUB} apoio="O que você precisa hoje?" />
      </section>
    </div>
  )
}

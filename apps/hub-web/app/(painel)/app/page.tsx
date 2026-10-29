import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { avatarVersion } from '@zro/core'
import { PainelIa } from '@/components/ia/painel-ia'
import { PainelLado, PainelMovel } from '@/components/painel-lado'
import { estadoDaIa, SUGESTOES_HUB } from '@/lib/ia/estado'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'IA' }
export const dynamic = 'force-dynamic'

/**
 * O app Absolute ZRO abre na IA do ecossistema (pedido do titular, 27/10/2026), como os apps da família: a saudação, o
 * campo de conversa e as conversas de todas as plataformas. Os apps ficam a um toque, em /app/apps.
 */
export default async function PainelInicio() {
  const auth = await getAuth()
  if (!auth) redirect('/app/entrar')
  if (!auth.session.activeOrgId) redirect('/boas-vindas')
  const [e, avatar] = await Promise.all([estadoDaIa(auth), avatarVersion(db(), auth)])
  const nome = auth.user.displayName || auth.user.email
  return (
    <div className="painel">
      <PainelLado ativo="ia" userId={auth.user.id} nome={nome} email={auth.user.email} avatar={avatar} />
      <section className="painel__corpo painel__corpo--ia" aria-label="IA da Absolute ZRO">
        <PainelMovel userId={auth.user.id} nome={nome} avatar={avatar} />
        <PainelIa {...e} sugestoes={SUGESTOES_HUB} apoio="O que você precisa hoje?" />
      </section>
    </div>
  )
}

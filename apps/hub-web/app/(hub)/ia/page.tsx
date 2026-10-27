import type { Metadata } from 'next'
import { PainelIa } from '@/components/ia/painel-ia'
import { estadoDaIa, SUGESTOES_HUB } from '@/lib/ia/estado'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'IA' }

/** A IA do ecossistema no HUB: conversa com tudo da conta e mostra as conversas de todas as plataformas. */
export default async function Ia() {
  const auth = await requireOrgPage()
  const e = await estadoDaIa(auth)
  return (
    <div className="page page--ia">
      <PainelIa {...e} sugestoes={SUGESTOES_HUB} apoio="O que você precisa hoje?" />
    </div>
  )
}

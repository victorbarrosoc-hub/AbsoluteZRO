import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { authorize, avatarVersion } from '@zro/core'
import { AjustesDaCentral } from '@/components/ajustes-central'
import { PainelLado, PainelMovel } from '@/components/painel-lado'
import { ehAdmin } from '@/lib/downloads'
import { direitosDesktop } from '@/lib/meus-apps'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Ajustes' }
export const dynamic = 'force-dynamic'

/**
 * Ajustes da central "Absolute ZRO" neste computador (ADR 0035): "Atualizar sozinho" por app (padrão desligado: a central
 * avisa e a pessoa toca em Atualizar) e "Abrir com o computador". As escolhas ficam no computador (preferencias.json da
 * central); só os apps que a conta pode atualizar entram (direitosDesktop, no servidor).
 */
export default async function Ajustes() {
  const auth = await getAuth()
  if (!auth) redirect('/app/entrar')
  if (!auth.session.activeOrgId) redirect('/boas-vindas')
  const actor = await authorize(db(), auth)
  const [direitos, avatar] = await Promise.all([direitosDesktop(db(), actor, { admin: ehAdmin(auth) }), avatarVersion(db(), auth)])
  const nome = auth.user.displayName || auth.user.email
  return (
    <div className="painel">
      <PainelLado ativo="ajustes" userId={auth.user.id} nome={nome} email={auth.user.email} avatar={avatar} />
      <section className="painel__corpo" aria-labelledby="ajustes-titulo">
        <PainelMovel userId={auth.user.id} nome={nome} avatar={avatar} />
        <header className="painel__topo">
          <h1 id="ajustes-titulo" className="painel__titulo">
            <strong>Ajustes.</strong>
          </h1>
        </header>
        <AjustesDaCentral apps={direitos.filter((d) => d.direito === 'liberado').map((d) => ({ id: d.id, nome: d.nome }))} />
      </section>
    </div>
  )
}

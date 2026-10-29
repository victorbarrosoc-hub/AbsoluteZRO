import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SetPagina } from '@/components/set'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Set' }

/**
 * Set (ADR 0031): quem da equipe e dos contatos está online, e as conversas (diretas pelo @ e dos projetos). A página
 * inteira do mesmo `<zro-set>` que os apps carregam. Cada página confere a sessão por conta própria (Next 16).
 * `?projeto=<id>` abre a conversa do projeto; `?pessoa=<id>` a direta; `?ajustes` os contatos e a privacidade.
 */
export default async function SetPage() {
  await requireOrgPage()
  return (
    <div className="page set-pagina">
      <div className="page-head__text">
        <h1>
          <span className="set-pagina__fino">Quem está no</span> Set
        </h1>
        <p>Sua equipe e seus contatos, em qualquer app da Absolute ZRO.</p>
      </div>
      <Suspense>
        <SetPagina />
      </Suspense>
    </div>
  )
}

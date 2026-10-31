import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { areasDoPapel, inicioDoConsole, papelNoConsole, type PapelConsole } from '@zro/core'
import { AdminNav } from '@/components/admin/admin-nav'
import { Wordmark } from '@/components/brand'
import { Icon } from '@/components/icons'
import { Transicao } from '@/components/movimento'
import { ThemeToggle } from '@/components/theme-toggle'
import { requirePageAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

const TAG: Record<PapelConsole, { texto: string; dica: string }> = {
  admin: { texto: 'Console', dica: 'Pode mudar planos, acessos, contas e papéis.' },
  support: { texto: 'Console · leitura', dica: 'Vê tudo, não muda nada.' },
  financeiro: { texto: 'Console · financeiro', dica: 'Custos, planos e a caixa financeiro@.' },
}

/**
 * Console isolado: só papel de plataforma. Para quem não tem, a rota não existe (404). O menu mostra só as áreas do
 * papel (ADR 0034); cada página confere de novo por conta própria.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await requirePageAuth()
  const papel = papelNoConsole(auth)
  if (!papel) notFound()
  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-side__brand">
          <Wordmark href={inicioDoConsole(papel)!} height={18} />
          <span className="adm-side__tag" title={TAG[papel].dica}>
            {TAG[papel].texto}
          </span>
        </div>
        <AdminNav areas={areasDoPapel(papel)} />
        <div className="adm-side__foot">
          <Link href="/inicio" className="adm-side__back">
            <Icon name="home" />
            <span>Voltar ao HUB</span>
          </Link>
          <ThemeToggle />
        </div>
      </aside>
      <main id="conteudo" className="adm-main">
        <Transicao>{children}</Transicao>
      </main>
    </div>
  )
}

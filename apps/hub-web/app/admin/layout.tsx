import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/admin-nav'
import { Wordmark } from '@/components/brand'
import { Icon } from '@/components/icons'
import { Transicao } from '@/components/movimento'
import { ThemeToggle } from '@/components/theme-toggle'
import { requirePageAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Console isolado: só papel de plataforma. Para quem não tem, a rota não existe (404). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await requirePageAuth()
  if (!auth.user.platformRole || !auth.user.emailVerified) notFound()
  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-side__brand">
          <Wordmark href="/admin" height={18} />
          <span className="adm-side__tag" title={auth.user.platformRole === 'admin' ? 'Pode mudar planos, acessos e contas.' : 'Vê tudo, não muda nada.'}>
            {auth.user.platformRole === 'admin' ? 'Console' : 'Console · leitura'}
          </span>
        </div>
        <AdminNav isAdmin={auth.user.platformRole === 'admin'} />
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

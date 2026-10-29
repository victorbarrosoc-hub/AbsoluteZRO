import type { Metadata } from 'next'
import { productAccessFor, type ProductAccess } from '@zro/billing'
import { authorize } from '@zro/core'
import { adapterFor } from '@zro/integrations'
import { AppTile } from '@/components/app-tile'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Ferramentas' }

function HubDoes({ p }: { p: ProductAccess }) {
  const a = p.access === 'closed' ? null : adapterFor(p.productId)
  if (!a) return null
  return (
    <details className="disclosure">
      <summary>O que o HUB faz com {p.name}</summary>
      <ul className="list-plain">
        {a.hubCan.map((x) => (
          <li key={x}>✓ {x}</li>
        ))}
        {a.notYet.map((x) => (
          <li key={x} className="zro-faint">
            ○ Ainda não: {x}
          </li>
        ))}
      </ul>
      <p className="zro-faint">Estratégia: {a.strategy}</p>
    </details>
  )
}

export default async function Ferramentas() {
  const auth = await requireOrgPage()
  const actor = await authorize(db(), auth)
  const access = await db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId))
  const groups: [string, ProductAccess[]][] = [
    ['Contratadas', access.filter((a) => a.access === 'contracted')],
    ['Disponíveis para contratar', access.filter((a) => a.access === 'available')],
    // fechado pelo gate de lançamento (ADR 0023) aparece aqui com o selo, sem Abrir nem Instalar
    ['Em desenvolvimento', access.filter((a) => a.access === 'coming_soon' || a.access === 'closed')],
  ]
  return (
    <div className="page">
      <header className="greet">
        <p className="zro-eyebrow">Suíte Absolute ZRO</p>
        <h1>Ferramentas</h1>
        <p className="zro-mute">Cada marca continua com o próprio app e login. O HUB liga os dados pelo projeto, sem expor nada do que não foi contratado.</p>
      </header>
      {groups.map(([title, items]) => (
        <section key={title} className="section" aria-label={title}>
          <div className="section-bar">
            <h2>{title}</h2>
            <span className="zro-faint">{items.length}</span>
          </div>
          {items.length ? (
            <div className="app-grid app-grid--wide">
              {items.map((p) => (
                <AppTile key={p.productId} p={p}>
                  <HubDoes p={p} />
                </AppTile>
              ))}
            </div>
          ) : (
            <p className="zro-faint">Nenhuma.</p>
          )}
        </section>
      ))}
    </div>
  )
}

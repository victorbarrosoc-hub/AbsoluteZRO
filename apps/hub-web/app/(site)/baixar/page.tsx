import type { Metadata } from 'next'
import { appsParaBaixar, DownloadsIntro } from '@/components/download-catalog'
import { DownloadPicker } from '@/components/download-picker'
import { InstalarHub } from '@/components/instalar-hub'
import { OsHint } from '@/components/os-hint'
import { publicCatalog } from '@/lib/data/catalog'
import { disponibilidade } from '@/lib/hub-desktop-release'

export const metadata: Metadata = { title: 'Downloads' }
export const dynamic = 'force-dynamic'

export default async function Baixar({ searchParams }: { searchParams: Promise<{ hub?: string }> }) {
  const [{ products }, hub, q] = await Promise.all([publicCatalog(), disponibilidade(), searchParams])
  return (
    <section className="section section--page dl-page" aria-label="Downloads">
      <OsHint />
      <DownloadsIntro heading="h1" hub={hub} aviso={q.hub === 'indisponivel'} />
      <InstalarHub />
      <DownloadPicker apps={appsParaBaixar(products.map((p) => ({ id: p.id as string, name: p.name as string, role: p.role_in_flow as string })))} />
    </section>
  )
}

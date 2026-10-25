import type { Metadata } from 'next'
import { DownloadCatalog, DownloadsIntro } from '@/components/download-catalog'
import { OsHint } from '@/components/os-hint'
import { publicCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Downloads' }
export const dynamic = 'force-dynamic'

export default async function Baixar() {
  const { products } = await publicCatalog()
  return (
    <section className="section section--page dl-page" aria-label="Downloads">
      <OsHint />
      <DownloadsIntro heading="h1" />
      <DownloadCatalog
        products={products.map((p) => ({
          id: p.id as string,
          name: p.name as string,
          role: p.role_in_flow as string,
          provisional: !!p.provisional_name,
        }))}
      />
    </section>
  )
}

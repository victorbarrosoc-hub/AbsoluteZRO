import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { appOrigin } from '@/lib/env'
import './globals.css'

const description = 'O futuro começa do zero. Uma conta para todas as ferramentas, do job à entrega.'

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin),
  title: { default: 'Absolute ZRO', template: '%s · Absolute ZRO' },
  description,
  applicationName: 'Absolute ZRO',
  robots: { index: false, follow: false },
  // A imagem vem de app/opengraph-image.jpg e app/twitter-image.jpg (arte em scripts/marca).
  openGraph: { type: 'website', locale: 'pt_BR', siteName: 'Absolute ZRO', title: 'Absolute ZRO', description },
  twitter: { card: 'summary_large_image', title: 'Absolute ZRO', description },
  appleWebApp: { capable: true, title: 'Absolute ZRO', statusBarStyle: 'black' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = { themeColor: '#f4f4f6', width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get('zro_theme')?.value
  // Claro é o tema da casa; o escuro é escolha de quem usa o seletor (fica no cookie).
  const theme = saved === 'dark' ? 'dark' : 'light'
  return (
    <html lang="pt-BR" data-theme={theme} suppressHydrationWarning>
      <body>
        <a className="zro-skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  )
}

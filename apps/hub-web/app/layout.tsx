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

export const viewport: Viewport = { themeColor: '#050505', width: 'device-width', initialScale: 1 }

/** Sem escolha salva, segue o sistema antes da primeira pintura (sem piscar). */
const FOLLOW_SYSTEM = `try{if(!document.documentElement.dataset.theme){var l=matchMedia('(prefers-color-scheme: light)').matches;document.documentElement.dataset.theme=l?'light':'dark'}}catch(e){}`

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get('zro_theme')?.value
  const theme = saved === 'light' || saved === 'paper' ? 'light' : saved === 'dark' ? 'dark' : undefined
  return (
    <html lang="pt-BR" data-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOLLOW_SYSTEM }} />
      </head>
      <body>
        <a className="zro-skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  )
}

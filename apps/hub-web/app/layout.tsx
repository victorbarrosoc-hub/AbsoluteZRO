import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Absolute ZRO', template: '%s · Absolute ZRO' },
  description: 'Da oportunidade à entrega. Um só fluxo: contratação, roteiro, backup, organização, edição, som e finalização.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#0e0e10', width: 'device-width', initialScale: 1 }

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

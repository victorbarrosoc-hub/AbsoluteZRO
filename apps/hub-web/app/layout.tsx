import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Absolute ZRO', template: '%s · Absolute ZRO' },
  description: 'Da oportunidade à entrega. Um só fluxo: contratação, roteiro, backup, organização, edição, som e finalização.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#050505', width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get('zro_theme')?.value === 'paper' ? 'paper' : 'dark'
  return (
    <html lang="pt-BR" data-theme={theme}>
      <body>
        <a className="zro-skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  )
}

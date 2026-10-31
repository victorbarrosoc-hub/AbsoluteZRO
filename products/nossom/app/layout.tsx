import type { Metadata, Viewport } from 'next';
import './globals.css';
import BrandIntro from '@/components/brand-intro';
export const metadata: Metadata = {
  metadataBase: new URL('https://nossom.absolutezro.com'),
  title: { default: 'NOSSOM — O som em outra escala.', template: '%s · NOSSOM' },
  description:
    'Do áudio gravado ao áudio pronto para entregar. Trate, mixe e finalize seu som em um estúdio que acompanha o seu fluxo.',
  applicationName: 'NOSSOM',
  other: { 'nossom-release': process.env.VERCEL_GIT_COMMIT_SHA || 'development' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'NOSSOM', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/pwa/icon-64.png?v=4', sizes: '64x64', type: 'image/png' }],
    apple: [{ url: '/pwa/icon-180.png?v=4', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'NOSSOM',
    title: 'NOSSOM — O som em outra escala.',
    description:
      'Crie, trate e entregue seu áudio. Seu estúdio com inteligência artificial, em um só lugar.',
    url: 'https://nossom.absolutezro.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NOSSOM — O som em outra escala.',
    description: 'Crie, trate e entregue seu áudio. Tudo acontece no som.',
    images: ['/opengraph-image?v=5'],
  },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080e16',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The intro script marks <html> before hydration.
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <BrandIntro />
        <noscript>
          <style>{'.ns-reveal { opacity: 1 !important; transform: none !important; }'}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/archivo/wdth.css';
import './globals.css';
import BrandIntro from '@/components/brand-intro';
import PlayerBar from '@/components/player-bar';
export const metadata: Metadata = {
  metadataBase: new URL('https://quasar.absolutezro.com'),
  title: { default: 'Quasar Audio Lab — Do ruído ao pronto.', template: '%s · Quasar' },
  description:
    'Do áudio gravado ao áudio pronto para entregar. Trate, mixe e finalize seu som em um estúdio que acompanha o seu fluxo.',
  applicationName: 'Quasar Audio Lab',
  other: { 'nossom-release': process.env.VERCEL_GIT_COMMIT_SHA || 'development' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Quasar', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/pwa/icon-64.png?v=5', sizes: '64x64', type: 'image/png' }],
    apple: [{ url: '/pwa/icon-180.png?v=5', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Quasar Audio Lab',
    title: 'Quasar Audio Lab — Do ruído ao pronto.',
    description:
      'Crie, trate e entregue seu áudio. Seu estúdio com inteligência artificial, em um só lugar.',
    url: 'https://quasar.absolutezro.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quasar Audio Lab — Do ruído ao pronto.',
    description: 'Crie, trate e entregue seu áudio. O som encontrando o seu espaço.',
    images: ['/opengraph-image?v=6'],
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
        <PlayerBar />
      </body>
    </html>
  );
}

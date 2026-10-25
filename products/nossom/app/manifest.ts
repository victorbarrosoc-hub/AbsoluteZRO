import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NOSSOM — Seu estúdio de áudio',
    short_name: 'NOSSOM',
    description: 'Crie, trate e entregue seu áudio. Tudo acontece no som.',
    lang: 'pt-BR',
    start_url: '/studio',
    scope: '/',
    display: 'standalone',
    background_color: '#080e16',
    theme_color: '#080e16',
    icons: [
      { src: '/pwa/icon-192.png?v=4', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png?v=4', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png?v=4', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

import type { MetadataRoute } from 'next'

/** "Adicionar à Tela de Início" (Safari/iPhone) e instalação como app (Chrome/Edge). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Absolute ZRO',
    short_name: 'Absolute ZRO',
    description: 'Uma conta para todas as ferramentas da Absolute ZRO.',
    lang: 'pt-BR',
    start_url: '/inicio',
    scope: '/',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#050505',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

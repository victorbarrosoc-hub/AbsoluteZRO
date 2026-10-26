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
    // tema claro é o padrão da marca: a abertura do app instalado já nasce clara
    background_color: '#fcfbfc',
    theme_color: '#fcfbfc',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // atalho no ícone (Android e computador): direto para os apps
    shortcuts: [{ name: 'Apps', short_name: 'Apps', url: '/downloads', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] }],
  }
}

import type { NextConfig } from 'next'

const security = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  ...(process.env.ZRO_ENV === 'production' || (!process.env.ZRO_ENV && process.env.VERCEL_ENV === 'production')
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
]

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
  experimental: {
    // Troca de tela na hora (pedido do titular, 29/10/2026): a pré-busca inteira (intenção no menu) vale 60 s (o padrão
    // é 5 min). A tela visitada NÃO fica guardada (dynamic 0): com 30 s, o login único reaproveitava a tela de
    // /entrar, /criar-conta e /oauth/authorize no meio do fluxo. Login, saída, troca de organização e consentimento
    // limpam o cache do roteador (lib/actions/ir.ts).
    staleTimes: { dynamic: 0, static: 60 },
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      // o painel da IA (<zro-ia>) e as imagens do Z são carregados pelas plataformas, de outra origem: script módulo e
      // máscara CSS só funcionam com CORS. Arquivos públicos e estáticos, sem credencial.
      {
        source: '/ia/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      // o painel (zro-ia.js e o digitando.js que ele importa) muda no mesmo endereço: o navegador confere a cada carga,
      // e todas as plataformas recebem a versão nova (VERSAO, no data-versao do elemento) sem trocar o link.
      { source: '/ia/v1/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
    ]
  },
}

export default config

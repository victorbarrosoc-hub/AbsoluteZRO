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
    // Troca de tela na hora (pedido do titular, 29/10/2026): o roteador guarda a tela visitada por 30 s e a pré-busca
    // inteira (intenção no menu) por 60 s. O cache é deste navegador e desta sessão; toda Server Action com
    // revalidatePath o limpa (login, saída, troca de organização e consentimento: lib/actions/ir.ts).
    staleTimes: { dynamic: 30, static: 60 },
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
    ]
  },
}

export default config

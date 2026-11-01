import type { NextConfig } from 'next'
import { cabecalhosTesteDrive, CSP_BASE, ROTA_TESTE_DRIVE } from './lib/teste-drive/config'

const security = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: CSP_BASE },
  ...(process.env.ZRO_ENV === 'production' || (!process.env.ZRO_ENV && process.env.VERCEL_ENV === 'production')
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
]

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Correio do console (ADR 0034): imapflow (pino com require dinâmico), nodemailer e mailparser rodam como pacote do Node.
  serverExternalPackages: ['postgres', 'imapflow', 'nodemailer', 'mailparser'],
  experimental: {
    // Troca de tela na hora (pedido do titular, 29/10/2026): a pré-busca inteira (intenção no menu) vale 60 s (o padrão
    // é 5 min). A tela visitada NÃO fica guardada (dynamic 0): com 30 s, o login único reaproveitava a tela de
    // /entrar, /criar-conta e /oauth/authorize no meio do fluxo. Login, saída, troca de organização e consentimento
    // limpam o cache do roteador (lib/actions/ir.ts).
    staleTimes: { dynamic: 0, static: 60 },
  },
  async redirects() {
    return [
      // O endereço oficial é absolutezro.com (revisão de 01/11/2026): o da Vercel leva as páginas para lá, com o mesmo
      // caminho. API, login único (/oauth, .well-known) e os arquivos do Next ficam: webhook e cliente OIDC de servidor
      // nem sempre seguem redirecionamento.
      {
        source: '/:caminho((?!api/|oauth/|\\.well-known/|_next/).*)',
        has: [{ type: 'host', value: 'absolutezro.vercel.app' }],
        destination: 'https://absolutezro.com/:caminho',
        permanent: true,
      },
      // endereços que as pessoas digitam: a conta se cria em /criar-conta e o contato é por e-mail
      { source: '/cadastro', destination: '/criar-conta', permanent: true },
      { source: '/contato', destination: 'mailto:contato@absolutezro.com', permanent: false },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      // Laboratório da Z (ADR 0033, só admin): o microfone vale nesta tela (voz e ditado), e só nela. Vem depois da regra
      // geral, então vence.
      {
        source: '/admin/laboratorio/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()' }],
      },
      {
        source: '/admin/laboratorio',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()' }],
      },
      // Teste do Drive (só admin): os scripts, as chamadas e o quadro do Google (Identity Services, Picker, API do Drive)
      // valem nesta tela, e só nela. Também vem depois da regra geral.
      { source: ROTA_TESTE_DRIVE, headers: cabecalhosTesteDrive({ dev: process.env.NODE_ENV !== 'production' }) },
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
      // o Set (<zro-set>, ADR 0032): o mesmo script em todas as plataformas, carregado de outra origem; muda no mesmo
      // endereço (VERSAO no data-versao). A API não tem CORS: cada app repassa pelo próprio servidor.
      {
        source: '/set/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ]
  },
}

export default config

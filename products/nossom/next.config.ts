import type { NextConfig } from 'next';
const config: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  // o cartão de compartilhamento mora fora de public/ (produto fechado); a rota que o lê precisa dele no pacote
  outputFileTracingIncludes: { '/opengraph-image': ['./marca-fechada/**'] },
  // o endereço antigo leva ao novo (Quasar Audio Lab, 01/11/2026); o login segue o endereço de quem chega
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'nossom.absolutezro.com' }],
        destination: 'https://quasar.absolutezro.com/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self)' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://absolutezro.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://absolutezro.com; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' blob: https://*.supabase.co https://api.elevenlabs.io wss://api.elevenlabs.io https://*.livekit.cloud wss://*.livekit.cloud; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
export default config;

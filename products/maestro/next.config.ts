import type { NextConfig } from "next";

/**
 * Maestro (products/maestro). Nada de imagem remota, nada de rota mágica: cabeçalhos de segurança e só.
 * O painel da Z vem de https://absolutezro.com/ia/v1/zro-ia.js (módulo público da Absolute ZRO).
 */
const cabecalhos = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default nextConfig;

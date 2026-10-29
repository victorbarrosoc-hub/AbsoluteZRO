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

/**
 * CSP das telas de revisão (plano v2 §4.1 e §4.4): abre só o que os players precisam. YouTube (IFrame API, sem cookie),
 * Vimeo (Player SDK) e Drive em iframe; vídeo direto, Dropbox, HLS e o Drive pela API do Google em `media-src https:`
 * (o HLS busca os pedaços por XHR e usa worker em blob). O Next precisa de script inline (hidratação); em
 * desenvolvimento, também de eval.
 */
const dev = process.env.NODE_ENV !== "production";
function csp(extrasScript: string[] = []): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://www.youtube.com https://s.ytimg.com https://player.vimeo.com ${extrasScript.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://drive.google.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // O logo da marca sobe por Server Action (até 4 MB; o servidor reencoda e grava no máximo 512 KB).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    // Troca de seção na hora (pedido do titular, 29/10/2026): o roteador guarda a seção visitada por 30 s e a
    // pré-busca inteira (intenção na cápsula, abas do celular) por 60 s. O cache é deste navegador e desta sessão; toda
    // Server Action com revalidatePath o limpa, e o Quadro pergunta "o que mudou" ao abrir.
    staleTimes: { dynamic: 30, static: 60 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: cabecalhos },
      // A tela da equipe (a navegação no app segue com esta CSP, por isso a Z entra no script-src).
      { source: "/app/aprovacoes/:path*", headers: [{ key: "Content-Security-Policy", value: csp(["https://absolutezro.com"]) }] },
      // O link do cliente: fora da busca, sem cache, a origem só (a chave do Google confere o domínio) e a CSP.
      {
        source: "/a/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp() },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "strict-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      // Os links públicos da produtora (plano v2 §4.4): pedido (/p) e orçamento (/o). Sem player: nada de frame.
      ...["/p/:path*", "/o/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: csp() },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "strict-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      })),
      {
        source: "/api/publico/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "strict-origin" },
        ],
      },
      {
        source: "/api/link/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "strict-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

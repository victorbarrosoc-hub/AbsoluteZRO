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
 * O app do SOBEDESCE embutido em Arquivos (o mesmo valor de `SOBEDESCE_ORIGEM` em src/lib/sobedesce/embutido.ts; o
 * teste tests/sobedesce-embutido.test.mts confere). Só a CSP da equipe abre o quadro; os links públicos, nunca.
 */
const SOBEDESCE_ORIGEM = "https://sobedesce.absolutezro.com";

/**
 * CSP das telas de revisão (plano v2 §4.1 e §4.4): abre só o que os players precisam. YouTube (IFrame API, sem cookie),
 * Vimeo (Player SDK) e Drive em iframe; vídeo direto, Dropbox, HLS e o Drive pela API do Google em `media-src https:`
 * (o HLS busca os pedaços por XHR e usa worker em blob). O Next precisa de script inline (hidratação); em
 * desenvolvimento, também de eval.
 */
const dev = process.env.NODE_ENV !== "production";
function csp(extrasScript: string[] = [], extrasFrame: string[] = []): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://www.youtube.com https://s.ytimg.com https://player.vimeo.com ${extrasScript.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    `frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://drive.google.com ${extrasFrame.join(" ")}`.trim(),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * CSP do link do Fluxo (`/f`, Criação F6): só leitura, sem player e sem frame; imagens e dados só da própria origem.
 * O token está no endereço, então nada de Referer para fora (`no-referrer`).
 */
const cspFluxo = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Token do link do Fluxo (32 bytes em base64url) no `source` das reescritas. */
const TOKEN_F = "[A-Za-z0-9_\\-]{43}";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // O link do Fluxo para IA que lê endereço: /f/<token>.md e /f/<token>.json. Antes das páginas (senão a página
  // /f/[token] pegaria "<token>.md" como token).
  async rewrites() {
    return {
      beforeFiles: [
        { source: `/f/:token(${TOKEN_F})\\.md`, destination: "/f/:token/fluxo.md" },
        { source: `/f/:token(${TOKEN_F})\\.json`, destination: "/f/:token/fluxo.json" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // O logo da marca sobe por Server Action (até 4 MB; o servidor reencoda e grava no máximo 512 KB).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    // Troca de seção na hora (pedido do titular, 29/10/2026): o roteador guarda a seção visitada por 30 s e a
    // pré-busca inteira (intenção na cápsula, abas do celular) por 60 s. O cache é deste navegador e desta sessão; toda
    // Server Action daqui chama revalidatePath (que o limpa), o login e a saída são rotas (página inteira), e o Quadro
    // pergunta "o que mudou" ao abrir. Ação nova que redireciona sem revalidatePath reaproveitaria a tela guardada.
    staleTimes: { dynamic: 30, static: 60 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: cabecalhos },
      // A tela da equipe (a navegação no app segue com esta CSP, por isso a Z entra no script-src e o SOBEDESCE embutido
      // de Arquivos no frame-src: src/lib/sobedesce/embutido.ts).
      {
        source: "/app/aprovacoes/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp(["https://absolutezro.com"], [SOBEDESCE_ORIGEM]) }],
      },
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
      // Os links públicos da produtora (plano v2 §4.4): pedido (/p), orçamento (/o) e o convite do freela (/convite). Sem player.
      ...["/p/:path*", "/o/:path*", "/convite/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: csp() },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "strict-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      })),
      // O link do Fluxo (Criação F6): página só de leitura, .md, .json e imagens pelo token.
      {
        source: "/f/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspFluxo },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
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

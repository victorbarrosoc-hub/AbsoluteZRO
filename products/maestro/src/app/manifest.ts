import type { MetadataRoute } from "next";
import { SITE_NOME } from "@/lib/site";

/**
 * O Maestro como app na Tela de Início (Safari: Compartilhar › Adicionar à Tela de Início; Android: Instalar app).
 * Abre direto no app (/app), sem a barra do navegador. Cores do tema claro (o padrão da casa, `--bg` em globals.css);
 * no escuro a barra segue o `theme-color` do layout, que lê o tema escolhido. Ícones de src/app/icon.svg
 * (scripts/icones-pwa.mjs); o do iPhone é src/app/apple-icon.png (180 px).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: SITE_NOME,
    short_name: SITE_NOME,
    description: "A produtora inteira num lugar só.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f3ee",
    theme_color: "#f7f3ee",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icone-mascaravel-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

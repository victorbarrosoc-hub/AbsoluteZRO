import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Só a página inicial é pública para a busca; o app, o login, a API e o link do Fluxo (`/f`, que ainda leva noindex
 * na página e no cabeçalho) ficam de fora.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/$", disallow: ["/app", "/api", "/entrar", "/sem-acesso", "/f/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

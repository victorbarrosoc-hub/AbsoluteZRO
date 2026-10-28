import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Só a página inicial é pública para a busca; o app, o login e a API ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/$", disallow: ["/app", "/api", "/entrar", "/sem-acesso"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

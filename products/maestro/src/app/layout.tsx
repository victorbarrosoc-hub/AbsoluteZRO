import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Ambiente } from "@/components/ambiente";
import { SITE_DESCRICAO, SITE_FRASE, SITE_NOME, siteUrl } from "@/lib/site";
import "@fontsource-variable/figtree";
import "@fontsource-variable/inter";
import "./globals.css";
import "./produtora.css";
import "./comercial.css";
import "./publico.css";
import "./aurora.css";
import "./negocio.css";
import "./numeros.css";
import "./equipe.css";
import "./contrato.css";
import "./marca-propria.css";
import "./celular.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_NOME, template: `%s · ${SITE_NOME}` },
  description: SITE_DESCRICAO,
  applicationName: SITE_NOME,
  // Fechado: só a página inicial pública pode ser achada (ela sobrescreve); app, login e telas de erro, não.
  robots: { index: false, follow: false },
  // A imagem vem de src/app/opengraph-image.png (convenção do Next).
  openGraph: { type: "website", locale: "pt_BR", siteName: SITE_NOME, title: `${SITE_NOME} · ${SITE_FRASE}`, description: SITE_DESCRICAO },
  twitter: { card: "summary_large_image", title: `${SITE_NOME} · ${SITE_FRASE}`, description: SITE_DESCRICAO },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#f7f3ee", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Claro é o tema da casa; o escuro é escolha de quem usa o seletor (fica no cookie).
  const salvo = (await cookies()).get("zro_theme")?.value;
  const tema = salvo === "dark" ? "dark" : "light";
  return (
    <html lang="pt-BR" data-theme={tema} suppressHydrationWarning>
      <body>
        <Ambiente />
        <a className="pular" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}

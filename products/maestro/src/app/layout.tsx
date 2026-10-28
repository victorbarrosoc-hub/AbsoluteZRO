import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SITE_DESCRICAO, SITE_NOME, siteUrl } from "@/lib/site";
import "@fontsource-variable/figtree";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_NOME, template: `%s · ${SITE_NOME}` },
  description: SITE_DESCRICAO,
  applicationName: SITE_NOME,
  // Nasce fechado: nada de indexar.
  robots: { index: false, follow: false },
  openGraph: { type: "website", locale: "pt_BR", siteName: SITE_NOME, title: SITE_NOME, description: SITE_DESCRICAO },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#f4f4f6", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Claro é o tema da casa; o escuro é escolha de quem usa o seletor (fica no cookie).
  const salvo = (await cookies()).get("zro_theme")?.value;
  const tema = salvo === "dark" ? "dark" : "light";
  return (
    <html lang="pt-BR" data-theme={tema} suppressHydrationWarning>
      <body>
        <a className="pular" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}

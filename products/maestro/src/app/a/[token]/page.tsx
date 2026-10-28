import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ipDe } from "@/lib/http";
import { hashToken } from "@/lib/auth/cripto";
import { abrirLink } from "@/lib/revisao/link";
import { AprovacaoCliente, LinkNeutro, PedirPin } from "@/components/revisao/aprovar";
import "../../revisao.css";

/** Fora da busca e sem o nome de ninguém no título: quem recebe o link já sabe de quem é. */
export const metadata: Metadata = {
  title: { absolute: "Aprovação" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "strict-origin",
};

/**
 * A página do cliente (plano v2 §4.3): sem conta, pelo link do lote. Tudo passa pela porta estreita (`abrirLink`):
 * link desconhecido, revogado, vencido ou de lote fechado dá a mesma tela neutra.
 */
export default async function PaginaDoCliente({ params }: PageProps<"/a/[token]">) {
  const { token } = await params;
  const jar = await cookies();
  const r = await abrirLink(token, { get: (n) => jar.get(n)?.value }, ipDe(await headers())).catch(() => ({ estado: "morto" as const }));
  if (r.estado === "morto") return <LinkNeutro />;
  if (r.estado === "limite") return <LinkNeutro limite />;
  if (r.estado === "pin") return <PedirPin token={token} />;
  return <AprovacaoCliente token={token} dados={r.dados} chave={hashToken(token).slice(0, 12)} />;
}

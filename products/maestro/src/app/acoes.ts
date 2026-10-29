"use server";
/**
 * Ação pública da página inicial: "Quero acesso". Sem sessão (é para quem ainda não entra). O Next confere a origem
 * das Server Actions; o resto (armadilha, limite, porta estreita do banco) fica em lib/lista-espera.ts.
 */
import { headers } from "next/headers";
import { ipDe } from "@/lib/http";
import { entrarNaListaDeEspera } from "@/lib/lista-espera";

export type EstadoEspera =
  | { feito: true }
  | { feito?: false; erros?: { email?: string; consentimento?: string }; mensagem?: string; valores?: { email: string; nome: string } }
  | undefined;

export async function queroAcesso(_: EstadoEspera, fd: FormData): Promise<EstadoEspera> {
  const valores = { email: String(fd.get("email") ?? "").slice(0, 300), nome: String(fd.get("nome") ?? "").slice(0, 120) };
  try {
    const r = await entrarNaListaDeEspera({
      ...valores,
      consentimento: fd.get("consentimento") === "sim",
      armadilha: String(fd.get("site") ?? ""),
      ip: ipDe(await headers()),
    });
    if (r.ok) return { feito: true };
    return { erros: r.erros, mensagem: r.mensagem, valores };
  } catch {
    return { mensagem: "Não deu para guardar agora. Tente de novo em instantes ou escreva para contato@absolutezro.com.", valores };
  }
}

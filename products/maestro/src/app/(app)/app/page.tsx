import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { ENTRADA } from "@/lib/entrada";

/** /app: a entrada (decisão do titular, 29/10/2026): sempre o Hoje, nunca a Z (src/lib/entrada.ts). */
export default async function Entrada() {
  await exigirAcessoNaPagina("/app");
  redirect(ENTRADA);
}

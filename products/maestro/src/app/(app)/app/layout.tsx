import type { ReactNode } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { ROTAS } from "@/lib/site";
import { Shell } from "@/components/shell";

/** O shell confere a sessão por conta própria; cada página também (layout e página renderizam em paralelo no Next 16). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const sessao = await exigirAcessoNaPagina(ROTAS.app);
  return <Shell sessao={sessao}>{children}</Shell>;
}

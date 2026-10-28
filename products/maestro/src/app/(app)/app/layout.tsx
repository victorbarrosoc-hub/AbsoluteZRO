import type { ReactNode } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { temDemonstracao } from "@/lib/demo/demonstracao";
import { ROTAS } from "@/lib/site";
import { Shell } from "@/components/shell";

/** O shell confere a sessão por conta própria; cada página também (layout e página renderizam em paralelo no Next 16). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const sessao = await exigirAcessoNaPagina(ROTAS.app);
  // O selo "Demonstração" é só um aviso: se a consulta falhar, o app segue sem ele.
  const demo = await temDemonstracao({ sub: sessao.sub, orgId: sessao.orgId }).catch(() => false);
  return (
    <Shell sessao={sessao} demo={demo}>
      {children}
    </Shell>
  );
}

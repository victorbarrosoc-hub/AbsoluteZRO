import type { Metadata } from "next";
import type { ReactNode } from "react";
import { exigirAcessoNaPagina, sessaoDaPagina } from "@/lib/auth/pagina";
import { temDemonstracao } from "@/lib/demo/demonstracao";
import { produtorasDoFreela } from "@/lib/freelas/area";
import { marcaPropriaDaSessao } from "@/lib/marca/propria";
import { ROTAS, SITE_NOME } from "@/lib/site";
import { Shell } from "@/components/shell";

/** Com a marca própria, a aba diz "Página · Produtora · Maestro" e o ícone é o logo da produtora. */
export async function generateMetadata(): Promise<Metadata> {
  const s = await sessaoDaPagina().catch(() => null);
  const m = s ? await marcaPropriaDaSessao(s) : null;
  if (!m) return {};
  return {
    title: { default: `${m.nome} · ${SITE_NOME}`, template: `%s · ${m.nome} · ${SITE_NOME}` },
    ...(m.logo ? { icons: { icon: m.logo, apple: m.logo } } : {}),
  };
}

/** O shell confere a sessão por conta própria; cada página também (layout e página renderizam em paralelo no Next 16). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const sessao = await exigirAcessoNaPagina(ROTAS.app);
  // O selo "Demonstração" é só um aviso: se a consulta falhar, o app segue sem ele.
  // A área do freela (drizzle/0037): quem também é freela ligado em outra produtora ganha o atalho para "Seus trabalhos".
  const [demo, marca, freela] = await Promise.all([
    temDemonstracao({ sub: sessao.sub, orgId: sessao.orgId }).catch(() => false),
    marcaPropriaDaSessao(sessao),
    produtorasDoFreela(sessao.sub)
      .then((p) => p.length > 0)
      .catch(() => false),
  ]);
  return (
    <Shell sessao={sessao} demo={demo} marca={marca} freela={freela}>
      {children}
    </Shell>
  );
}

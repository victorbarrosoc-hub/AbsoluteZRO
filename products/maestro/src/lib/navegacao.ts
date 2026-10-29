/** As seções do Maestro (dados puros: servem à barra lateral, à barra de baixo e à página "Mais"). */
import type { NomeIcone } from "@/components/icones";
import type { Acessos, Area } from "./acessos";

/** `area`: a seção inteira é de uma área sensível (src/lib/acessos.ts); quem não tem a área nem vê o item. */
export type Aba = { href: string; nome: string; icone: NomeIcone; curto?: string; area?: Area };
export type Grupo = { nome: string | null; abas: Aba[] };

export const GRUPOS: Grupo[] = [
  {
    nome: "Produção",
    abas: [
      { href: "/app/hoje", nome: "Hoje", icone: "hoje" },
      { href: "/app/quadro", nome: "Quadro", icone: "quadro" },
      { href: "/app/aprovacoes", nome: "Aprovações", icone: "aprovacoes", curto: "Aprovar" },
      { href: "/app/projetos", nome: "Projetos", icone: "projetos" },
      { href: "/app/arquivos", nome: "Arquivos", icone: "arquivos" },
      { href: "/app/agenda", nome: "Agenda", icone: "agenda" },
    ],
  },
  {
    nome: "Comercial",
    abas: [
      { href: "/app/pedidos", nome: "Pedidos", icone: "pedidos" },
      { href: "/app/orcamentos", nome: "Orçamentos", icone: "orcamento", area: "orcamentos" },
      { href: "/app/clientes", nome: "Clientes", icone: "clientes" },
    ],
  },
  {
    nome: "Operação",
    abas: [
      { href: "/app/freelas", nome: "Freelas", icone: "freelas" },
      { href: "/app/inventario", nome: "Inventário", icone: "inventario" },
    ],
  },
  { nome: "Dinheiro", abas: [{ href: "/app/financeiro", nome: "Financeiro", icone: "dinheiro", area: "financeiro" }] },
];

export const AJUSTES: Aba = { href: "/app/ajustes", nome: "Ajustes", icone: "ajustes" };

/**
 * A Z (decisão do titular, 29/10/2026; PRD Maestro v1.1: "presença discreta contextual; central de comando no HUB"):
 * não é a primeira aba nem fica na barra do celular. Ícone discreto no fim da cápsula, no topo do celular e em "Mais".
 */
export const Z: Aba = { href: "/app/z", nome: "Z", icone: "z" };

/** Todas as abas, na ordem da cápsula (Hoje primeiro; Ajustes e a Z, discretos, no fim): dá o sentido da troca. */
export const ABAS: Aba[] = [...GRUPOS.flatMap((g) => g.abas), AJUSTES, Z];

/** A barra de baixo do celular (plano v2 §3): o dia a dia (Hoje, Quadro, Aprovações) e "Mais" (todas as seções). */
export const MAIS: Aba = { href: "/app/mais", nome: "Mais", icone: "grade" };
const aba = (href: string) => ABAS.find((a) => a.href === href)!;
export const BARRA: Aba[] = [aba("/app/hoje"), aba("/app/quadro"), aba("/app/aprovacoes"), MAIS];

/** As seções que a pessoa vê (sem link morto: quem não tem a área não vê o item; grupo vazio some). */
export function gruposPara(acessos: Acessos): Grupo[] {
  return GRUPOS.map((g) => ({ ...g, abas: g.abas.filter((a) => !a.area || acessos[a.area]) })).filter((g) => g.abas.length > 0);
}

/** Os endereços escondidos para esta pessoa (a cápsula, que roda no navegador, recebe só isto). */
export function abasOcultas(acessos: Acessos): string[] {
  return ABAS.filter((a) => a.area && !acessos[a.area]).map((a) => a.href);
}

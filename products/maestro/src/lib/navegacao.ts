/** As seções do Maestro (dados puros: servem à barra lateral, à barra de baixo e à página "Mais"). */
import type { NomeIcone } from "@/components/icones";

export type Aba = { href: string; nome: string; icone: NomeIcone; curto?: string };
export type Grupo = { nome: string | null; abas: Aba[] };

export const GRUPOS: Grupo[] = [
  {
    nome: "Produção",
    abas: [
      { href: "/app/hoje", nome: "Hoje", icone: "hoje" },
      { href: "/app/quadro", nome: "Quadro", icone: "quadro" },
      { href: "/app/aprovacoes", nome: "Aprovações", icone: "aprovacoes", curto: "Aprovar" },
      { href: "/app/projetos", nome: "Projetos", icone: "projetos" },
      { href: "/app/criacao", nome: "Criação", icone: "criacao" },
      { href: "/app/arquivos", nome: "Arquivos", icone: "arquivos" },
      { href: "/app/agenda", nome: "Agenda", icone: "agenda" },
    ],
  },
  {
    nome: "Comercial",
    abas: [
      { href: "/app/pedidos", nome: "Pedidos", icone: "pedidos" },
      { href: "/app/orcamentos", nome: "Orçamentos", icone: "orcamento" },
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
  { nome: "Dinheiro", abas: [{ href: "/app/financeiro", nome: "Financeiro", icone: "dinheiro" }] },
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

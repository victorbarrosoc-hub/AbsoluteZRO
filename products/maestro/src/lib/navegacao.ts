/** As seções do Maestro (dados puros: servem à barra lateral, à barra de baixo e à página "Mais"). */
import type { NomeIcone } from "@/components/icones";

export type Aba = { href: string; nome: string; icone: NomeIcone; curto?: string };
export type Grupo = { nome: string | null; abas: Aba[] };

export const GRUPOS: Grupo[] = [
  { nome: null, abas: [{ href: "/app/z", nome: "Z", icone: "z" }] },
  {
    nome: "Produção",
    abas: [
      { href: "/app/quadro", nome: "Quadro", icone: "quadro" },
      { href: "/app/aprovacoes", nome: "Aprovações", icone: "aprovacoes", curto: "Aprovar" },
      { href: "/app/projetos", nome: "Projetos", icone: "projetos" },
      { href: "/app/agenda", nome: "Agenda", icone: "agenda" },
    ],
  },
  {
    nome: "Comercial",
    abas: [
      { href: "/app/clientes", nome: "Clientes", icone: "clientes" },
      { href: "/app/orcamentos", nome: "Orçamentos", icone: "orcamento" },
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

/** Todas as abas, na ordem da barra (a Z primeiro, Ajustes por último). */
export const ABAS: Aba[] = [...GRUPOS.flatMap((g) => g.abas), AJUSTES];

/** A barra de baixo do celular: o dia a dia e "Mais" (todas as seções). */
export const MAIS: Aba = { href: "/app/mais", nome: "Mais", icone: "grade" };
export const BARRA: Aba[] = [ABAS[0], ABAS[1], ABAS[2], ABAS[4], MAIS];

/**
 * Papéis do Maestro (decisão do proprietário, 28/10/2026): vêm da organização da Absolute ZRO por tabela fixa e são
 * reaplicados a cada login. Quem convida é a Absolute ZRO; o Maestro não tem cadastro nem papel próprio de conta.
 */
import type { Papel } from "./db/schema";

export type { Papel };

export const PAPEIS: readonly Papel[] = ["admin", "gestor", "equipe", "leitura"];

/** owner/admin → admin · manager → gestor · editor → equipe · viewer/guest (e qualquer outro) → leitura. */
export function papelDoHub(hubRole: string | null | undefined): Papel {
  switch ((hubRole ?? "").trim().toLowerCase()) {
    case "owner":
    case "admin":
      return "admin";
    case "manager":
      return "gestor";
    case "editor":
      return "equipe";
    default:
      return "leitura";
  }
}

export const NOME_DO_PAPEL: Record<Papel, string> = {
  admin: "Administração",
  gestor: "Gestão",
  equipe: "Equipe",
  leitura: "Leitura",
};

/** Quem escreve no Quadro, em clientes, projetos e lotes (o mesmo que as políticas de RLS exigem). */
export function podeEscrever(papel: Papel): boolean {
  return papel !== "leitura";
}

/** Quem tira cliente ou projeto da lista: administração e gestão (o mesmo corte da política de remoção do banco). */
export function podeRemover(papel: Papel): boolean {
  return papel === "admin" || papel === "gestor";
}

/** Quem vê e mexe no Financeiro, na tabela de preços e nos dados de pagamento dos freelas: administração e gestão. */
export function podeVerDinheiro(papel: Papel): boolean {
  return papel === "admin" || papel === "gestor";
}

/** Quem renomeia, recolore, reordena, cria e arquiva as colunas do Quadro: administração e gestão (o banco confere de novo). */
export function podeEditarColunas(papel: Papel): boolean {
  return papel === "admin" || papel === "gestor";
}

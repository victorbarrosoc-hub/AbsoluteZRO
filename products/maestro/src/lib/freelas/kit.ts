/**
 * O kit próprio do freela, a parte pura (serve à tela e ao servidor): categorias, nomes, o aluguel da escala e a conta
 * da sincronização com o inventário do Carro do Freela (`freela.inventario/1`). O banco fica em equipamentos.ts.
 */

export const CATEGORIAS_EQUIP_FREELA = [
  { k: "camera", nome: "Câmera" },
  { k: "lente", nome: "Lente" },
  { k: "audio", nome: "Áudio" },
  { k: "luz", nome: "Luz" },
  { k: "drone", nome: "Drone" },
  { k: "estabilizador", nome: "Estabilizador" },
  { k: "monitor", nome: "Monitor" },
  { k: "acessorio", nome: "Acessório" },
  { k: "outro", nome: "Outro" },
] as const;
export type CategoriaEquipFreela = (typeof CATEGORIAS_EQUIP_FREELA)[number]["k"];
export const ehCategoriaEquipFreela = (v: unknown): v is CategoriaEquipFreela => CATEGORIAS_EQUIP_FREELA.some((c) => c.k === v);
export const nomeCategoriaEquip = (k: string) => CATEGORIAS_EQUIP_FREELA.find((c) => c.k === k)?.nome ?? k;

export type OrigemEquip = "maestro" | "carro-do-freela";

export type EquipFreela = {
  id: string;
  freelaId: string;
  categoria: CategoriaEquipFreela;
  marca: string | null;
  modelo: string;
  quantidade: number;
  observacao: string | null;
  diariaCents: number | null;
  ativo: boolean;
  origem: OrigemEquip;
  origemId: string | null;
  sincronizadoEm: string | null;
};

export const nomeDoEquip = (e: Pick<EquipFreela, "marca" | "modelo" | "quantidade">) =>
  `${e.quantidade > 1 ? `${e.quantidade}× ` : ""}${[e.marca, e.modelo].filter(Boolean).join(" ")}`;

/** Aluguel da escala: diária de cada item marcado × dias (puro). */
export const aluguelDaEscala = (itens: Pick<EquipFreela, "diariaCents">[], dias: number) =>
  itens.reduce((s, i) => s + (i.diariaCents ?? 0), 0) * Math.max(1, dias);

/**
 * Espelho do contrato `freela.inventario/1` (packages/media-contracts/src/freela-inventario.ts). Sem CPF, e-mail ou
 * telefone: o freela é o `sub` da conta Absolute ZRO.
 */
export type ItemInventario = {
  id: string;
  categoria: CategoriaEquipFreela;
  marca: string | null;
  modelo: string;
  quantidade: number;
  observacao: string | null;
  diaria_cents: number | null;
  ativo: boolean;
  atualizado_em: string;
};
export type InventarioDoCarro = { schema: "freela.inventario/1"; sub: string; itens: ItemInventario[]; atualizado_em: string };

export type PlanoSincronia =
  | { ok: false; motivo: "sub" | "formato" }
  | {
      ok: true;
      inserir: (ItemInventario & { freelaId: string })[];
      atualizar: (ItemInventario & { equipId: string })[];
      desativar: string[];
    };

const igual = (a: EquipFreela, b: ItemInventario) =>
  a.categoria === b.categoria &&
  a.marca === b.marca &&
  a.modelo === b.modelo &&
  a.quantidade === b.quantidade &&
  a.observacao === b.observacao &&
  a.diariaCents === b.diaria_cents &&
  a.ativo === b.ativo;

/**
 * A conta da sincronização para UM freela: só se o `sub` do freela é o do inventário. Insere o que é novo (pelo id de
 * origem), atualiza o que mudou (o Carro manda nos itens dele), desativa o que sumiu e não toca nos itens do próprio
 * Maestro. Rodar de novo com o mesmo inventário não muda nada (idempotente).
 */
export function aplicarInventarioDoCarro(freela: { id: string; zroSub: string | null }, existentes: EquipFreela[], payload: InventarioDoCarro): PlanoSincronia {
  if (!payload || payload.schema !== "freela.inventario/1" || !Array.isArray(payload.itens)) return { ok: false, motivo: "formato" };
  if (!freela.zroSub || freela.zroSub.toLowerCase() !== String(payload.sub).toLowerCase()) return { ok: false, motivo: "sub" };
  const doCarro = existentes.filter((e) => e.freelaId === freela.id && e.origem === "carro-do-freela");
  const porOrigem = new Map(doCarro.map((e) => [e.origemId, e]));
  const vistos = new Set<string>();
  const inserir: (ItemInventario & { freelaId: string })[] = [];
  const atualizar: (ItemInventario & { equipId: string })[] = [];
  for (const item of payload.itens) {
    if (vistos.has(item.id)) continue;
    vistos.add(item.id);
    const atual = porOrigem.get(item.id);
    if (!atual) inserir.push({ ...item, freelaId: freela.id });
    else if (!igual(atual, item)) atualizar.push({ ...item, equipId: atual.id });
  }
  const desativar = doCarro.filter((e) => e.ativo && !vistos.has(e.origemId!)).map((e) => e.id);
  return { ok: true, inserir, atualizar, desativar };
}

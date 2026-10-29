/**
 * O equipamento do próprio freela (pedido do titular, 28/10/2026; drizzle/0013): o kit no perfil, o filtro do banco de
 * freelas e o que ele leva numa escala (a diária de aluguel soma ao mesmo "a pagar" da escala).
 *
 * Fonte de verdade futura: o inventário que o freela cadastra no Carro do Freela, no contrato `freela.inventario/1`
 * (packages/media-contracts), ligado pelo `sub` da Absolute ZRO. `aplicarInventarioDoCarro` é a conta pura da
 * sincronização (insere e atualiza pelo id de origem, desativa o que sumiu, idempotente, só para o freela com aquele
 * `sub`); `sincronizarInventarioDoCarro` grava pela porta de sistema. NADA chama a sincronização ainda: o Carro do Freela
 * não tem banco (docs/integration-contracts/maestro-carro-do-freela.md). Itens de lá são só leitura no Maestro.
 * Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Erros, type Res } from "@/lib/crm/comum";
import { lerReais } from "@/lib/dinheiro";
import {
  aluguelDaEscala,
  aplicarInventarioDoCarro,
  ehCategoriaEquipFreela,
  type CategoriaEquipFreela,
  type EquipFreela,
  type InventarioDoCarro,
  type OrigemEquip,
} from "./kit";

export * from "./kit";

async function veDiarias(tx: Tx, orgId: string): Promise<boolean> {
  const [r] = (await tx.execute(sql`select maestro.pode(${orgId}::uuid, 'diarias') as ve`)) as unknown as { ve: boolean }[];
  return r?.ve === true;
}

type Linha = Record<string, unknown>;
/** `ve` = a pessoa tem a área "Diárias e cachês" (src/lib/acessos.ts); sem ela, a diária do kit não sai do servidor. */
const deLinha = (r: Linha, ve = true): EquipFreela => ({
  id: r.id as string,
  freelaId: r.freela_id as string,
  categoria: r.categoria as CategoriaEquipFreela,
  marca: r.marca as string | null,
  modelo: r.modelo as string,
  quantidade: Number(r.quantidade),
  observacao: r.observacao as string | null,
  diariaCents: r.diaria_cents == null || !ve ? null : Number(r.diaria_cents),
  ativo: r.ativo as boolean,
  origem: r.origem as OrigemEquip,
  origemId: r.origem_id as string | null,
  sincronizadoEm: r.sincronizado_em ? new Date(r.sincronizado_em as string).toISOString() : null,
});

/* ───────────── perfil do freela ───────────── */

export async function listarEquipDoFreela(ctx: Contexto, freelaId: string): Promise<EquipFreela[]> {
  if (!ehUuid(freelaId)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select * from maestro.freela_equipamentos where freela_id = ${freelaId}
       order by ativo desc, array_position(array['camera','lente','audio','luz','drone','estabilizador','monitor','acessorio','outro'], categoria), marca, modelo`)) as unknown as Linha[];
    const ve = await veDiarias(tx, ctx.orgId);
    return r.map((x) => deLinha(x, ve));
  });
}

export type EntradaEquipFreela = {
  categoria: CategoriaEquipFreela;
  marca: string | null;
  modelo: string;
  quantidade: number;
  observacao: string | null;
  diariaCents: number | null;
  ativo: boolean;
};

export function validarEquipFreela(f: Record<string, string>): { ok: true; entrada: EntradaEquipFreela } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const categoria = ehCategoriaEquipFreela(f.categoria) ? f.categoria : null;
  if (!categoria) erros.categoria = "Escolha a categoria.";
  const modelo = (f.modelo ?? "").replace(/\s+/g, " ").trim();
  if (!modelo) erros.modelo = "Qual o modelo?";
  else if (modelo.length > 120) erros.modelo = "Até 120 caracteres.";
  const marca = (f.marca ?? "").replace(/\s+/g, " ").trim();
  if (marca.length > 60) erros.marca = "Até 60 caracteres.";
  const quantidade = f.quantidade ? Number(f.quantidade) : 1;
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 999) erros.quantidade = "De 1 a 999.";
  const observacao = (f.observacao ?? "").trim();
  if (observacao.length > 500) erros.observacao = "Até 500 caracteres.";
  const diaria = f.diaria?.trim() ? lerReais(f.diaria) : null;
  if (f.diaria?.trim() && (diaria == null || !(diaria >= 0))) erros.diaria = "Valor inválido.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      categoria: categoria!,
      marca: marca || null,
      modelo,
      quantidade,
      observacao: observacao || null,
      diariaCents: diaria,
      ativo: f.ativo !== "nao",
    },
  };
}

export async function gravarEquipFreela(tx: Tx, ctx: Contexto, freelaId: string, e: EntradaEquipFreela, id?: string, demo = false): Promise<string | null> {
  if (id) {
    const r = (await tx.execute(sql`
      update maestro.freela_equipamentos set categoria = ${e.categoria}, marca = ${e.marca}, modelo = ${e.modelo}, quantidade = ${e.quantidade},
             observacao = ${e.observacao}, diaria_cents = ${e.diariaCents}, ativo = ${e.ativo}
       where id = ${id} and freela_id = ${freelaId} and origem = 'maestro' returning id`)) as unknown as { id: string }[];
    return r[0]?.id ?? null;
  }
  const [r] = (await tx.execute(sql`
    insert into maestro.freela_equipamentos (org_id, freela_id, categoria, marca, modelo, quantidade, observacao, diaria_cents, ativo, demo)
    values (${ctx.orgId}, ${freelaId}, ${e.categoria}, ${e.marca}, ${e.modelo}, ${e.quantidade}, ${e.observacao}, ${e.diariaCents}, ${e.ativo}, ${demo})
    returning id`)) as unknown as { id: string }[];
  return r.id;
}

export async function salvarEquipFreela(ctx: Contexto, freelaId: string, e: EntradaEquipFreela, id?: string): Promise<Res<{ id: string }>> {
  if (!ehUuid(freelaId) || (id && !ehUuid(id))) return falha("nao_existe", "Esse equipamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await gravarEquipFreela(tx, ctx, freelaId, e, id);
      return r ? { ok: true as const, id: r } : falha("so_leitura", "Esse item vem do Carro do Freela e só muda lá.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function removerEquipFreela(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse equipamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.freela_equipamentos where id = ${id} and origem = 'maestro' returning id`);
      return r.length ? { ok: true as const } : falha("so_leitura", "Esse item vem do Carro do Freela, ou seu papel só lê.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/* ───────────── na escala ───────────── */

export type EquipDaEscala = {
  escalaId: string;
  freelaId: string;
  disponiveis: EquipFreela[];
  marcados: string[];
  /** 0 para quem não tem a área "Diárias e cachês" (`veValores` false). */
  aluguelCents: number;
  dias: number;
  veValores: boolean;
};

/** O que cada freela escalado tem e o que já marcou que leva. */
export async function equipamentosDasEscalas(ctx: Contexto, escalaIds: string[]): Promise<EquipDaEscala[]> {
  const ids = escalaIds.filter(ehUuid);
  if (!ids.length) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const esc = (await tx.execute(sql`
      select e.id, e.freela_id, e.dias, e.aluguel_cents::float8 as aluguel,
             coalesce((select json_agg(x.equipamento_id) from maestro.escala_equipamentos x where x.escala_id = e.id), '[]') as marcados
        from maestro.escalas e where e.id = any (${`{${ids.join(",")}}`}::uuid[])`)) as unknown as {
      id: string;
      freela_id: string;
      dias: number;
      aluguel: number;
      marcados: string[];
    }[];
    const freelas = [...new Set(esc.map((e) => e.freela_id))];
    const ve = await veDiarias(tx, ctx.orgId);
    const eqs = freelas.length
      ? (
          (await tx.execute(sql`
          select * from maestro.freela_equipamentos where ativo and freela_id = any (${`{${freelas.join(",")}}`}::uuid[]) order by categoria, modelo`)) as unknown as Linha[]
        ).map((x) => deLinha(x, ve))
      : [];
    return esc.map((e) => ({
      escalaId: e.id,
      freelaId: e.freela_id,
      disponiveis: eqs.filter((q) => q.freelaId === e.freela_id),
      marcados: e.marcados,
      aluguelCents: ve ? Number(e.aluguel) : 0,
      veValores: ve,
      dias: Number(e.dias),
    }));
  });
}

/** Marca o que o freela leva (só itens dele, o banco confere) e soma o aluguel ao "a pagar" da escala. */
export async function marcarEquipNaEscala(ctx: Contexto, escalaId: string, equipIds: string[], demo = false): Promise<Res<{ aluguelCents: number }>> {
  if (!ehUuid(escalaId) || equipIds.some((i) => !ehUuid(i)) || equipIds.length > 60) return falha("formato", "Escolha da lista.");
  try {
    return await getBanco().asUser(ctx, (tx) => marcarEquipNaEscalaNaTx(tx, ctx, escalaId, equipIds, demo));
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function marcarEquipNaEscalaNaTx(
  tx: Tx,
  ctx: Contexto,
  escalaId: string,
  equipIds: string[],
  _demo = false,
): Promise<Res<{ aluguelCents: number }>> {
  void _demo;
  const [e] = (await tx.execute(sql`select freela_id, dias from maestro.escalas where id = ${escalaId} for update`)) as unknown as {
    freela_id: string;
    dias: number;
  }[];
  if (!e) return falha("nao_existe", "Essa escala não existe.");
  const ids = [...new Set(equipIds)];
  const itens = ids.length
    ? ((await tx.execute(sql`
        select id, diaria_cents from maestro.freela_equipamentos
         where freela_id = ${e.freela_id} and ativo and id = any (${`{${ids.join(",")}}`}::uuid[])`)) as unknown as {
        id: string;
        diaria_cents: string | null;
      }[])
    : [];
  if (itens.length !== ids.length) return falha("vinculo", "Algum item não é deste freela ou está inativo.");
  await tx.execute(sql`delete from maestro.escala_equipamentos where escala_id = ${escalaId}`);
  for (const i of itens)
    await tx.execute(sql`
      insert into maestro.escala_equipamentos (org_id, escala_id, equipamento_id, diaria_cents) values (${ctx.orgId}, ${escalaId}, ${i.id}, ${i.diaria_cents})`);
  const aluguel = aluguelDaEscala(
    itens.map((i) => ({ diariaCents: i.diaria_cents == null ? null : Number(i.diaria_cents) })),
    Number(e.dias),
  );
  const r = await tx.execute(sql`update maestro.escalas set aluguel_cents = ${aluguel} where id = ${escalaId} returning id`);
  if (!r.length) return falha("sem_permissao", "Seu papel nesta organização só lê.");
  return { ok: true as const, aluguelCents: aluguel };
}

/* ───────────── sincronização com o Carro do Freela (pronta, desligada) ───────────── */

/**
 * Grava o inventário de um freela em todas as organizações que o têm com esse `sub` (porta de sistema: a origem é o
 * evento do HUB, sem pessoa logada). Ainda não é chamada por nada (o Carro do Freela não publica o evento).
 */
export async function sincronizarInventarioDoCarro(
  payload: InventarioDoCarro,
): Promise<{ freelas: number; inseridos: number; atualizados: number; desativados: number }> {
  const total = { freelas: 0, inseridos: 0, atualizados: 0, desativados: 0 };
  if (!ehUuid(payload?.sub)) return total;
  await getBanco().asSystem("inventário do Carro do Freela", async (tx) => {
    const freelas = (await tx.execute(sql`select id, org_id, zro_sub from maestro.freelas where zro_sub = ${payload.sub}::uuid`)) as unknown as {
      id: string;
      org_id: string;
      zro_sub: string;
    }[];
    for (const f of freelas) {
      const existentes = ((await tx.execute(sql`select * from maestro.freela_equipamentos where freela_id = ${f.id}`)) as unknown as Linha[]).map((x) =>
        deLinha(x),
      );
      const plano = aplicarInventarioDoCarro({ id: f.id, zroSub: f.zro_sub }, existentes, payload);
      if (!plano.ok) continue;
      total.freelas++;
      for (const i of plano.inserir) {
        await tx.execute(sql`
          insert into maestro.freela_equipamentos (org_id, freela_id, categoria, marca, modelo, quantidade, observacao, diaria_cents, ativo, origem, origem_id, sincronizado_em)
          values (${f.org_id}, ${f.id}, ${i.categoria}, ${i.marca}, ${i.modelo}, ${i.quantidade}, ${i.observacao}, ${i.diaria_cents}, ${i.ativo},
                  'carro-do-freela', ${i.id}, now())`);
        total.inseridos++;
      }
      for (const i of plano.atualizar) {
        await tx.execute(sql`
          update maestro.freela_equipamentos set categoria = ${i.categoria}, marca = ${i.marca}, modelo = ${i.modelo}, quantidade = ${i.quantidade},
                 observacao = ${i.observacao}, diaria_cents = ${i.diaria_cents}, ativo = ${i.ativo}, sincronizado_em = now()
           where id = ${i.equipId}`);
        total.atualizados++;
      }
      for (const id of plano.desativar) {
        await tx.execute(sql`update maestro.freela_equipamentos set ativo = false, sincronizado_em = now() where id = ${id}`);
        total.desativados++;
      }
    }
  });
  return total;
}

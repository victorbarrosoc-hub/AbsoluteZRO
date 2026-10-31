/**
 * Inventário: equipamentos, reservas por projeto/diária e período (o banco barra reserva dupla, drizzle/0009),
 * saída e retorno. Sempre como a pessoa (`asUser`, RLS).
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, padraoBusca, traduzirPg, type Erros, type Res } from "@/lib/crm/comum";
import { ehData, lerNumero, lerReais } from "@/lib/dinheiro";
import { adivinharCategoria, chaveDoEquipamento, ehCategoriaEquip, limparNome, DONOS, ESTADOS, type CategoriaEquip, type Dono, type Estado } from "./nomes";

export type EquipamentoLista = {
  id: string;
  nome: string;
  categoria: CategoriaEquip;
  marca: string | null;
  patrimonio: string | null;
  estado: Estado;
  dono: Dono;
  freela: string | null;
  kmL: number | null;
  /** Reserva que cobre hoje (fora não cancelada). */
  hoje: { projeto: string | null; fim: string } | null;
  proxima: { inicio: string; projeto: string | null } | null;
};

export async function listarEquipamentos(
  ctx: Contexto,
  hoje: string,
  o: { busca?: string; categoria?: string; estado?: string } = {},
): Promise<EquipamentoLista[]> {
  const busca = o.busca?.trim().slice(0, 100);
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select e.id, e.nome, e.categoria, e.marca, e.patrimonio, e.estado, e.dono, f.nome as freela, e.km_l::float8 as "kmL",
             (select json_build_object('projeto', p.title, 'fim', r.fim) from maestro.reservas r left join maestro.projects p on p.id = r.projeto_id
               where r.equipamento_id = e.id and r.cancelada_em is null and ${hoje}::date between r.inicio and r.fim limit 1) as hoje,
             (select json_build_object('inicio', r.inicio, 'projeto', p.title) from maestro.reservas r left join maestro.projects p on p.id = r.projeto_id
               where r.equipamento_id = e.id and r.cancelada_em is null and r.inicio > ${hoje}::date order by r.inicio limit 1) as proxima
        from maestro.equipamentos e left join maestro.freelas f on f.id = e.freela_id
       where true
         ${ehCategoriaEquip(o.categoria) ? sql`and e.categoria = ${o.categoria}` : sql``}
         ${ESTADOS.some((x) => x.k === o.estado) ? sql`and e.estado = ${o.estado}` : sql`and e.estado <> 'baixado'`}
         ${busca ? sql`and (e.nome ilike ${padraoBusca(busca)} or e.marca ilike ${padraoBusca(busca)} or e.patrimonio ilike ${padraoBusca(busca)})` : sql``}
       order by array_position(array['camera','lente','estabilizacao','audio','luz','grip','drone','monitor','edicao','acessorio','veiculo','outro'], e.categoria), e.nome
       limit 1000`);
    return r as unknown as EquipamentoLista[];
  });
}

export type Reserva = {
  id: string;
  equipamentoId: string;
  equipamento: string;
  projetoId: string | null;
  projeto: string | null;
  projetoCodigo: string | null;
  eventoId: string | null;
  evento: string | null;
  inicio: string;
  fim: string;
  saidaEm: string | null;
  retornoEm: string | null;
  notas: string | null;
};

const COLUNAS_RESERVA = sql`
  r.id, r.equipamento_id as "equipamentoId", e.nome as equipamento, r.projeto_id as "projetoId", p.title as projeto, p.code as "projetoCodigo",
  r.evento_id as "eventoId", ev.titulo as evento, r.inicio::text, r.fim::text, r.saida_em as "saidaEm", r.retorno_em as "retornoEm", r.notas
  from maestro.reservas r join maestro.equipamentos e on e.id = r.equipamento_id
  left join maestro.projects p on p.id = r.projeto_id left join maestro.eventos ev on ev.id = r.evento_id`;

export type EquipamentoFicha = EquipamentoLista & {
  modelo: string | null;
  serie: string | null;
  compraEm: string | null;
  valorCents: number | null;
  /** A pessoa tem a área "Valores do inventário". */
  veValor: boolean;
  freelaId: string | null;
  local: string | null;
  notas: string | null;
  reservas: Reserva[];
};

export async function obterEquipamento(ctx: Contexto, id: string, hoje: string): Promise<EquipamentoFicha | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [e] = (await tx.execute(sql`
      select e.*, f.nome as freela_nome, e.compra_em::text as compra_t, maestro.pode(e.org_id, 'inventario_valores') as ve_valor
        from maestro.equipamentos e left join maestro.freelas f on f.id = e.freela_id
       where e.id = ${id}`)) as unknown as Record<string, unknown>[];
    if (!e) return null;
    const reservas = (await tx.execute(sql`
      select ${COLUNAS_RESERVA} where r.equipamento_id = ${id} and r.cancelada_em is null and r.fim >= ${hoje}::date - 60 order by r.inicio`)) as unknown as Reserva[];
    const agora = reservas.find((r) => r.inicio <= hoje && hoje <= r.fim);
    const prox = reservas.find((r) => r.inicio > hoje);
    return {
      id,
      nome: e.nome as string,
      categoria: e.categoria as CategoriaEquip,
      marca: e.marca as string | null,
      modelo: e.modelo as string | null,
      serie: e.serie as string | null,
      patrimonio: e.patrimonio as string | null,
      compraEm: e.compra_t as string | null,
      // Só com a área "Valores do inventário" (src/lib/acessos.ts); o gatilho equipamentos_guarda_area segura a gravação.
      valorCents: e.valor_cents == null || !e.ve_valor ? null : Number(e.valor_cents),
      veValor: e.ve_valor === true,
      estado: e.estado as Estado,
      dono: e.dono as Dono,
      freelaId: e.freela_id as string | null,
      freela: e.freela_nome as string | null,
      local: e.local as string | null,
      kmL: e.km_l == null ? null : Number(e.km_l),
      notas: e.notas as string | null,
      hoje: agora ? { projeto: agora.projeto, fim: agora.fim } : null,
      proxima: prox ? { inicio: prox.inicio, projeto: prox.projeto } : null,
      reservas: [...reservas],
    };
  });
}

/* ───────────── escrever ───────────── */

export type EntradaEquipamento = {
  nome: string;
  categoria: CategoriaEquip;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  patrimonio: string | null;
  compraEm: string | null;
  valorCents: number | null;
  dono: Dono;
  freelaId: string | null;
  estado: Estado;
  local: string | null;
  kmL: number | null;
  notas: string | null;
};

export function validarEquipamento(f: Record<string, string>): { ok: true; entrada: EntradaEquipamento } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const nome = limparNome(f.nome ?? "");
  if (!nome) erros.nome = "Qual o equipamento?";
  const categoria = f.categoria && f.categoria !== "auto" ? f.categoria : adivinharCategoria(nome ?? "");
  if (!ehCategoriaEquip(categoria)) erros.categoria = "Escolha a categoria.";
  const t = (k: string, max: number) => {
    const v = (f[k] ?? "").trim();
    if (v.length > max) erros[k] = `Até ${max} caracteres.`;
    return v || null;
  };
  const compra = f.compraEm || null;
  if (compra && !ehData(compra)) erros.compraEm = "Data inválida.";
  const valor = lerReais(f.valor);
  if (valor !== null && !(valor >= 0)) erros.valor = "Valor inválido.";
  const dono = DONOS.some((d) => d.k === f.dono) ? (f.dono as Dono) : "produtora";
  const estado = ESTADOS.some((d) => d.k === f.estado) ? (f.estado as Estado) : "disponivel";
  const kml = lerNumero(f.kmL);
  if (kml !== null && !(kml >= 1 && kml <= 100)) erros.kmL = "Entre 1 e 100 km/L.";
  const entrada: EntradaEquipamento = {
    nome: nome ?? "",
    categoria: categoria as CategoriaEquip,
    marca: t("marca", 60),
    modelo: t("modelo", 80),
    serie: t("serie", 80),
    patrimonio: t("patrimonio", 40),
    compraEm: compra,
    valorCents: valor,
    dono,
    freelaId: dono === "freela" && ehUuid(f.freela) ? f.freela : null,
    estado,
    local: t("local", 120),
    kmL: kml,
    notas: t("notas", 2000),
  };
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, entrada };
}

export async function gravarEquipamento(tx: Tx, ctx: Contexto, e: EntradaEquipamento, id?: string, demo = false): Promise<string | null> {
  const chave = chaveDoEquipamento(e.nome);
  if (id) {
    const r = await tx.execute(sql`
      update maestro.equipamentos set nome = ${e.nome}, chave = ${chave}, categoria = ${e.categoria}, marca = ${e.marca}, modelo = ${e.modelo}, serie = ${e.serie},
             patrimonio = ${e.patrimonio}, compra_em = ${e.compraEm}, valor_cents = ${e.valorCents}, dono = ${e.dono}, freela_id = ${e.freelaId},
             estado = ${e.estado}, local = ${e.local}, km_l = ${e.kmL}, notas = ${e.notas}
       where id = ${id} returning id`);
    return r.length ? id : null;
  }
  const [r] = (await tx.execute(sql`
    insert into maestro.equipamentos (org_id, nome, chave, categoria, marca, modelo, serie, patrimonio, compra_em, valor_cents, dono, freela_id, estado, local, km_l, notas, demo)
    values (${ctx.orgId}, ${e.nome}, ${chave}, ${e.categoria}, ${e.marca}, ${e.modelo}, ${e.serie}, ${e.patrimonio}, ${e.compraEm}, ${e.valorCents}, ${e.dono},
            ${e.freelaId}, ${e.estado}, ${e.local}, ${e.kmL}, ${e.notas}, ${demo})
    returning id`)) as unknown as { id: string }[];
  return r.id;
}

export async function salvarEquipamento(ctx: Contexto, e: EntradaEquipamento, id?: string): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Esse equipamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await gravarEquipamento(tx, ctx, e, id);
      return r ? { ok: true as const, id: r } : falha("sem_permissao", "Seu papel nesta organização só lê.");
    });
  } catch (err) {
    if (codigoPg(err) === PG.unicidade) return falha("patrimonio", "Esse código de patrimônio já está em outro item.", { patrimonio: "Já usado." });
    return traduzirPg(err);
  }
}

export async function removerEquipamento(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse equipamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.equipamentos where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Só administração e gestão removem equipamentos.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/* ───────────── reservas ───────────── */

export const CONFLITO = "23P01";

export type EntradaReserva = { equipamentoId: string; projetoId: string | null; eventoId: string | null; inicio: string; fim: string; notas: string | null };

export function validarReserva(f: Record<string, string>): { ok: true; entrada: EntradaReserva } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  if (!ehUuid(f.equipamento)) erros.equipamento = "Escolha o equipamento.";
  if (!ehData(f.inicio)) erros.inicio = "Escolha a data.";
  const fim = f.fim || f.inicio;
  if (!ehData(fim) || fim < f.inicio) erros.fim = "O fim vem depois do início.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      equipamentoId: f.equipamento,
      projetoId: ehUuid(f.projeto) ? f.projeto : null,
      eventoId: ehUuid(f.evento) ? f.evento : null,
      inicio: f.inicio,
      fim,
      notas: (f.notas ?? "").trim().slice(0, 500) || null,
    },
  };
}

export async function gravarReserva(tx: Tx, ctx: Contexto, e: EntradaReserva, demo = false): Promise<string> {
  const [r] = (await tx.execute(sql`
    insert into maestro.reservas (org_id, equipamento_id, projeto_id, evento_id, inicio, fim, notas, demo, created_by)
    values (${ctx.orgId}, ${e.equipamentoId}, ${e.projetoId}, ${e.eventoId}, ${e.inicio}, ${e.fim}, ${e.notas}, ${demo}, ${ctx.sub})
    returning id`)) as unknown as { id: string }[];
  return r.id;
}

export async function reservar(ctx: Contexto, e: EntradaReserva): Promise<Res<{ id: string }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => ({ ok: true as const, id: await gravarReserva(tx, ctx, e) }));
  } catch (err) {
    if (codigoPg(err) === CONFLITO) return falha("conflito", "Esse equipamento já está reservado nesse período.");
    if (codigoPg(err) === PG.chaveEstrangeira) return falha("vinculo", "Escolha o equipamento e o projeto da lista.");
    return traduzirPg(err);
  }
}

/** Cancelar libera o período; saída e retorno registram a conferência. */
export async function mudarReserva(ctx: Contexto, id: string, acao: "cancelar" | "saida" | "retorno"): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Essa reserva não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(
        acao === "cancelar"
          ? sql`update maestro.reservas set cancelada_em = now() where id = ${id} and cancelada_em is null returning equipamento_id`
          : acao === "saida"
            ? sql`update maestro.reservas set saida_em = now() where id = ${id} and saida_em is null returning equipamento_id`
            : sql`update maestro.reservas set retorno_em = now() where id = ${id} and saida_em is not null and retorno_em is null returning equipamento_id`,
      );
      if (!r.length) return falha("nao_mudou", "Nada mudou nessa reserva.");
      const eq = (r[0] as { equipamento_id: string }).equipamento_id;
      if (acao === "saida") await tx.execute(sql`update maestro.equipamentos set estado = 'em_uso' where id = ${eq} and estado = 'disponivel'`);
      if (acao === "retorno") await tx.execute(sql`update maestro.equipamentos set estado = 'disponivel' where id = ${eq} and estado = 'em_uso'`);
      return { ok: true as const };
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function reservasDoPeriodo(ctx: Contexto, de: string, ate: string): Promise<Reserva[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(
      sql`select ${COLUNAS_RESERVA} where r.cancelada_em is null and r.inicio <= ${ate}::date and r.fim >= ${de}::date order by r.inicio, e.nome limit 500`,
    );
    return r as unknown as Reserva[];
  });
}

export async function reservasDoProjeto(ctx: Contexto, projetoId: string): Promise<Reserva[]> {
  if (!ehUuid(projetoId)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`select ${COLUNAS_RESERVA} where r.cancelada_em is null and r.projeto_id = ${projetoId} order by r.inicio, e.nome`);
    return r as unknown as Reserva[];
  });
}

/** Veículos com consumo, para a calculadora de deslocamento. */
export async function listarVeiculos(ctx: Contexto): Promise<{ id: string; nome: string; kmL: number }[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select id, nome, km_l::float8 as "kmL" from maestro.equipamentos where categoria = 'veiculo' and km_l is not null and estado <> 'baixado' order by nome`);
    return [...(r as unknown as { id: string; nome: string; kmL: number }[])];
  });
}

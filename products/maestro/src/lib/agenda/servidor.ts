/**
 * Agenda da produtora (porte de events/event_crew e de src/lib/queries/agenda.ts do ZRO): diárias, entregas, reuniões
 * e compromissos, quem está escalado em cada diária e o aviso de conflito (a mesma pessoa em duas coisas ao mesmo
 * tempo). Escalar numa diária cria a escala do projeto (e o "a pagar", pelo banco). Sempre como a pessoa.
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, PG, type Contexto } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Erros, type Res } from "@/lib/crm/comum";
import { ehData } from "@/lib/dinheiro";
import { conflitosDeEscala, gravarEscala } from "@/lib/freelas/servidor";
import { diariaSugerida, normalizarFuncao } from "@/lib/freelas/funcoes";

export const TIPOS_EVENTO = [
  { k: "diaria", nome: "Diária" },
  { k: "entrega", nome: "Entrega" },
  { k: "reuniao", nome: "Reunião" },
  { k: "outro", nome: "Outro" },
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number]["k"];
export const nomeTipoEvento = (k: string) => TIPOS_EVENTO.find((t) => t.k === k)?.nome ?? k;

export const CORES = ["vermelho", "laranja", "amarelo", "verde", "azul", "roxo", "rosa"] as const;

export type Evento = {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  data: string;
  dataFim: string | null;
  horaIni: string | null;
  horaFim: string | null;
  local: string | null;
  notas: string | null;
  cor: string | null;
  projetoId: string | null;
  projeto: string | null;
  projetoCodigo: string | null;
  equipe: { escalaId: string; freelaId: string; nome: string; funcao: string; conflitos: { titulo: string; inicio: string }[] }[];
  equipamentos: number;
};

export async function listarEventos(ctx: Contexto, de: string, ate: string, o: { projeto?: string } = {}): Promise<Evento[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const ev = (await tx.execute(sql`
      select e.id, e.tipo, e.titulo, e.data::text, e.data_fim::text as "dataFim", to_char(e.hora_ini, 'HH24:MI') as "horaIni",
             to_char(e.hora_fim, 'HH24:MI') as "horaFim", e.local, e.notas, e.cor, e.projeto_id as "projetoId", p.title as projeto, p.code as "projetoCodigo",
             (select count(*)::int from maestro.reservas r where r.evento_id = e.id and r.cancelada_em is null) as equipamentos
        from maestro.eventos e left join maestro.projects p on p.id = e.projeto_id
       where e.data <= ${ate}::date and coalesce(e.data_fim, e.data) >= ${de}::date
         ${ehUuid(o.projeto) ? sql`and e.projeto_id = ${o.projeto}` : sql``}
       order by e.data, e.hora_ini nulls first, e.titulo
       limit 1000`)) as unknown as Omit<Evento, "equipe">[];
    const ids = ev.map((e) => e.id);
    const equipe = ids.length
      ? ((await tx.execute(sql`
          select s.id as "escalaId", s.evento_id as "eventoId", s.freela_id as "freelaId", f.nome, s.funcao
            from maestro.escalas s join maestro.freelas f on f.id = s.freela_id
           where s.evento_id = any (${`{${ids.join(",")}}`}::uuid[]) order by f.nome`)) as unknown as {
          escalaId: string;
          eventoId: string;
          freelaId: string;
          nome: string;
          funcao: string;
        }[])
      : [];
    const c = await conflitosDeEscala(
      tx,
      equipe.map((x) => x.escalaId),
    );
    return ev.map((e) => ({
      ...e,
      equipe: equipe.filter((x) => x.eventoId === e.id).map(({ eventoId: _, ...x }) => ({ ...x, conflitos: c.get(x.escalaId) ?? [] })),
    }));
  });
}

export type EntradaEvento = {
  tipo: TipoEvento;
  titulo: string;
  data: string;
  dataFim: string | null;
  horaIni: string | null;
  horaFim: string | null;
  local: string | null;
  notas: string | null;
  cor: string | null;
  projetoId: string | null;
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validarEvento(f: Record<string, string>): { ok: true; entrada: EntradaEvento } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const tipo = TIPOS_EVENTO.some((t) => t.k === f.tipo) ? (f.tipo as TipoEvento) : "diaria";
  const titulo = (f.titulo ?? "").trim();
  if (!titulo || titulo.length > 200) erros.titulo = "Dê um título (até 200).";
  if (!ehData(f.data)) erros.data = "Escolha a data.";
  const dataFim = f.dataFim && f.dataFim !== f.data ? f.dataFim : null;
  if (dataFim && (!ehData(dataFim) || dataFim < f.data)) erros.dataFim = "O fim vem depois do início.";
  const horaIni = f.horaIni || null;
  if (horaIni && !HORA.test(horaIni)) erros.horaIni = "Hora inválida.";
  const horaFim = f.horaFim || null;
  if (horaFim && !HORA.test(horaFim)) erros.horaFim = "Hora inválida.";
  const local = (f.local ?? "").trim();
  if (local.length > 300) erros.local = "Até 300 caracteres.";
  const notas = (f.notas ?? "").trim();
  if (notas.length > 4000) erros.notas = "Até 4.000 caracteres.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      tipo,
      titulo,
      data: f.data,
      dataFim,
      horaIni,
      horaFim,
      local: local || null,
      notas: notas || null,
      cor: (CORES as readonly string[]).includes(f.cor) ? f.cor : null,
      projetoId: ehUuid(f.projeto) ? f.projeto : null,
    },
  };
}

export async function salvarEvento(ctx: Contexto, e: EntradaEvento, id?: string, demo = false): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Esse evento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      if (id) {
        const r = await tx.execute(sql`
          update maestro.eventos set tipo = ${e.tipo}, titulo = ${e.titulo}, data = ${e.data}, data_fim = ${e.dataFim}, hora_ini = ${e.horaIni}, hora_fim = ${e.horaFim},
                 local = ${e.local}, notas = ${e.notas}, cor = ${e.cor}, projeto_id = ${e.projetoId}
           where id = ${id} returning id`);
        if (!r.length) return falha("sem_permissao", "Seu papel nesta organização só lê.");
        // A escala da diária acompanha as datas (e o "a pagar", pelo banco).
        await tx.execute(sql`
          update maestro.escalas set inicio = ${e.data}, fim = ${e.dataFim ?? e.data}, projeto_id = ${e.projetoId},
                 dias = (${e.dataFim ?? e.data}::date - ${e.data}::date) + 1,
                 valor_cents = case when diaria_cents is null then valor_cents else diaria_cents * ((${e.dataFim ?? e.data}::date - ${e.data}::date) + 1) end
           where evento_id = ${id}`);
        return { ok: true as const, id };
      }
      const [r] = (await tx.execute(sql`
        insert into maestro.eventos (org_id, projeto_id, tipo, titulo, data, data_fim, hora_ini, hora_fim, local, notas, cor, demo, created_by)
        values (${ctx.orgId}, ${e.projetoId}, ${e.tipo}, ${e.titulo}, ${e.data}, ${e.dataFim}, ${e.horaIni}, ${e.horaFim}, ${e.local}, ${e.notas}, ${e.cor}, ${demo}, ${ctx.sub})
        returning id`)) as unknown as { id: string }[];
      return { ok: true as const, id: r.id };
    });
  } catch (err) {
    if (codigoPg(err) === PG.chaveEstrangeira) return falha("vinculo", "Escolha um projeto da lista.");
    return traduzirPg(err);
  }
}

export async function removerEvento(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse evento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.eventos where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Seu papel nesta organização só lê.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function obterEvento(ctx: Contexto, id: string): Promise<Evento | null> {
  if (!ehUuid(id)) return null;
  const [d] = (await getBanco().asUser(ctx, (tx) =>
    tx.execute(sql`select data::text, coalesce(data_fim, data)::text as fim from maestro.eventos where id = ${id}`),
  )) as unknown as { data: string; fim: string }[];
  if (!d) return null;
  return (await listarEventos(ctx, d.data, d.fim)).find((e) => e.id === id) ?? null;
}

/** Escala um freela numa diária: período e projeto da diária, diária do cadastro da pessoa (ou a informada). */
export async function escalarNaDiaria(
  ctx: Contexto,
  eventoId: string,
  freelaId: string,
  funcaoTexto: string,
  diariaCents: number | null,
): Promise<Res<{ id: string }>> {
  if (!ehUuid(eventoId) || !ehUuid(freelaId)) return falha("vinculo", "Escolha a diária e o freela.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [ev] = (await tx.execute(
        sql`select projeto_id, data::text, coalesce(data_fim, data)::text as fim from maestro.eventos where id = ${eventoId}`,
      )) as unknown as {
        projeto_id: string | null;
        data: string;
        fim: string;
      }[];
      if (!ev) return falha("nao_existe", "Essa diária não existe.");
      const [f] = (await tx.execute(sql`select funcoes from maestro.freelas where id = ${freelaId}`)) as unknown as { funcoes: string[] }[];
      if (!f) return falha("nao_existe", "Esse freela não existe.");
      const funcao = normalizarFuncao(funcaoTexto) ?? f.funcoes[0] ?? "assistente";
      const valores = (await tx.execute(sql`
        select funcao, unidade, valor_cents::float8 as "valorCents" from maestro.freela_valores where freela_id = ${freelaId}`)) as unknown as {
        funcao: string;
        unidade: string;
        valorCents: number;
      }[];
      const diaria = diariaCents ?? diariaSugerida(valores, funcao) ?? 0;
      const r = await gravarEscala(tx, ctx, {
        projetoId: ev.projeto_id,
        eventoId,
        freelaId,
        funcao,
        inicio: ev.data,
        fim: ev.fim,
        diariaCents: diaria,
        valorCents: null,
        notas: null,
      });
      return { ok: true as const, id: r.id };
    });
  } catch (err) {
    if (codigoPg(err) === PG.unicidade) return falha("repetida", "Essa pessoa já está nessa diária.");
    return traduzirPg(err);
  }
}

/**
 * Cópia única do banco antigo (Neon, schema "public") para o schema do SOBEDESCE no Supabase da Absolute ZRO.
 * Quem chama é scripts/copiar-do-neon.mts, no vercel-build, depois das migrações e antes do next build.
 *
 * Regras (ADR 0013 da raiz: "cópia tabela a tabela, contagem e checksum por tabela nos dois lados"):
 * - Tabelas do schema destino (fora __drizzle_migrations e _copia_neon), na ordem das chaves estrangeiras.
 * - Tabela já registrada em <schema>._copia_neon: pula (rodar de novo é no-op).
 * - Tabela sem registro e destino vazio: copia. Destino com linhas e sem registro: PARA com erro (não duplica nem mistura).
 * - Colunas iguais e na mesma ordem nos dois lados (information_schema), senão erro.
 * - Conferência por tabela: contagem e md5 de string_agg(linha::text, '|' order by linha::text) nas duas pontas, com
 *   timezone UTC e os mesmos formatos de saída. Divergiu = erro.
 * - Tudo numa transação só no destino (falhou = nada fica gravado) e uma leitura só, num instantâneo
 *   (repeatable read, só leitura), na origem: a cópia e a conferência veem exatamente os mesmos dados.
 * - Sequências (identity/serial) das tabelas copiadas vão para depois do maior valor.
 * - O log só tem nomes de tabela, contagens e "ok"; nunca dados nem endereços.
 *
 * Sem "server-only": o script e os testes usam.
 */
import type postgres from "postgres";
import { schemaEntreAspas } from "./migrador";

export const TABELA_REGISTRO = "_copia_neon";
const FORA = new Set(["__drizzle_migrations", TABELA_REGISTRO]);

/** Erro da cópia: a mensagem é segura para o log (só nomes de tabela e contagens). */
export class ErroCopia extends Error {}

export type ResultadoCopia = { tabela: string; linhas: number; md5: string; estado: "copiada" | "ja-copiada" };

type Coluna = { nome: string; tipo: string; gerada: boolean; sequencia: boolean };
type Executor = postgres.Sql | postgres.TransactionSql;

const ident = (nome: string) => `"${nome.replaceAll('"', '""')}"`;

/** Mesmos formatos de texto nas duas pontas (a conferência compara o texto das linhas). */
async function formatosFixos(tx: Executor) {
  for (const ajuste of [
    "timezone to 'UTC'",
    "datestyle to 'ISO, MDY'",
    "intervalstyle to 'postgres'",
    "extra_float_digits to 1",
    "bytea_output to 'hex'",
  ]) {
    await tx.unsafe(`set local ${ajuste}`);
  }
}

async function colunas(tx: Executor, schema: string, tabela: string): Promise<Coluna[]> {
  const linhas = await tx<{ nome: string; tipo: string; gerada: string; identidade: string; padrao: string | null }[]>`
    select column_name as nome, data_type || ':' || udt_name as tipo, is_generated as gerada,
           is_identity as identidade, column_default as padrao
    from information_schema.columns
    where table_schema = ${schema} and table_name = ${tabela}
    order by ordinal_position`;
  return linhas.map((c) => ({
    nome: c.nome,
    tipo: c.tipo,
    gerada: c.gerada === "ALWAYS",
    sequencia: c.identidade === "YES" || (c.padrao ?? "").startsWith("nextval("),
  }));
}

/** Ordem que respeita as chaves estrangeiras (quem é referenciado vem antes). Ciclo = erro. */
export function ordemTopologica(tabelas: string[], fks: { tabela: string; referencia: string }[]): string[] {
  const dependeDe = new Map(tabelas.map((t) => [t, new Set<string>()]));
  for (const { tabela, referencia } of fks) {
    if (tabela !== referencia && dependeDe.has(tabela) && dependeDe.has(referencia)) dependeDe.get(tabela)!.add(referencia);
  }
  const ordem: string[] = [];
  const feitas = new Set<string>();
  const restantes = [...tabelas].sort();
  while (restantes.length) {
    const i = restantes.findIndex((t) => [...dependeDe.get(t)!].every((r) => feitas.has(r)));
    if (i < 0) throw new ErroCopia(`chaves estrangeiras em ciclo entre: ${restantes.join(", ")}`);
    const [t] = restantes.splice(i, 1);
    ordem.push(t);
    feitas.add(t);
  }
  return ordem;
}

async function conferencia(tx: Executor, schema: string, tabela: string, cols: Coluna[]) {
  const lista = cols.map((c) => ident(c.nome)).join(", ");
  const [r] = await tx.unsafe<{ linhas: string; md5: string }[]>(
    `select count(*)::text as linhas, md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) as md5
     from (select ${lista} from ${schemaEntreAspas(schema)}.${ident(tabela)}) x`,
  );
  return { linhas: Number(r.linhas), md5: r.md5 };
}

export type OpcoesCopia = {
  origem: postgres.Sql;
  destino: postgres.Sql;
  schemaDestino: string;
  schemaOrigem?: string;
  /** Linhas por lote (padrão 500). */
  lote?: number;
  log?: (linha: string) => void;
};

export async function copiarDoNeon({ origem, destino, schemaDestino, schemaOrigem = "public", lote = 500, log = console.log }: OpcoesCopia) {
  const sd = schemaEntreAspas(schemaDestino);
  const so = schemaEntreAspas(schemaOrigem);
  const registro = `${sd}.${ident(TABELA_REGISTRO)}`;

  return destino.begin(async (tx) => {
    await formatosFixos(tx);
    // Dois deploys ao mesmo tempo: o segundo espera e encontra tudo registrado.
    await tx`select pg_advisory_xact_lock(hashtext(${`sobedesce:copia:${schemaDestino}`}))`;
    await tx.unsafe(
      `create table if not exists ${registro} (tabela text primary key, linhas bigint not null, md5 text not null, copiado_em timestamptz not null default now())`,
    );

    const tabelas = (
      await tx<{ nome: string }[]>`
        select table_name as nome from information_schema.tables
        where table_schema = ${schemaDestino} and table_type = 'BASE TABLE'`
    )
      .map((t) => t.nome)
      .filter((t) => !FORA.has(t));
    const fks = await tx<{ tabela: string; referencia: string }[]>`
      select c.relname as tabela, r.relname as referencia
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_class r on r.oid = k.confrelid
      join pg_namespace n on n.oid = c.relnamespace
      where k.contype = 'f' and n.nspname = ${schemaDestino}`;
    const ordem = ordemTopologica(tabelas, fks);
    const registradas = new Map(
      (await tx.unsafe<{ tabela: string; linhas: string; md5: string }[]>(`select tabela, linhas::text, md5 from ${registro}`)).map((r) => [r.tabela, r]),
    );

    const resultado: ResultadoCopia[] = [];
    const pendentes = ordem.filter((t) => {
      const r = registradas.get(t);
      if (r) resultado.push({ tabela: t, linhas: Number(r.linhas), md5: r.md5, estado: "ja-copiada" });
      return !r;
    });
    if (!pendentes.length) {
      log(`copiar-do-neon: ${ordem.length} tabelas já copiadas e conferidas antes; nada a fazer.`);
      return resultado;
    }

    // Um instantâneo só da origem para copiar e conferir.
    await origem.begin("isolation level repeatable read read only", async (o) => {
      await formatosFixos(o);
      for (const tabela of pendentes) {
        const tabelaD = `${sd}.${ident(tabela)}`;
        const tabelaO = `${so}.${ident(tabela)}`;
        const colsD = await colunas(tx, schemaDestino, tabela);
        const colsO = await colunas(o, schemaOrigem, tabela);
        if (!colsO.length) throw new ErroCopia(`${tabela}: não existe na origem`);
        const assinatura = (cs: Coluna[]) => cs.map((c) => `${c.nome} ${c.tipo} ${c.gerada}`).join(",");
        if (assinatura(colsD) !== assinatura(colsO)) throw new ErroCopia(`${tabela}: as colunas da origem e do destino divergem`);

        const [{ tem }] = await tx.unsafe<{ tem: boolean }[]>(`select exists (select 1 from ${tabelaD}) as tem`);
        if (tem) throw new ErroCopia(`${tabela}: o destino já tem linhas e não há registro de cópia; nada foi copiado`);

        const gravaveis = colsD.filter((c) => !c.gerada).map((c) => ident(c.nome));
        const lista = gravaveis.join(", ");
        const inserir = `insert into ${tabelaD} (${lista}) overriding system value select ${lista} from json_populate_recordset(null::${tabelaD}, $1::text::json)`;
        // As linhas viajam como texto JSON gerado pelo Postgres (nada é convertido no Node: bigint e datas chegam iguais).
        await o.unsafe(`declare copia_linhas no scroll cursor for select row_to_json(t)::text as j from ${tabelaO} t`);
        for (;;) {
          const linhas = await o.unsafe<{ j: string }[]>(`fetch ${Math.max(1, Math.floor(lote))} from copia_linhas`);
          if (!linhas.length) break;
          await tx.unsafe(inserir, [`[${linhas.map((l) => l.j).join(",")}]`]);
        }
        await o.unsafe("close copia_linhas");

        const naOrigem = await conferencia(o, schemaOrigem, tabela, colsO);
        const noDestino = await conferencia(tx, schemaDestino, tabela, colsD);
        if (naOrigem.linhas !== noDestino.linhas || naOrigem.md5 !== noDestino.md5) {
          log(`copiar-do-neon: ${tabela}: ${naOrigem.linhas} na origem, ${noDestino.linhas} no destino, divergiu`);
          throw new ErroCopia(`${tabela}: divergiu (contagem ou md5)`);
        }

        for (const c of colsD.filter((c) => c.sequencia)) {
          await tx.unsafe(
            `select setval(pg_get_serial_sequence($1, $2), coalesce((select max(${ident(c.nome)}) from ${tabelaD}), 0) + 1, false)`,
            [tabelaD, c.nome],
          );
        }
        await tx.unsafe(`insert into ${registro} (tabela, linhas, md5) values ($1, $2, $3)`, [tabela, noDestino.linhas, noDestino.md5]);
        resultado.push({ tabela, linhas: noDestino.linhas, md5: noDestino.md5, estado: "copiada" });
        log(`copiar-do-neon: ${tabela}: ${noDestino.linhas} linhas, ok`);
      }
    });
    log(`copiar-do-neon: ${pendentes.length} tabelas copiadas e conferidas.`);
    return resultado;
  });
}

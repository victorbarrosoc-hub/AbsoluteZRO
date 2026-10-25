/**
 * Cópia do Neon para o Supabase (src/lib/db/copia-neon.ts e scripts/copiar-do-neon.mts): copia na ordem das chaves
 * estrangeiras, confere contagem e md5, registra, ajusta sequências; rodar de novo é no-op; destino com linhas sem
 * registro, colunas diferentes ou divergência param com erro e não deixam nada gravado.
 * Origem e destino: dois schemas num Postgres de verdade (TEST_DATABASE_URL) ou dois PGlite (tests/bancos-teste.mts).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import type postgres from "postgres";
import { copiarDoNeon, ErroCopia, ordemTopologica } from "../src/lib/db/copia-neon";
import { migrarNoSchema } from "../src/lib/db/migrador";
import { abrirBancos, type Bancos } from "./bancos-teste.mjs";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const PASTA = fileURLToPath(new URL("../drizzle", import.meta.url));
const NOME_SECRETO = "Ana Montadora — ção 🎬 'aspas' | barra";
const EMAIL_SECRETO = "ana.secreta@exemplo.com";

async function semear(sql: postgres.Sql, s: string) {
  await sql.unsafe(`
    insert into "${s}".usuarios (id, email, nome, senha_hash, criado_em, atualizado_em, ultimo_login_em) values
      ('u1', '${EMAIL_SECRETO}', '${NOME_SECRETO.replaceAll("'", "''")}', 'scrypt$1', '2026-10-01 12:00:00.123456-03', '2026-10-02 00:00:00+00', null),
      ('u2', 'beto@exemplo.com', 'Beto', 'scrypt$2', '2026-10-03 08:30:00+00', '2026-10-03 08:30:00+00', '2026-10-20 10:00:00+00'),
      ('u3', 'caio@exemplo.com', 'Caio', 'scrypt$3', '2026-10-04 08:30:00+00', '2026-10-04 08:30:00+00', null)`);
  await sql.unsafe(`
    insert into "${s}".sessoes (id, usuario_id, token_hash, tipo, nome, plataforma, expira_em, app_build) values
      ('s1', 'u1', 'h1', 'dispositivo', 'MacBook de Ana', 'mac', '2027-04-01 00:00:00+00', 379),
      ('s2', 'u2', 'h2', 'web', null, null, '2026-11-01 00:00:00+00', null)`);
  await sql.unsafe(`
    insert into "${s}".p2p_sinais (id, usuario_id, para_usuario, de_sessao, para_sessao, tipo, resumo) values
      ('p1', 'u1', 'u2', 's1', 's2', 'oferta', '{"arquivos": 2, "bytes": 9007199254740993, "nomes": ["a|b", "ç"]}')`);
  await sql.unsafe(`insert into "${s}".tentativas (chave, quando) values ('login:a', '2026-10-01 00:00:00+00'), ('login:b', now()), ('login:c', now())`);
  await sql.unsafe(`insert into "${s}".tentativas (id, chave) overriding system value values (50, 'login:d')`);
  await sql.unsafe(`delete from "${s}".tentativas where chave = 'login:b'`);
}

const contar = async (sql: postgres.Sql, s: string, tabela: string) =>
  Number((await sql.unsafe<{ n: string }[]>(`select count(*)::text as n from "${s}"."${tabela}"`))[0].n);

const temRegistro = async (sql: postgres.Sql, s: string) =>
  (await sql<{ ok: boolean }[]>`select exists (select 1 from information_schema.tables where table_schema = ${s} and table_name = '_copia_neon') as ok`)[0].ok;

describe("ordem das tabelas", () => {
  test("quem é referenciado vem antes; ciclo é erro", () => {
    const ordem = ordemTopologica(
      ["p2p_sinais", "sessoes", "usuarios", "tentativas"],
      [
        { tabela: "sessoes", referencia: "usuarios" },
        { tabela: "p2p_sinais", referencia: "sessoes" },
        { tabela: "p2p_sinais", referencia: "usuarios" },
      ],
    );
    assert.ok(ordem.indexOf("usuarios") < ordem.indexOf("sessoes"));
    assert.ok(ordem.indexOf("sessoes") < ordem.indexOf("p2p_sinais"));
    assert.throws(
      () =>
        ordemTopologica(
          ["a", "b"],
          [
            { tabela: "a", referencia: "b" },
            { tabela: "b", referencia: "a" },
          ],
        ),
      ErroCopia,
    );
  });
});

describe("copiar do Neon", () => {
  let bancos: Bancos;
  let origem: string;
  before(async () => {
    bancos = await abrirBancos();
    origem = bancos.novoSchema("neon");
    await migrarNoSchema(bancos.origem, origem, PASTA);
    await semear(bancos.origem, origem);
  });
  after(async () => {
    await bancos.fechar();
  });

  async function destinoNovo() {
    const s = bancos.novoSchema("dest");
    await migrarNoSchema(bancos.destino, s, PASTA);
    return s;
  }

  test("copia tudo, confere, registra e ajusta a sequência; de novo é no-op", async () => {
    const destino = await destinoNovo();
    const log: string[] = [];
    const resultado = await copiarDoNeon({
      origem: bancos.origem,
      destino: bancos.destino,
      schemaOrigem: origem,
      schemaDestino: destino,
      lote: 2,
      log: (l) => log.push(l),
    });
    const porTabela = new Map(resultado.map((r) => [r.tabela, r]));
    assert.equal(porTabela.get("usuarios")?.linhas, 3);
    assert.equal(porTabela.get("sessoes")?.linhas, 2);
    assert.equal(porTabela.get("p2p_sinais")?.linhas, 1);
    assert.equal(porTabela.get("tentativas")?.linhas, 3);
    assert.ok(resultado.every((r) => r.estado === "copiada"));
    assert.ok(!porTabela.has("__drizzle_migrations") && !porTabela.has("_copia_neon"));

    // Os dados chegaram iguais (texto, datas com microssegundos, jsonb com número grande).
    const [u1] = await bancos.destino.unsafe<{ nome: string; email: string; criado: string }[]>(
      `select nome, email, to_char(criado_em at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') as criado from "${destino}".usuarios where id = 'u1'`,
    );
    assert.deepEqual(u1, { nome: NOME_SECRETO, email: EMAIL_SECRETO, criado: "2026-10-01 15:00:00.123456" });
    const [p1] = await bancos.destino.unsafe<{ bytes: string }[]>(`select resumo->>'bytes' as bytes from "${destino}".p2p_sinais`);
    assert.equal(p1.bytes, "9007199254740993");

    // Registro por tabela, e a sequência continua depois do maior id copiado.
    const registros = await bancos.destino.unsafe<{ tabela: string; linhas: string; md5: string }[]>(
      `select tabela, linhas::text, md5 from "${destino}"._copia_neon order by tabela`,
    );
    assert.equal(registros.length, resultado.length);
    assert.ok(registros.every((r) => /^[0-9a-f]{32}$/.test(r.md5)));
    const [nova] = await bancos.destino.unsafe<{ id: string }[]>(`insert into "${destino}".tentativas (chave) values ('nova') returning id::text`);
    assert.equal(nova.id, "51");

    // O log só tem nomes de tabela e contagens.
    assert.ok(log.some((l) => /usuarios: 3 linhas, ok/.test(l)));
    for (const l of log) assert.doesNotMatch(l, /Ana|secreta|exemplo|postgres:\/\//);

    // De novo: nada muda.
    const log2: string[] = [];
    const segunda = await copiarDoNeon({ origem: bancos.origem, destino: bancos.destino, schemaOrigem: origem, schemaDestino: destino, log: (l) => log2.push(l) });
    assert.ok(segunda.every((r) => r.estado === "ja-copiada"));
    assert.equal(await contar(bancos.destino, destino, "usuarios"), 3);
    assert.equal(await contar(bancos.destino, destino, "tentativas"), 4);
    assert.match(log2.join("\n"), /nada a fazer/);
  });

  test("destino com linhas e sem registro de cópia: para com erro e não grava nada", async () => {
    const destino = await destinoNovo();
    await bancos.destino.unsafe(`insert into "${destino}".usuarios (id, email, nome, senha_hash) values ('novo', 'novo@exemplo.com', 'Novo', 'x')`);
    await assert.rejects(
      copiarDoNeon({ origem: bancos.origem, destino: bancos.destino, schemaOrigem: origem, schemaDestino: destino, log: () => {} }),
      (e: unknown) => e instanceof ErroCopia && /usuarios: o destino já tem linhas/.test(e.message),
    );
    assert.equal(await contar(bancos.destino, destino, "usuarios"), 1);
    assert.equal(await contar(bancos.destino, destino, "tentativas"), 0, "nem as tabelas anteriores ficaram");
    assert.equal(await temRegistro(bancos.destino, destino), false);
  });

  test("divergência entre origem e destino: erro e nada gravado", async () => {
    const destino = await destinoNovo();
    // Um gatilho que muda o que entra simula uma cópia que não chegou igual.
    await bancos.destino.unsafe(`create function "${destino}".estraga() returns trigger language plpgsql as $$ begin new.nome := upper(new.nome); return new; end $$`);
    await bancos.destino.unsafe(`create trigger estraga before insert on "${destino}".usuarios for each row execute function "${destino}".estraga()`);
    const log: string[] = [];
    await assert.rejects(
      copiarDoNeon({ origem: bancos.origem, destino: bancos.destino, schemaOrigem: origem, schemaDestino: destino, log: (l) => log.push(l) }),
      (e: unknown) => e instanceof ErroCopia && /usuarios: divergiu/.test(e.message),
    );
    assert.match(log.join("\n"), /usuarios: 3 na origem, 3 no destino, divergiu/);
    assert.equal(await contar(bancos.destino, destino, "usuarios"), 0);
    assert.equal(await temRegistro(bancos.destino, destino), false);
  });

  test("colunas diferentes nas duas pontas: erro", async () => {
    const destino = await destinoNovo();
    await bancos.destino.unsafe(`alter table "${destino}".sessoes add column extra text`);
    await assert.rejects(
      copiarDoNeon({ origem: bancos.origem, destino: bancos.destino, schemaOrigem: origem, schemaDestino: destino, log: () => {} }),
      (e: unknown) => e instanceof ErroCopia && /sessoes: as colunas/.test(e.message),
    );
    assert.equal(await contar(bancos.destino, destino, "usuarios"), 0);
  });
});

describe("scripts/copiar-do-neon.mts", () => {
  const rodar = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/copiar-do-neon.mts"], {
      cwd: WEB,
      encoding: "utf8",
      timeout: 60_000,
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env },
    });

  test("sem SOBEDESCE_COPIAR_DE não faz nada", () => {
    const r = rodar({});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /nada a copiar/);
  });

  test("falha sai com código 1 e não mostra endereço nem senha", () => {
    const r = rodar({
      SOBEDESCE_COPIAR_DE: "postgres://neon:sNeon@127.0.0.1:1/neondb",
      SOBEDESCE_DATABASE_URL: "postgres://sobedesce_app.abc:sSupa@127.0.0.1:2/postgres",
      SOBEDESCE_DATABASE_SCHEMA: "sobedesce",
    });
    assert.equal(r.status, 1);
    const saida = r.stdout + r.stderr;
    assert.match(saida, /falhou/);
    assert.doesNotMatch(saida, /sNeon|sSupa|postgres:\/\//);
  });

  test("sem SOBEDESCE_DATABASE_SCHEMA não copia", () => {
    const r = rodar({
      SOBEDESCE_COPIAR_DE: "postgres://neon:sNeon@127.0.0.1:1/neondb",
      SOBEDESCE_DATABASE_URL: "postgres://sobedesce_app.abc:sSupa@127.0.0.1:2/postgres",
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SOBEDESCE_DATABASE_SCHEMA/);
  });
});

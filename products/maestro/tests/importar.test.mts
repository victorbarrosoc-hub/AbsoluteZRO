// Importar planilha (drizzle/0016): o leitor de CSV (separador, aspas, BOM, CRLF, limites), o mapa automático pelos
// cabeçalhos em português, a conferência de cada linha, a prévia que não grava nada, a confirmação (sha256 do mesmo
// arquivo), a reimportação idempotente, quem pode importar e o relatório isolado por organização.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("importar");
const { getBanco } = amb.banco;
const csv = await import("../src/lib/importar/csv");
const imp = await import("../src/lib/importar/servidor");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;

const contar = async (ctx: { sub: string; orgId: string }, t: string) =>
  ((await getBanco().asUser(ctx, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)))) as unknown as { n: number }[])[0].n;

describe("leitor e conferência (puro)", () => {
  test("separador, aspas, BOM, CRLF e quebra de linha dentro de aspas", () => {
    const t = '﻿Nome;E-mail;Observações\r\n"Café; Serra";joana@x.com;"Disse ""oi""\nna linha 2"\r\n\r\nModa;;\r\n';
    const l = csv.lerCsv(t);
    assert.ok(l.ok);
    if (!l.ok) return;
    assert.equal(l.separador, ";");
    assert.deepEqual(l.cabecalho, ["Nome", "E-mail", "Observações"]);
    assert.deepEqual(l.linhas, [
      ["Café; Serra", "joana@x.com", 'Disse "oi"\nna linha 2'],
      ["Moda", "", ""],
    ]);
    const v = csv.lerCsv("nome,email\nA,a@x.com\n");
    assert.ok(v.ok && v.separador === ",");
    const tab = csv.lerCsv("nome\temail\nA\ta@x.com");
    assert.ok(tab.ok && tab.separador === "\t" && tab.linhas[0][1] === "a@x.com");
  });

  test("limites e arquivos ruins", () => {
    assert.equal(csv.lerCsv("").ok, false);
    assert.equal(csv.lerCsv("nome\n").ok, false, "só cabeçalho");
    assert.equal(csv.lerCsv('nome\n"aberta').ok, false);
    assert.equal(csv.lerCsv(`nome\n${"a\n".repeat(2001)}`).ok, false, "mais de 2.000 linhas");
    assert.equal(csv.lerCsv(`${Array.from({ length: 41 }, (_, i) => `c${i}`).join(";")}\nx`).ok, false, "mais de 40 colunas");
    assert.equal(csv.lerCsv(`nome\n${"x".repeat(2001)}`).ok, false, "célula enorme");
    assert.equal(csv.lerCsv(`nome\n${"x;".repeat(600_000)}`).ok, false, "mais de 1 MB");
    // Windows-1252 (Excel em português)
    const latin = new Uint8Array([0x4e, 0x6f, 0x6d, 0x65, 0x0a, 0x43, 0x61, 0x66, 0xe9]);
    assert.equal(csv.decodificar(latin), "Nome\nCafé");
  });

  test("mapa automático pelos cabeçalhos em português", () => {
    assert.deepEqual(csv.autoMapa("clientes", ["Razão Social", "Nome do cliente", "E-MAIL", "Celular", "Obs"]), {
      nome: 1,
      empresa: 0,
      contato: null,
      email: 2,
      whatsapp: 3,
      status: null,
      observacoes: 4,
    });
    const eq = csv.autoMapa("equipamentos", ["Equipamento", "Nº de série", "Patrimônio", "Valor pago", "Data de compra"]);
    assert.equal(eq.nome, 0);
    assert.equal(eq.serie, 1);
    assert.equal(eq.patrimonio, 2);
    assert.equal(eq.valor, 3);
    assert.equal(eq.compra, 4);
    // O modelo para baixar se lê sozinho, com todas as colunas no lugar.
    for (const t of csv.TIPOS) {
      const l = csv.lerCsv(csv.modeloCsv(t.k));
      assert.ok(l.ok, t.k);
      if (!l.ok) continue;
      const m = csv.autoMapa(t.k, l.cabecalho);
      csv.CAMPOS[t.k].forEach((c, i) => assert.equal(m[c.k], i, `${t.k}.${c.k}`));
    }
  });

  test("as planilhas de exemplo da demonstração se leem sem erro", () => {
    for (const [tipo, arq, n] of [
      ["clientes", "clientes-exemplo.csv", 4],
      ["freelas", "freelas-exemplo.csv", 3],
    ] as const) {
      const p = csv.previa(tipo, readFileSync(new URL(`../docs/demonstracao/${arq}`, import.meta.url), "utf8"));
      assert.ok(p.ok, arq);
      if (!p.ok) continue;
      assert.equal(p.previa.linhas.length, n, arq);
      assert.equal(p.previa.invalidas, 0, `${arq}: ${JSON.stringify(p.previa.linhas.map((l) => l.erros))}`);
      assert.deepEqual(p.previa.faltando, []);
    }
  });

  test("datas, valores, WhatsApp e erros por linha", () => {
    assert.equal(csv.lerData("03/11/2026"), "2026-11-03");
    assert.equal(csv.lerData("3/11/26"), "2026-11-03");
    assert.equal(csv.lerData("2026-02-30"), undefined);
    assert.equal(csv.lerData(""), null);
    assert.equal(csv.lerValor("R$ 32.000,50"), 3_200_050);
    assert.equal(csv.lerValor("1.500"), 150_000);
    assert.equal(csv.lerValor("abc"), undefined);
    assert.equal(csv.lerWhatsapp("(35) 99876-5432"), "5535998765432");
    assert.equal(csv.lerWhatsapp("12"), undefined);
    const m = csv.autoMapa("projetos", ["Título", "Início", "Prazo", "Código", "Status"]);
    const r = csv.lerLinha("projetos", m, ["Filme", "30/11/2026", "01/11/2026", "X-1", "voando"], 2);
    assert.deepEqual(
      r.erros.sort(),
      ["Código no formato MAE-2026-001", "O prazo vem antes do início", "Status: em andamento, pausado, concluído ou arquivado"].sort(),
    );
    const f = csv.lerLinha(
      "freelas",
      csv.autoMapa("freelas", ["Nome", "Funções", "Conta Absolute ZRO"]),
      ["Rafa", "drone, Edição | maquiagem", "nao-e-uuid"],
      3,
    );
    assert.deepEqual(f.dados.funcoes, ["drone", "edicao", "Maquiagem"]);
    assert.deepEqual(f.erros, ["Conta Absolute ZRO: o id (uuid) da conta"]);
    const p = csv.previa("clientes", "Nome;E-mail\nAna;ana@x.com\nAna B;ana@x.com\n;sem@nome.com\nZé;ruim@");
    assert.ok(p.ok);
    if (!p.ok) return;
    assert.deepEqual(
      p.previa.linhas.map((l) => [l.n, l.erros]),
      [
        [2, []],
        [3, ["Repetida no arquivo (vale a primeira)"]],
        [4, ["Falta o nome"]],
        [5, ["E-mail inválido"]],
      ],
    );
    assert.deepEqual([p.previa.validas, p.previa.invalidas], [1, 3]);
    const sem = csv.previa("clientes", "Email\na@x.com");
    assert.deepEqual(sem.ok && sem.previa.faltando, ["Nome"], "sem a coluna do nome, a tela pede para escolher");
    const outro = csv.previa("clientes", "Coluna A;Coluna B\nAna;ana@x.com", { nome: 0, email: 1 });
    assert.deepEqual(outro.ok && outro.previa.linhas[0].dados.email, "ana@x.com", "o mapa escolhido na tela vale");
  });
});

const CLIENTES = "Nome;E-mail;WhatsApp;Status\nCafé Serra;joana@serra.com;(35) 99876-5432;ativo\nModa Raiz;contato@moda.com;;lead\nSem e-mail;;;\n";

describe("no banco", () => {
  before(async () => {
    o = await duasOrganizacoes();
  });
  after(() => amb.fechar());

  test("a prévia não grava nada", async () => {
    const antes = await contar(o.admin, "clients");
    const r = await imp.previaNoBanco(o.admin, "clientes", CLIENTES);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.previa.contagem, { criar: 3, atualizar: 0, igual: 0, erro: 0 });
    assert.equal(await contar(o.admin, "clients"), antes);
    assert.equal(await contar(o.admin, "importacoes"), 0);
  });

  test("confirmar grava, deixa o relatório e reimportar não duplica", async () => {
    const p = await imp.previaNoBanco(o.admin, "clientes", CLIENTES);
    assert.ok(p.ok);
    if (!p.ok) return;
    const r = await imp.confirmarImportacao(o.admin, { tipo: "clientes", texto: CLIENTES, mapa: p.previa.mapa, sha: p.previa.sha256, arquivo: "clientes.csv" });
    assert.ok(r.ok);
    assert.deepEqual(r.ok && [r.relatorio.criados, r.relatorio.atualizados, r.relatorio.iguais, r.relatorio.ignorados], [3, 0, 0, 0]);
    assert.equal(await contar(o.admin, "clients"), 3);
    const [c] = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`select whatsapp, status, created_by::text as por from maestro.clients where email = 'joana@serra.com'`),
    )) as unknown as Record<string, string>[];
    assert.deepEqual(c, { whatsapp: "5535998765432", status: "ativo", por: o.ANA });
    // de novo, o mesmo arquivo: tudo igual
    const de = await imp.confirmarImportacao(o.admin, {
      tipo: "clientes",
      texto: CLIENTES,
      mapa: p.previa.mapa,
      sha: p.previa.sha256,
      arquivo: "clientes.csv",
    });
    assert.deepEqual(de.ok && [de.relatorio.criados, de.relatorio.atualizados, de.relatorio.iguais], [0, 0, 3]);
    assert.equal(await contar(o.admin, "clients"), 3);
    // mudou o status de um e o nome casa sem e-mail: atualiza; célula vazia não apaga
    const novo = "Nome;E-mail;Status\nModa Raiz;contato@moda.com;ativo\nSem e-mail;;\n";
    const p2 = await imp.previaNoBanco(o.gestor, "clientes", novo);
    assert.ok(p2.ok);
    if (!p2.ok) return;
    assert.deepEqual(
      p2.previa.linhas.map((l) => [l.acao, l.mudam]),
      [
        ["atualizar", ["status"]],
        ["igual", []],
      ],
    );
    const r2 = await imp.confirmarImportacao(o.gestor, { tipo: "clientes", texto: novo, mapa: p2.previa.mapa, sha: p2.previa.sha256, arquivo: "b.csv" });
    assert.ok(r2.ok);
    assert.equal(await contar(o.admin, "clients"), 3);
    assert.equal(await contar(o.admin, "importacoes"), 3);
  });

  test("arquivo trocado depois da prévia é recusado", async () => {
    const p = await imp.previaNoBanco(o.admin, "clientes", CLIENTES);
    assert.ok(p.ok);
    if (!p.ok) return;
    const r = await imp.confirmarImportacao(o.admin, {
      tipo: "clientes",
      texto: `${CLIENTES}Outro;o@x.com;;\n`,
      mapa: p.previa.mapa,
      sha: p.previa.sha256,
      arquivo: "x.csv",
    });
    assert.equal(r.ok, false);
  });

  test("equipe e leitura não importam (a confirmação confere o papel)", async () => {
    for (const ctx of [o.equipe, o.leitura]) {
      const p = await imp.previaNoBanco(ctx, "freelas", "Nome\nAlguém");
      assert.ok(p.ok);
      if (!p.ok) continue;
      const r = await imp.confirmarImportacao(ctx, { tipo: "freelas", texto: "Nome\nAlguém", mapa: p.previa.mapa, sha: p.previa.sha256, arquivo: "f.csv" });
      assert.equal(r.ok, false);
    }
    assert.equal(await contar(o.admin, "freelas"), 0);
  });

  test("projetos: cliente pelo nome (precisa existir), código casado, sem código ganha um", async () => {
    const t =
      "Código;Título;Cliente;Início;Prazo\nMAE-2026-050;Filme do café;café serra;03/11/2026;28/11/2026\n;Lookbook;Moda Raiz;;\n;Fantasma;Não existe;;\n";
    const p = await imp.previaNoBanco(o.admin, "projetos", t);
    assert.ok(p.ok);
    if (!p.ok) return;
    assert.deepEqual(
      p.previa.linhas.map((l) => l.acao),
      ["criar", "criar", "erro"],
    );
    const r = await imp.confirmarImportacao(o.admin, { tipo: "projetos", texto: t, mapa: p.previa.mapa, sha: p.previa.sha256, arquivo: "p.csv" });
    assert.ok(r.ok);
    const ps = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(
        sql`select p.code, p.title, c.name as cliente, p.start_date::text as inicio, p.link_status from maestro.projects p left join maestro.clients c on c.id = p.client_id order by p.title`,
      ),
    )) as unknown as Record<string, string>[];
    assert.equal(ps.length, 2);
    assert.deepEqual(ps[0], { code: "MAE-2026-050", title: "Filme do café", cliente: "Café Serra", inicio: "2026-11-03", link_status: "pending" });
    assert.match(ps[1].code, /^MAE-\d{4}-\d{3}$/);
    const de = await imp.previaNoBanco(o.admin, "projetos", t);
    assert.deepEqual(de.ok && de.previa.contagem, { criar: 0, atualizar: 0, igual: 2, erro: 1 });
  });

  test("freelas com conta Absolute ZRO opcional e equipamentos da produtora", async () => {
    const sub = "0b5f1c9e-3c2a-4d7e-9a1b-2c3d4e5f6a7b";
    const t = `Nome;E-mail;Funções;Conta Absolute ZRO\nRafa Lima;rafa@x.com;Drone, Edição;${sub}\nBia Som;;Som direto;\n`;
    const p = await imp.previaNoBanco(o.admin, "freelas", t);
    assert.ok(p.ok);
    if (!p.ok) return;
    assert.ok((await imp.confirmarImportacao(o.admin, { tipo: "freelas", texto: t, mapa: p.previa.mapa, sha: p.previa.sha256, arquivo: "f.csv" })).ok);
    const fs = [
      ...((await getBanco().asUser(o.admin, (tx) =>
        tx.execute(sql`select nome, funcoes, zro_sub::text as sub from maestro.freelas order by nome`),
      )) as unknown as Record<string, unknown>[]),
    ];
    assert.deepEqual(fs, [
      { nome: "Bia Som", funcoes: ["som"], sub: null },
      { nome: "Rafa Lima", funcoes: ["drone", "edicao"], sub },
    ]);
    const e = "Equipamento;Patrimônio;Valor;Data de compra\nSony FX6;PAT-001;R$ 32.000,00;15/03/2025\nSony FX-6;;;\nTripé Sachtler;;;\n";
    const pe = await imp.previaNoBanco(o.admin, "equipamentos", e);
    assert.ok(pe.ok);
    if (!pe.ok) return;
    assert.deepEqual(
      pe.previa.linhas.map((l) => l.acao),
      ["criar", "criar", "criar"],
    );
    assert.ok((await imp.confirmarImportacao(o.admin, { tipo: "equipamentos", texto: e, mapa: pe.previa.mapa, sha: pe.previa.sha256, arquivo: "e.csv" })).ok);
    const eqs = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`select nome, categoria, dono, valor_cents::int as v from maestro.equipamentos order by nome`),
    )) as unknown as Record<string, unknown>[];
    assert.equal(eqs.length, 3, "a FX6 com etiqueta e a FX-6 sem etiqueta são duas câmeras");
    assert.deepEqual(
      eqs.find((x) => x.nome === "Sony FX6"),
      { nome: "Sony FX6", categoria: "camera", dono: "produtora", v: 3_200_000 },
    );
    const de = await imp.previaNoBanco(o.admin, "equipamentos", e);
    assert.deepEqual(de.ok && de.previa.contagem, { criar: 0, atualizar: 0, igual: 3, erro: 0 });
  });

  test("duas organizações: a B não vê o relatório nem os cadastros da A", async () => {
    assert.equal(await contar(o.b, "importacoes"), 0);
    assert.equal(await contar(o.b, "clients"), 0);
    assert.equal(await contar(o.forjado, "importacoes"), 0);
    assert.equal((await imp.historicoDeImportacoes(o.b)).length, 0);
    assert.ok((await imp.historicoDeImportacoes(o.admin)).length >= 5);
    // A B importando o mesmo arquivo cria na B, sem casar com os da A.
    const p = await imp.previaNoBanco(o.b, "clientes", CLIENTES);
    assert.deepEqual(p.ok && p.previa.contagem, { criar: 3, atualizar: 0, igual: 0, erro: 0 });
  });
});

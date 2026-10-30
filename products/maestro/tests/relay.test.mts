// "Gerar versões com o Relay" (contrato "Maestro → Relay" em docs/integration-contracts/relay.md, drizzle/0024): a cópia
// dos presets e do plano do Relay, a folha (ordem, no máximo 8, prévia), a ponte com o HUB e o SOBEDESCE de mentira
// (converter → 202, idempotente por ref:preset, acompanhar até pronto com MD5, cancelar, sem o plano, computador
// fechado) e os entregáveis com duas organizações e acesso por cliente.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { CLIENTE, prepararAmbiente, UUID } from "./ambiente.mts";
import { iniciarPonteFalsa } from "./ponte-falsa.mts";

const amb = await prepararAmbiente("relay");
const ponte = await iniciarPonteFalsa({ cliente: CLIENTE });
process.env.MAESTRO_PONTE_URL = ponte.url;
const { getBanco, schema, codigoPg } = amb.banco;
const { criarSessao, autenticar } = await import("../src/lib/auth/sessao");
const escolha = await import("../src/lib/relay/escolha");
const rel = await import("../src/lib/relay/entregaveis");
const presetsJs = await import("../src/lib/relay/presets.js");
const eq = await import("../src/lib/revisao/equipe");
const pessoas = await import("../src/lib/pessoas");

const ANA = UUID(); // admin
const EVA = UUID(); // equipe
const LEO = UUID(); // leitura
const BIA = UUID(); // admin da outra organização
let org: string;
let orgB: string;
let cliente: string;
let outroCliente: string;
let projeto: string;
let versao: string; // card aprovado, projeto sem pasta
let versaoSolta: string; // card sem projeto
let versaoMp4: string;
type S = NonNullable<Awaited<ReturnType<typeof autenticar>>>;
const s: Record<string, S> = {};

const ESCOPO = "openid email profile org offline_access zro.ia maestro.projects";
async function sessao(orgId: string, sub: string, produtos: string[]) {
  const { token } = await criarSessao({
    orgId,
    sub,
    produtos,
    release: { maestro: "allowed" },
    tokens: { at: `at-${sub}`, rt: "rt-teste", atExp: Math.floor(Date.now() / 1000) + 3600, escopo: ESCOPO },
  });
  return (await autenticar(token))!;
}
const TUDO = ["maestro", "sobedesce", "relay"];
const um = async (q: ReturnType<typeof sql>) => ((await getBanco().asSystem("teste", (tx) => tx.execute(q))) as unknown as { id: string }[])[0]?.id;

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora Relay" }).returning({ id: schema.organizations.id });
    const [b] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Outra" }).returning({ id: schema.organizations.id });
    org = a.id;
    orgB = b.id;
    await tx.insert(schema.members).values([
      { orgId: org, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: org, zroSub: EVA, role: "equipe", displayName: "Eva" },
      { orgId: org, zroSub: LEO, role: "leitura", displayName: "Leo" },
      { orgId: orgB, zroSub: BIA, role: "admin", displayName: "Bia" },
    ]);
    const [c] = await tx.insert(schema.clients).values({ orgId: org, name: "Café Aurora" }).returning({ id: schema.clients.id });
    cliente = c.id;
    const [c2] = await tx.insert(schema.clients).values({ orgId: org, name: "Norte Bikes" }).returning({ id: schema.clients.id });
    outroCliente = c2.id;
    const [p] = await tx
      .insert(schema.projects)
      .values({ orgId: org, clientId: cliente, code: "MAE-2026-014", title: "Filme manifesto" })
      .returning({ id: schema.projects.id });
    projeto = p.id;
  });
  s.ana = await sessao(org, ANA, TUDO);
  s.eva = await sessao(org, EVA, TUDO);
  s.leo = await sessao(org, LEO, TUDO);
  s.semRelay = await sessao(org, ANA, ["maestro", "sobedesce"]);
  s.semSobedesce = await sessao(org, ANA, ["maestro", "relay"]);
  s.bia = await sessao(orgB, BIA, TUDO);
  const ctx = { sub: ANA, orgId: org };
  await getBanco().asUser(ctx, async (tx) => {
    await tx.execute(sql`select maestro.card_criar('relayAprovado', ${JSON.stringify({ tema: "Manifesto", coluna: "aprovado", cliente, projeto })}::jsonb)`);
    await tx.execute(sql`select maestro.card_criar('relaySolto', ${JSON.stringify({ tema: "Sem projeto", coluna: "fazendo", cliente: outroCliente })}::jsonb)`);
  });
  for (const [card, link] of [
    ["relayAprovado", "https://drive.google.com/file/d/vid-manifesto/view"],
    ["relaySolto", "https://drive.google.com/file/d/vid-teaser/view"],
    ["relaySolto", "https://exemplo.com/peca.mp4"],
  ])
    assert.equal((await eq.novaVersao(ctx, card, link, "Corte")).ok, true);
  const vs = (await getBanco().asSystem("teste", (tx) =>
    tx.execute(sql`select id, card_id as card, fonte from maestro.versoes order by criado_em`),
  )) as unknown as { id: string; card: string; fonte: string }[];
  versao = vs[0].id;
  versaoSolta = vs[1].id;
  versaoMp4 = vs[2].id;
});
after(async () => {
  await ponte.fechar();
  await amb.fechar();
});

describe("a cópia do Relay no Maestro", () => {
  const relay = (f: string) => new URL(`../../relay/${f}`, import.meta.url);
  const temRelay = existsSync(relay("src/presets.js"));
  test("presets.js, plano.js e o ícone são iguais aos do Relay", { skip: !temRelay && "fora do monorepo" }, () => {
    for (const [copia, original] of [
      ["src/lib/relay/presets.js", "src/presets.js"],
      ["src/lib/relay/plano.js", "src/plano.js"],
      ["public/brand/relay-icone.svg", "marca/relay-icone.svg"],
    ])
      assert.ok(
        readFileSync(new URL(`../${copia}`, import.meta.url)).equals(readFileSync(relay(original))),
        `${copia}: copie de novo de products/relay/${original}`,
      );
  });
});

describe("a folha: presets, no máximo 8 e a prévia", () => {
  test("primeiro os de entrega ao cliente, na ordem do Relay; Tamanho exato fica de fora", () => {
    const { principais, mais } = escolha.presetsDaFolha();
    assert.deepEqual(
      principais.map((p) => p.id),
      presetsJs.ENTREGA_AO_CLIENTE,
    );
    assert.deepEqual(
      principais.map((p) => p.nome),
      ["YouTube 1080p", "YouTube 4K", "Reels · No Compress", "Instagram Feed 4:5", "TikTok", "WhatsApp", "Vimeo", "E-mail"],
    );
    const todos = [...principais, ...mais].map((p) => p.id);
    assert.ok(!todos.includes("tamanho"), "Tamanho exato pede o MB na hora");
    assert.ok(
      todos.every((id) => typeof id === "string" && id.length > 0),
      "preset sem id não aparece",
    );
    assert.equal(new Set(todos).size, todos.length);
    assert.ok(mais.some((p) => p.id === "youtube-1440") && mais.some((p) => p.id === "mp3"));
  });

  test("marcar até 8; o nono não entra; desmarcar libera", () => {
    let lista: string[] = [];
    const ids = escolha.presetsOferecidos().map((p) => p.id);
    for (const id of ids.slice(0, 8)) lista = escolha.alternar(lista, id).lista;
    assert.equal(lista.length, 8);
    const nono = escolha.alternar(lista, ids[8]);
    assert.equal(nono.cheio, true);
    assert.equal(nono.lista.length, 8);
    lista = escolha.alternar(lista, ids[0]).lista;
    assert.equal(lista.length, 7);
    assert.equal(escolha.alternar(lista, ids[8]).lista.length, 8);
  });

  test("o servidor confere: 1 a 8, só ids da lista, sem repetição; volta na ordem da folha", () => {
    assert.deepEqual(escolha.normalizarPresets(["whatsapp", "youtube-1080"]), ["youtube-1080", "whatsapp"]);
    assert.equal(escolha.normalizarPresets([]), null);
    assert.equal(escolha.normalizarPresets(["tamanho"]), null);
    assert.equal(escolha.normalizarPresets(["youtube-1080", "nao-existe"]), null);
    assert.equal(escolha.normalizarPresets(["whatsapp", "whatsapp"]), null);
    assert.equal(
      escolha.normalizarPresets(
        escolha
          .presetsOferecidos()
          .map((p) => p.id)
          .slice(0, 9),
      ),
      null,
    );
    assert.equal(escolha.normalizarPresets("youtube-1080"), null);
    assert.equal(escolha.chaveIdem("v1", "reels"), "v1:reels");
  });

  test("prévia: o nome que vai sair, o codec e o peso pelo planejar do Relay; sem os metadados, —", () => {
    const origem = escolha.origemDoDrive({ width: 1920, height: 1080, durationMillis: "60000" });
    assert.ok(origem);
    const [yt, zap, reels] = escolha.previa("Filme manifesto v3.mp4", ["youtube-1080", "whatsapp", "reels"], origem);
    assert.equal(yt.arquivo, "Filme manifesto v3 (YouTube 1080p).mp4");
    assert.equal(yt.codec, "H.264 · 1920×1080");
    assert.match(yt.peso, /^≈ \d+ MB$/);
    assert.equal(zap.codec, "H.264 · 1280×720");
    assert.ok(
      reels.avisos.some((a) => /faixas/.test(a)),
      "deitado numa tela em pé sai com faixas",
    );
    const sem = escolha.previa("Filme.mov", ["youtube-4k"], escolha.origemDoDrive(null));
    assert.deepEqual([sem[0].peso, sem[0].codec, sem[0].arquivo], ["—", "H.264", "Filme (YouTube 4K).mp4"]);
    // longo demais para os 25 MB do e-mail: a prévia diz, sem pedir
    const longo = escolha.previa("Longa.mp4", ["email"], escolha.origemDoDrive({ width: 3840, height: 2160, durationMillis: 3 * 3600_000 }));
    assert.match(String(longo[0].impossivel), /caber/);
  });

  test("o que vem do SOBEDESCE é conferido: pronto sem resultado não é pronto", () => {
    assert.equal(rel.pedidoConferido({ id: "rl-1", preset: "reels", status: "pronto" })?.status, "convertendo");
    assert.equal(rel.pedidoConferido({ id: "rl 1", preset: "reels", status: "pendente" }), null);
    assert.equal(rel.pedidoConferido({ id: "rl-1", preset: "reels", status: "feito" }), null);
    const ok = rel.pedidoConferido({ id: "rl-1", preset: "reels", status: "pronto", resultado: { arquivoId: "out-1", md5: "A".repeat(32), tamanho: 10 } });
    assert.equal(ok?.status, "pronto");
    assert.equal(ok?.resultado?.md5, "a".repeat(32));
  });
});

describe("a ponte: converter, acompanhar, cancelar", () => {
  test("a folha: a versão do Drive aprovada, a pasta 05 Entregas do projeto (ainda por criar)", async () => {
    const r = await rel.prepararRelay(s.ana, versao);
    assert.ok(r.ok);
    assert.equal(r.dados.disponivel.ok, true);
    assert.equal(r.dados.podeGerar, true);
    assert.equal(r.dados.versao.aprovada, true);
    assert.equal(r.dados.versao.driveId, "vid-manifesto");
    assert.deepEqual(r.dados.destino, { tipo: "entregas", id: null, nome: "05 Entregas", caminho: "Maestro/Café Aurora/MAE-2026-014 Filme manifesto" });
    assert.deepEqual(r.dados.entregaveis, []);
    // a ficha do card sabe que é do Drive e aprovada
    const [v] = await eq.versoesDoCard({ sub: ANA, orgId: org }, "relayAprovado");
    assert.deepEqual([v.driveId, v.aprovada], ["vid-manifesto", true]);
    // uma versão que não é do Drive não abre a folha
    assert.equal((await rel.prepararRelay(s.ana, versaoMp4)).ok, false);
  });

  test("Gerar 2 versões: cria a estrutura, pede ao SOBEDESCE (202) com ref = versão e grava pendente", async () => {
    const antes = ponte.estado.chamadas.length;
    const r = await rel.gerarVersoes(s.ana, { versaoId: versao, presets: ["whatsapp", "youtube-1080"], destino: "entregas", conta: "g-equipe" });
    assert.ok(r.ok, !r.ok ? r.mensagem : "");
    const chamadas = ponte.estado.chamadas.slice(antes);
    assert.deepEqual(
      chamadas.map((c) => c.acao),
      ["drive.pasta.criar", "relay.converter", "relay.pedido"],
    );
    const entregas = [...ponte.estado.pastas.values()].find((p) => p.nome === "05 Entregas")!;
    assert.deepEqual(chamadas[1].corpo, {
      arquivoId: "vid-manifesto",
      presets: ["youtube-1080", "whatsapp"],
      pastaId: entregas.id,
      ref: versao,
      conta: "g-equipe",
    });
    const pedidos = ponte.estado.pedidos.slice(-3);
    assert.ok(pedidos.every((p) => p.jeito === "pessoa" && p.autorizacao === `Bearer at-${ANA}`));
    assert.deepEqual(
      r.dados.entregaveis.map((e) => [e.preset, e.status, e.pasta?.nome]),
      [
        ["youtube-1080", "pendente", "05 Entregas"],
        ["whatsapp", "pendente", "05 Entregas"],
      ],
    );
    assert.deepEqual(r.dados.computador, { aberto_agora: false, usado_ha_pouco: false });
    // o projeto ficou ligado à pasta criada
    const [p] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select drive_folder_id as id from maestro.projects where id = ${projeto}::uuid`),
    )) as unknown as { id: string }[];
    assert.ok(p.id);
  });

  test("pedir de novo é idempotente: o mesmo pedido, nenhuma linha nova; a pasta já existe e é achada", async () => {
    const antes = ponte.estado.relay.pedidos.size;
    const antesCh = ponte.estado.chamadas.length;
    const r = await rel.gerarVersoes(s.ana, { versaoId: versao, presets: ["youtube-1080", "whatsapp"], destino: "entregas" });
    assert.ok(r.ok);
    assert.equal(ponte.estado.relay.pedidos.size, antes);
    assert.deepEqual(
      ponte.estado.chamadas.slice(antesCh).map((c) => c.acao),
      ["drive.listar", "relay.converter", "relay.pedido"],
    );
    const [n] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.entregaveis where versao_id = ${versao}::uuid`),
    )) as unknown as { n: number }[];
    assert.equal(n.n, 2);
    const prep = await rel.prepararRelay(s.ana, versao);
    assert.ok(prep.ok);
    assert.equal(prep.dados.destino?.tipo, "entregas");
    assert.ok(prep.dados.destino?.id);
  });

  test("acompanhar: sem a tela à vista não pergunta; com o computador fechado fica pendente", async () => {
    const antes = ponte.estado.chamadas.length;
    const quieto = await rel.entregaveisDoCard(s.ana, "relayAprovado", false);
    assert.equal(ponte.estado.chamadas.length, antes);
    assert.equal(quieto.entregaveis.length, 2);
    const r = await rel.entregaveisDoCard(s.ana, "relayAprovado", true);
    assert.deepEqual(r.computador, { aberto_agora: false, usado_ha_pouco: false });
    assert.ok(r.entregaveis.every((e) => e.status === "pendente"));
  });

  test("o computador abre: convertendo com % e depois pronto com o MD5 e o link do Drive", async () => {
    ponte.estado.relay.avancar = true;
    ponte.estado.relay.computador.aberto_agora = true;
    try {
      const um = await rel.entregaveisDoCard(s.ana, "relayAprovado", true);
      assert.ok(um.entregaveis.every((e) => e.status === "convertendo" && e.frac === 0.5));
      assert.equal(um.computador?.aberto_agora, true);
      const dois = await rel.entregaveisDoCard(s.ana, "relayAprovado", true);
      for (const e of dois.entregaveis) {
        assert.equal(e.status, "pronto");
        assert.match(String(e.arquivo?.md5), /^[0-9a-f]{32}$/);
        assert.equal(e.arquivo?.abrir, `https://drive.google.com/file/d/${e.arquivo?.id}/view`);
      }
      assert.equal(dois.entregaveis[0].arquivo?.nome, "Filme manifesto v3 (YouTube 1080p).mp4");
      // terminado: não pergunta mais
      const antes = ponte.estado.chamadas.length;
      await rel.entregaveisDoCard(s.ana, "relayAprovado", true);
      assert.equal(ponte.estado.chamadas.length, antes);
    } finally {
      ponte.estado.relay.avancar = false;
    }
  });

  test("cancelar o que espera; o que já está pronto continua pronto", async () => {
    const r = await rel.gerarVersoes(s.eva, { versaoId: versao, presets: ["tiktok"], destino: "original" });
    assert.ok(r.ok);
    const conv = ponte.estado.chamadas.filter((c) => c.acao === "relay.converter").at(-1)!;
    assert.equal("pastaId" in conv.corpo, false, "ao lado do original: sem pastaId");
    const tk = r.dados.entregaveis.find((e) => e.preset === "tiktok")!;
    assert.equal(tk.pasta, null);
    const c = await rel.cancelarEntregavel(s.eva, tk.id);
    assert.ok(c.ok);
    assert.equal(c.dados.status, "cancelado");
    const pronto = r.dados.entregaveis.find((e) => e.preset === "whatsapp")!;
    const p = await rel.cancelarEntregavel(s.eva, pronto.id);
    assert.ok(p.ok);
    assert.equal(p.dados.status, "pronto");
    // pedir de novo um cancelado vira um pedido novo, na mesma linha
    const de = await rel.gerarVersoes(s.ana, { versaoId: versao, presets: ["tiktok"], destino: "original" });
    assert.ok(de.ok);
    const novo = de.dados.entregaveis.find((e) => e.preset === "tiktok")!;
    assert.equal(novo.id, tk.id);
    assert.equal(novo.status, "pendente");
  });

  test("erro do computador fica como erro, com a mensagem", async () => {
    Object.assign(ponte.estado.relay, { avancar: true, falhar: true });
    try {
      await rel.entregaveisDoCard(s.ana, "relayAprovado", true);
      const r = await rel.entregaveisDoCard(s.ana, "relayAprovado", true);
      const tk = r.entregaveis.find((e) => e.preset === "tiktok")!;
      assert.deepEqual([tk.status, tk.erro], ["erro", "O ffmpeg parou no meio."]);
    } finally {
      Object.assign(ponte.estado.relay, { avancar: false, falhar: false });
    }
  });

  test("card sem projeto: só ao lado do original; pedir 'entregas' cai no original", async () => {
    const r = await rel.prepararRelay(s.ana, versaoSolta);
    assert.ok(r.ok);
    assert.equal(r.dados.destino?.tipo, "original");
    assert.equal(r.dados.versao.aprovada, false);
    const g = await rel.gerarVersoes(s.ana, { versaoId: versaoSolta, presets: ["reels"], destino: "entregas" });
    assert.ok(g.ok);
    assert.equal(g.dados.entregaveis[0].pasta, null);
  });

  test("sem o Relay ou sem o SOBEDESCE: o porquê com o link, e nada é pedido ao HUB", async () => {
    const antes = ponte.estado.pedidos.length;
    const semRelay = await rel.prepararRelay(s.semRelay, versao);
    assert.ok(semRelay.ok);
    assert.equal(semRelay.dados.podeGerar, false);
    assert.ok(!semRelay.dados.disponivel.ok && semRelay.dados.disponivel.erro === "sem_relay");
    const semSd = await rel.prepararRelay(s.semSobedesce, versao);
    assert.ok(semSd.ok && !semSd.dados.disponivel.ok && semSd.dados.disponivel.erro === "sem_sobedesce");
    assert.match(!semSd.dados.disponivel.ok ? semSd.dados.disponivel.link.href : "", /\/planos$/);
    const g = await rel.gerarVersoes(s.semRelay, { versaoId: versao, presets: ["reels"], destino: "original" });
    assert.ok(!g.ok && g.status === 403 && g.erro === "sem_relay");
    assert.equal(ponte.estado.pedidos.length, antes, "nem pediu ao HUB");
    // e o que já foi pedido segue visível
    assert.ok(semRelay.dados.entregaveis.length >= 2);
  });

  test("o HUB nega o Relay (plano) ou ainda não tem as ações relay.* na PONTES: 403 sem_relay", async () => {
    for (const k of ["negar", "semPonte"] as const) {
      ponte.estado.relay[k] = true;
      try {
        const g = await rel.gerarVersoes(s.ana, { versaoId: versao, presets: ["vimeo"], destino: "original" });
        assert.ok(!g.ok && g.status === 403 && g.erro === "sem_relay", k);
      } finally {
        ponte.estado.relay[k] = false;
      }
    }
  });

  test("quem só lê vê os entregáveis, não pede, não cancela e não faz o SOBEDESCE perguntar", async () => {
    const r = await rel.prepararRelay(s.leo, versao);
    assert.ok(r.ok);
    assert.equal(r.dados.podeGerar, false);
    assert.ok(r.dados.entregaveis.length >= 2);
    const g = await rel.gerarVersoes(s.leo, { versaoId: versao, presets: ["reels"], destino: "original" });
    assert.ok(!g.ok && g.erro === "sem_permissao");
    const c = await rel.cancelarEntregavel(s.leo, r.dados.entregaveis[0].id);
    assert.ok(!c.ok && c.erro === "sem_permissao");
    const antes = ponte.estado.chamadas.length;
    await rel.entregaveisDoCard(s.leo, "relayAprovado", true);
    assert.equal(ponte.estado.chamadas.length, antes);
  });

  test("entradas ruins: 400 sem pedir", async () => {
    for (const presets of [[], ["tamanho"], Array(9).fill("reels")]) {
      const g = await rel.gerarVersoes(s.ana, { versaoId: versao, presets, destino: "original" });
      assert.ok(!g.ok && g.status === 400);
    }
    assert.equal((await rel.gerarVersoes(s.ana, { versaoId: "x", presets: ["reels"], destino: "original" })).ok, false);
    assert.equal((await rel.cancelarEntregavel(s.ana, "x")).ok, false);
  });
});

describe("a url que o HUB devolve", () => {
  test("só a rota da ação pedida, em /api/zro/relay/", async () => {
    const ponteLib = await import("../src/lib/sobedesce/ponte");
    assert.ok(ponteLib.urlConfere("https://sobedesce.com/api/zro/relay/converter", "relay.converter"));
    assert.equal(ponteLib.urlConfere("https://sobedesce.com/api/zro/relay/cancelar", "relay.converter"), null);
    assert.equal(ponteLib.urlConfere("https://sobedesce.com/api/zro/drive/token", "relay.pedido"), null);
    assert.equal(ponteLib.urlConfere("https://sobedesce.com/api/zro/outra/coisa"), null);
  });
});

describe("entregáveis: duas organizações e acesso por cliente", () => {
  test("RLS ligado, políticas de organização e de cliente", async () => {
    const r = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`
        select c.relrowsecurity as rls,
               array(select policyname::text from pg_policies p where p.schemaname = 'maestro' and p.tablename = 'entregaveis' order by 1) as pol
          from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'maestro' and c.relname = 'entregaveis'`),
    )) as unknown as { rls: boolean; pol: string[] }[];
    assert.equal(r[0].rls, true);
    for (const p of ["entregaveis_org", "entregaveis_cliente", "entregaveis_escrita"]) assert.ok(r[0].pol.includes(p), p);
  });

  test("a outra organização não vê, não grava e não aponta para a versão daqui", async () => {
    const b = { sub: BIA, orgId: orgB };
    assert.equal((await rel.entregaveisDoCard(s.bia, "relayAprovado", true)).entregaveis.length, 0);
    assert.equal((await rel.prepararRelay(s.bia, versao)).ok, false);
    const n = (await getBanco().asUser(b, (tx) => tx.execute(sql`select count(*)::int as n from maestro.entregaveis`))) as unknown as { n: number }[];
    assert.equal(n[0].n, 0);
    const e = await getBanco()
      .asUser(b, (tx) =>
        tx.execute(sql`insert into maestro.entregaveis (org_id, card_id, versao_id, preset) values (${org}::uuid, 'relayAprovado', ${versao}::uuid, 'reels')`),
      )
      .then(
        () => null,
        (x) => x,
      );
    assert.ok(e, "a B não grava na A");
    // nem com a própria organização apontando para a versão da A (chave composta)
    const e2 = await getBanco()
      .asUser(b, (tx) =>
        tx.execute(sql`insert into maestro.entregaveis (org_id, card_id, versao_id, preset) values (${orgB}::uuid, 'relayAprovado', ${versao}::uuid, 'reels')`),
      )
      .then(
        () => null,
        (x) => x,
      );
    assert.ok(e2);
    const [id] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select id from maestro.entregaveis where org_id = ${org}::uuid limit 1`),
    )) as unknown as { id: string }[];
    const mudou = await getBanco().asUser(b, (tx) =>
      tx.execute(sql`update maestro.entregaveis set status = 'erro', erro = 'x' where id = ${id.id}::uuid returning id`),
    );
    assert.equal(mudou.length, 0);
    assert.equal((await rel.cancelarEntregavel(s.bia, id.id)).ok, false);
  });

  test("a versão de um card não serve para outro card (chave composta) e pronto exige arquivo e MD5", async () => {
    const ctx = { sub: ANA, orgId: org };
    const e = await getBanco()
      .asUser(ctx, (tx) =>
        tx.execute(sql`insert into maestro.entregaveis (org_id, card_id, versao_id, preset) values (${org}::uuid, 'relaySolto', ${versao}::uuid, 'feed')`),
      )
      .then(
        () => null,
        (x) => x,
      );
    assert.equal(codigoPg(e), "23503");
    const e2 = await getBanco()
      .asUser(ctx, (tx) =>
        tx.execute(
          sql`insert into maestro.entregaveis (org_id, card_id, versao_id, preset, status) values (${org}::uuid, 'relayAprovado', ${versao}::uuid, 'feed', 'pronto')`,
        ),
      )
      .then(
        () => null,
        (x) => x,
      );
    assert.equal(codigoPg(e2), "23514");
  });

  test("restrita a um cliente: só os entregáveis dos cards dele", async () => {
    const eva = { sub: EVA, orgId: org };
    const total = (await rel.entregaveisDoCard(s.eva, "relayAprovado")).entregaveis.length;
    assert.ok(total >= 2);
    assert.equal((await pessoas.salvarAcesso({ sub: ANA, orgId: org }, EVA, true, [outroCliente])).ok, true);
    try {
      assert.equal((await rel.entregaveisDoCard(s.eva, "relayAprovado")).entregaveis.length, 0);
      assert.equal((await rel.prepararRelay(s.eva, versao)).ok, false);
      assert.equal((await rel.gerarVersoes(s.eva, { versaoId: versao, presets: ["reels"], destino: "original" })).ok, false);
      assert.ok((await rel.entregaveisDoCard(s.eva, "relaySolto")).entregaveis.length >= 1);
      const fora = await getBanco()
        .asUser(eva, (tx) =>
          tx.execute(sql`insert into maestro.entregaveis (org_id, card_id, versao_id, preset) values (${org}::uuid, 'relayAprovado', ${versao}::uuid, 'feed')`),
        )
        .then(
          () => null,
          (x) => x,
        );
      assert.ok(fora, "não grava no card de fora");
    } finally {
      assert.equal((await pessoas.salvarAcesso({ sub: ANA, orgId: org }, EVA, false, [])).ok, true);
    }
    assert.equal(await um(sql`select id from maestro.entregaveis where preset = 'feed'`), undefined);
  });
});

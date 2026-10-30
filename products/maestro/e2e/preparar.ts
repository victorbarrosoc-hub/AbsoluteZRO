/**
 * Antes do e2e: recria `maestro_test_e2e`, aplica as migrações, cria uma organização de teste com a pessoa admin e
 * uma sessão com acesso ao Maestro (claims como o login daria). O cookie vai para test-results/e2e-sessao.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { E2E_DB, E2E_KEY } from "../playwright.config";

export const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";
export const ARQUIVO_SESSAO_DEMO = "test-results/e2e-sessao-demo.json";
export const ARQUIVO_SESSAO_COMERCIAL = "test-results/e2e-sessao-comercial.json";
export const ARQUIVO_SESSAO_NEGOCIO = "test-results/e2e-sessao-negocio.json";
export const ARQUIVO_SESSAO_DRIVE = "test-results/e2e-sessao-drive.json";
export const ARQUIVO_SESSAO_CORTE = "test-results/e2e-sessao-corte.json";
export const ARQUIVO_SESSAO_CONTRATO = "test-results/e2e-sessao-contrato.json";
export const ARQUIVO_SESSAO_AGENDA = "test-results/e2e-sessao-agenda.json";
export const ARQUIVO_SESSAO_GESTOS = "test-results/e2e-sessao-gestos.json";
export const ARQUIVO_SESSAO_COLUNAS = "test-results/e2e-sessao-colunas.json";
export const ARQUIVO_SESSAO_ARRASTAR = "test-results/e2e-sessao-arrastar.json";
/** A ponte falsa (HUB + SOBEDESCE de mentira, tests/ponte-falsa.mts) do e2e de Arquivos: MAESTRO_PONTE_URL no servidor. */
export const PORTA_PONTE = Number(process.env.E2E_PONTE_PORT || 3219);
/** A ANP falsa (tests/anp-fixture.mts, valores inventados) da calculadora de deslocamento: MAESTRO_ANP_URL no servidor. */
export const PORTA_ANP = Number(process.env.E2E_ANP_PORT || 3221);

export default async function preparar() {
  const alvo = new URL(E2E_DB);
  const admin = new URL(E2E_DB);
  admin.pathname = "/postgres";
  const a = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const nome = alvo.pathname.slice(1);
    if (!/^maestro_test_e2e[a-z0-9_]*$/.test(nome)) throw new Error(`Banco do e2e inesperado: ${nome}`);
    await a.unsafe(`drop database if exists ${nome} with (force)`);
    await a.unsafe(`create database ${nome}`);
  } finally {
    await a.end();
  }
  const sql = postgres(alvo.toString(), { max: 1, onnotice: () => {} });
  try {
    const { migrarNoSchema } = await import("../src/lib/db/migrador");
    await migrarNoSchema(sql, "./drizzle");
  } finally {
    await sql.end();
  }

  Object.assign(process.env, { MAESTRO_DATABASE_URL: E2E_DB, MAESTRO_KEY: E2E_KEY });
  const { getBanco, fecharBanco, schema } = await import("../src/lib/db/client");
  const { sql: q } = await import("drizzle-orm");
  const { criarSessao } = await import("../src/lib/auth/sessao");
  const SUB = "00000000-0000-4000-8000-0000000000e2";
  try {
    const orgId = await getBanco().asSystem("e2e: semente", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000e1", name: "Produtora E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB, displayName: "Pessoa E2E", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const { token } = await criarSessao({ orgId, sub: SUB, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    mkdirSync("test-results", { recursive: true });
    writeFileSync(ARQUIVO_SESSAO, JSON.stringify({ token }));
    // Uma segunda organização só para a demonstração da produtora (e2e/produtora.spec.ts), sem mexer na de cima.
    const SUB_DEMO = "00000000-0000-4000-8000-0000000000d2";
    const orgDemo = await getBanco().asSystem("e2e: semente da demonstração", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000d1", name: "Produtora Demonstração E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_DEMO, displayName: "Pessoa Demo", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const demo = await criarSessao({ orgId: orgDemo, sub: SUB_DEMO, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_DEMO, JSON.stringify({ token: demo.token }));
    // Uma terceira organização para o ciclo comercial (e2e/comercial.spec.ts): tabela de preços mínima e a marca.
    const SUB_COM = "00000000-0000-4000-8000-0000000000c2";
    const orgCom = await getBanco().asSystem("e2e: semente do comercial", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000c1", name: "Lumen Filmes E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_COM, displayName: "Pessoa Comercial", hubRole: "owner", role: "admin" });
      const um = async (x: ReturnType<typeof q>) => ((await tx.execute(x)) as unknown as { id: string }[])[0].id;
      const diaria = await um(
        q`insert into maestro.precos_itens (org_id, grupo, nome, unidade, preco_cents, custo_cents) values (${org.id}, 'captacao', 'Diária de captação', 'diaria', 180000, 90000) returning id`,
      );
      const edicao = await um(
        q`insert into maestro.precos_itens (org_id, grupo, nome, unidade, preco_cents, custo_cents) values (${org.id}, 'pos', 'Edição de vídeo curto', 'video', 90000, 35000) returning id`,
      );
      await tx.execute(q`
        insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo, opcoes, ordem) values
          (${org.id}, 'nicho', 'Nicho', 'escolha', ${JSON.stringify([
            { valor: "corporativo", rotulo: "Corporativo", mult: 1 },
            { valor: "casamento", rotulo: "Casamento", mult: 1.3 },
          ])}::jsonb, 0),
          (${org.id}, 'videos', 'Vídeos', 'numero', '[]'::jsonb, 1),
          (${org.id}, 'diarias', 'Diárias', 'numero', '[]'::jsonb, 2)`);
      await tx.execute(q`
        insert into maestro.orcamento_modelos (org_id, nome, nicho, descricao, linhas, respostas) values (${org.id}, 'Filme institucional', 'corporativo',
          'Diárias, edição e cor.', ${JSON.stringify([
            { itemId: diaria, qtd: { var: "diarias", min: 1 } },
            { itemId: edicao, qtd: { var: "videos", min: 1 } },
          ])}::jsonb, ${JSON.stringify({ nicho: "corporativo", diarias: 1, videos: 1 })}::jsonb)`);
      await tx.execute(q`insert into maestro.org_marca (org_id, nome, cor, email) values (${org.id}, 'Lumen Filmes', '#0f7b5f', 'contato@exemplo.com')`);
      return org.id;
    });
    const com = await criarSessao({ orgId: orgCom, sub: SUB_COM, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_COMERCIAL, JSON.stringify({ token: com.token }));
    // Uma quarta organização para o negócio (e2e/negocio.spec.ts): funil, importar, agenda .ics e acesso por cliente.
    // Admin (Nara) e uma pessoa da equipe (Téo), mais dois clientes com projeto e card, e um pedido por aparelho.
    const SUB_NEG = "00000000-0000-4000-8000-0000000000b2";
    const SUB_TEO = "00000000-0000-4000-8000-0000000000b3";
    const neg = await getBanco().asSystem("e2e: semente do negócio", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000b1", name: "Estúdio Negócio E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values([
        { orgId: org.id, zroSub: SUB_NEG, displayName: "Nara Gestão", hubRole: "owner", role: "admin" },
        { orgId: org.id, zroSub: SUB_TEO, displayName: "Téo Equipe", email: "teo@exemplo.com", hubRole: "editor", role: "equipe" },
      ]);
      const um = async (x: ReturnType<typeof q>) => ((await tx.execute(x)) as unknown as { id: string }[])[0].id;
      const sim = await um(q`insert into maestro.clients (org_id, name) values (${org.id}, 'Cliente Permitido') returning id`);
      const nao = await um(q`insert into maestro.clients (org_id, name) values (${org.id}, 'Cliente Proibido') returning id`);
      for (const [c, nome, n] of [
        [sim, "Permitido", "001"],
        [nao, "Proibido", "002"],
      ] as const) {
        await tx.execute(q`insert into maestro.projects (org_id, code, title, client_id) values (${org.id}, ${`MAE-2026-${n}`}, ${`Projeto ${nome}`}, ${c})`);
        await tx.execute(
          q`insert into maestro.cards (org_id, id, dados) values (${org.id}, ${`e2e-${n}`}, ${JSON.stringify({ tema: `Card ${nome}`, coluna: "fazendo", cliente: c })}::jsonb)`,
        );
      }
      for (const [prot, nome] of [
        ["NEGPC001", "Lead Computador"],
        ["NEGPI001", "Lead Iphone"],
      ])
        await tx.execute(
          q`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, respostas) values (${org.id}, ${prot}, ${nome}, 'lead@exemplo.com', now(), '{"tipo":"Filme institucional","vars":{}}'::jsonb)`,
        );
      return { org: org.id, nao };
    });
    const sNeg = await criarSessao({ orgId: neg.org, sub: SUB_NEG, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    const sTeo = await criarSessao({ orgId: neg.org, sub: SUB_TEO, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_NEGOCIO, JSON.stringify({ token: sNeg.token, equipe: sTeo.token, proibido: neg.nao }));
    // Uma quinta organização com o SOBEDESCE no plano (e2e/arquivos.spec.ts): Drive de mentira pela ponte falsa, um
    // projeto e um lote com a versão do Drive. A sessão tem o token da Absolute ZRO (escopo maestro.projects).
    const SUB_DRV = "00000000-0000-4000-8000-0000000000f2";
    const drv = await getBanco().asSystem("e2e: semente do Drive", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000f1", name: "Aurora Filmes E2E", zroProducts: ["maestro", "sobedesce"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_DRV, displayName: "Pessoa Drive", hubRole: "owner", role: "admin" });
      const um = async (x: ReturnType<typeof q>) => ((await tx.execute(x)) as unknown as { id: string }[])[0].id;
      const cli = await um(q`insert into maestro.clients (org_id, name) values (${org.id}, 'Café Aurora') returning id`);
      await tx.execute(q`insert into maestro.projects (org_id, client_id, code, title) values (${org.id}, ${cli}, 'MAE-2026-014', 'Filme manifesto')`);
      await tx.execute(q`insert into maestro.projects (org_id, client_id, code, title) values (${org.id}, ${cli}, 'MAE-2026-015', 'Teasers de lançamento')`);
      await tx.execute(
        q`insert into maestro.cards (org_id, id, dados) values (${org.id}, 'e2e-drive-1', ${JSON.stringify({ tema: "Filme manifesto", coluna: "revisao", cliente: cli })}::jsonb)`,
      );
      const lote = await um(
        q`insert into maestro.lotes (org_id, client_id, title, status) values (${org.id}, ${cli}, 'Manifesto · semana 44', 'rascunho') returning id`,
      );
      await tx.execute(q`insert into maestro.lote_cards (lote_id, org_id, card_id, posicao, volta) values (${lote}, ${org.id}, 'e2e-drive-1', 0, 1)`);
      await tx.execute(q`
        insert into maestro.versoes (org_id, card_id, n, titulo, fonte, url, drive_file_id)
        values (${org.id}, 'e2e-drive-1', 1, 'Corte 1', 'drive', 'https://drive.google.com/file/d/vid-manifesto/view', 'vid-manifesto')`);
      return { org: org.id, lote };
    });
    const sDrv = await criarSessao({
      orgId: drv.org,
      sub: SUB_DRV,
      produtos: ["maestro", "sobedesce"],
      release: { maestro: "allowed" },
      tokens: {
        at: "at-e2e-drive",
        rt: "rt-e2e-drive",
        atExp: Math.floor(Date.now() / 1000) + 24 * 3600,
        escopo: "openid email profile org offline_access zro.ia maestro.projects",
      },
    });
    writeFileSync(ARQUIVO_SESSAO_DRIVE, JSON.stringify({ token: sDrv.token, lote: drv.lote }));
    // Uma sexta organização só para o detector de corte (e2e/sem-corte.spec.ts): a demonstração inteira carregada e os
    // tokens dos links que ela gera (aprovação, pedido e orçamento), para abrir cada tela pública sem passar pela UI.
    const SUB_CORTE = "00000000-0000-4000-8000-0000000000a2";
    const orgCorte = await getBanco().asSystem("e2e: semente do corte", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000a1", name: "Produtora Corte E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_CORTE, displayName: "Diana Corte", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const ctxCorte = { sub: SUB_CORTE, orgId: orgCorte };
    const { carregarDemonstracao } = await import("../src/lib/demo/demonstracao");
    const carregou = await carregarDemonstracao(ctxCorte);
    if (!carregou.ok) throw new Error(carregou.mensagem);
    const { listarLotes, tokenDoLink } = await import("../src/lib/revisao/equipe");
    const { lerLinkDePedido } = await import("../src/lib/pedidos/equipe");
    const { lerLinkDoOrcamento } = await import("../src/lib/orcamento/link");
    const lotes = await listarLotes(ctxCorte);
    const comLink = lotes.find((l) => l.link);
    const tokenLote = comLink ? await tokenDoLink(ctxCorte, comLink.id) : null;
    const orcs = await getBanco().asUser(
      ctxCorte,
      async (tx) =>
        (await tx.execute(q`select orcamento_id as id from maestro.links_publicos where tipo = 'orcamento' and revogado_em is null`)) as unknown as {
          id: string;
        }[],
    );
    let tokenOrc: string | null = null;
    for (const o of orcs) tokenOrc ??= (await lerLinkDoOrcamento(ctxCorte, o.id))?.token ?? null;
    const sCorte = await criarSessao({ orgId: orgCorte, sub: SUB_CORTE, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(
      ARQUIVO_SESSAO_CORTE,
      JSON.stringify({
        token: sCorte.token,
        lote: comLink?.id ?? lotes[0]?.id ?? null,
        lotes: lotes.map((l) => l.id),
        a: tokenLote,
        p: (await lerLinkDePedido(ctxCorte))?.token ?? null,
        o: tokenOrc,
      }),
    );
    // Uma sétima organização para o contrato e a marca própria (e2e/contrato.spec.ts): a demonstração inteira e o sinal
    // maestro.marca_propria na organização (como o HUB mandaria na claim zro_features).
    const SUB_CT = "00000000-0000-4000-8000-000000000ca2";
    const orgCt = await getBanco().asSystem("e2e: semente do contrato", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({
          zroOrgId: "00000000-0000-4000-8000-000000000ca1",
          name: "Contrato E2E",
          zroProducts: ["maestro"],
          zroFeatures: ["maestro.marca_propria"],
        })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_CT, displayName: "Clara Contrato", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const ctxCt = { sub: SUB_CT, orgId: orgCt };
    const ct = await carregarDemonstracao(ctxCt);
    if (!ct.ok) throw new Error(ct.mensagem);
    const [rasc] = await getBanco().asUser(
      ctxCt,
      async (tx) =>
        (await tx.execute(
          q`select id from maestro.orcamentos where status = 'rascunho' and (validade is null or validade >= current_date) order by numero limit 1`,
        )) as unknown as { id: string }[],
    );
    const sCt = await criarSessao({ orgId: orgCt, sub: SUB_CT, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_CONTRATO, JSON.stringify({ token: sCt.token, rascunho: rasc?.id ?? null }));
    // Uma organização para o Google Agenda pelas Conexões (e2e/agenda-google.spec.ts): a sessão tem o escopo zro.agenda e
    // a Agenda do HUB é a da ponte falsa; uma diária com hora e um card com prazo.
    const SUB_AG = "00000000-0000-4000-8000-0000000000a9";
    const orgAg = await getBanco().asSystem("e2e: semente da agenda Google", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000a8", name: "Estúdio Agenda E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_AG, displayName: "Diana Agenda", hubRole: "owner", role: "admin" });
      await tx.execute(
        q`insert into maestro.eventos (org_id, tipo, titulo, data, hora_ini, hora_fim, local) values (${org.id}, 'diaria', 'Campanha verão', '2026-11-24', '08:00', '18:00', 'Estúdio 2')`,
      );
      await tx.execute(
        q`insert into maestro.cards (org_id, id, dados) values (${org.id}, 'e2e-agenda-1', ${JSON.stringify({ tema: "Reels de lançamento", coluna: "fazendo", prazo: "2026-11-26" })}::jsonb)`,
      );
      return org.id;
    });
    const sAg = await criarSessao({
      orgId: orgAg,
      sub: SUB_AG,
      produtos: ["maestro"],
      release: { maestro: "allowed" },
      tokens: {
        at: "at-e2e-agenda",
        rt: "rt-e2e-agenda",
        atExp: Math.floor(Date.now() / 1000) + 24 * 3600,
        escopo: "openid email profile org offline_access zro.ia maestro.projects zro.agenda zro.pessoas",
      },
    });
    writeFileSync(ARQUIVO_SESSAO_AGENDA, JSON.stringify({ token: sAg.token }));
    // Uma organização para os gestos do Quadro no celular (e2e/gestos.spec.ts): os cards são semeados pelo próprio teste.
    const SUB_GE = "00000000-0000-4000-8000-0000000000b8";
    const orgGe = await getBanco().asSystem("e2e: semente dos gestos", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000b7", name: "Gestos E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_GE, displayName: "Gil Gestos", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const sGe = await criarSessao({ orgId: orgGe, sub: SUB_GE, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_GESTOS, JSON.stringify({ token: sGe.token, org: orgGe }));
    // Uma organização para as colunas do Quadro (e2e/colunas.spec.ts): administração (edita) e equipe (só usa).
    const SUB_CO = "00000000-0000-4000-8000-0000000000c8";
    const SUB_CO_EQ = "00000000-0000-4000-8000-0000000000c9";
    const orgCo = await getBanco().asSystem("e2e: semente das colunas", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000c7", name: "Colunas E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values([
        { orgId: org.id, zroSub: SUB_CO, displayName: "Cora Colunas", hubRole: "owner", role: "admin" },
        { orgId: org.id, zroSub: SUB_CO_EQ, displayName: "Edu Equipe", hubRole: "editor", role: "equipe" },
      ]);
      return org.id;
    });
    const sCo = await criarSessao({ orgId: orgCo, sub: SUB_CO, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    const sCoEq = await criarSessao({ orgId: orgCo, sub: SUB_CO_EQ, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_COLUNAS, JSON.stringify({ token: sCo.token, equipe: sCoEq.token, org: orgCo }));
    // Uma organização para arrastar o card com o mouse (e2e/arrastar.spec.ts): os cards são semeados pelo próprio teste.
    const SUB_AR = "00000000-0000-4000-8000-0000000000d8";
    const orgAr = await getBanco().asSystem("e2e: semente do arrastar", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000d7", name: "Arrastar E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_AR, displayName: "Ari Arrasta", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const sAr = await criarSessao({ orgId: orgAr, sub: SUB_AR, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_ARRASTAR, JSON.stringify({ token: sAr.token, org: orgAr }));
  } finally {
    await fecharBanco();
  }
  // A ponte falsa vive enquanto o Playwright roda (o retorno é o teardown).
  const { iniciarPonteFalsa } = await import("../tests/ponte-falsa.mts");
  const ponte = await iniciarPonteFalsa({ porta: PORTA_PONTE });
  const { iniciarAnpFalsa } = await import("../tests/anp-fixture.mts");
  const anp = await iniciarAnpFalsa(PORTA_ANP);
  return async () => {
    await ponte.fechar();
    await anp.fechar();
  };
}

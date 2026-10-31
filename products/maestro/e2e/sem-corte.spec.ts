/**
 * Nada cortado no iPhone: o detector (e2e/corte.ts) passa em todas as telas do Maestro com a demonstração carregada
 * (organização própria em e2e/preparar.ts), a 375 e a 393 px, no claro e no escuro, no Chromium e no WebKit (Safari).
 * Cada achado é um texto, botão ou campo que some dentro da própria caixa; faixa com rolagem de lado só com
 * `data-rolagem` (chips e abas de propósito). Com CORTE_SHOTS=<pasta>, guarda uma captura de cada tela.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";
import { achadosDeCorte } from "./corte";
import { googleDeMentira } from "./falsos/google-drive";
import { sobedesceDeMentira } from "./falsos/sobedesce";

const CORTE = "test-results/e2e-sessao-corte.json";
const DRIVE = "test-results/e2e-sessao-drive.json";
const SHOTS = process.env.CORTE_SHOTS;
type Sessao = { token: string; lote: string | null; lotes: string[]; a: string | null; p: string | null; o: string | null };
const sessao = () => JSON.parse(readFileSync(CORTE, "utf8")) as Sessao;

type Tela = {
  nome: string;
  rota: string;
  drive?: true;
  publica?: true;
  /** A área do freela (drizzle/0037): a sessão da Alice (com trabalhos) ou da Cora (ligada, sem trabalho). */
  freela?: "alice" | "cora";
  depois?: (page: Page, ver: (nome: string) => Promise<void>) => Promise<void>;
};
const AREA_FREELA = "test-results/e2e-sessao-area-freela.json";
const areaFreela = () => JSON.parse(readFileSync(AREA_FREELA, "utf8")) as { alice: string; cora: string; aliceDiaria: string };

/** Os ids das fichas da demonstração, lidos direto no banco do e2e. */
async function ids() {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const [org] = await sql`select id from maestro.organizations where zro_org_id = '00000000-0000-4000-8000-0000000000a1'`;
    const um = async (q: Promise<{ id: string }[]>) => (await q)[0]?.id ?? null;
    return {
      projeto: await um(sql`select id from maestro.projects where org_id = ${org.id} and deleted_at is null order by created_at limit 1`),
      cliente: await um(sql`select id from maestro.clients where org_id = ${org.id} and deleted_at is null order by created_at limit 1`),
      pedido: await um(sql`select id from maestro.pedidos where org_id = ${org.id} order by created_at limit 1`),
      rascunho: await um(sql`select id from maestro.orcamentos where org_id = ${org.id} and status = 'rascunho' limit 1`),
      aprovado: await um(sql`select id from maestro.orcamentos where org_id = ${org.id} and status = 'aprovado' limit 1`),
      enviado: await um(sql`select id from maestro.orcamentos where org_id = ${org.id} and status = 'enviado' limit 1`),
      freela: await um(
        sql`select f.id from maestro.freelas f where f.org_id = ${org.id} and exists (select 1 from maestro.freela_equipamentos e where e.freela_id = f.id) limit 1`,
      ),
      equipamento: await um(sql`select id from maestro.equipamentos where org_id = ${org.id} limit 1`),
      evento: await um(sql`select id from maestro.eventos where org_id = ${org.id} order by created_at limit 1`),
      lancamento: await um(sql`select id from maestro.lancamentos where org_id = ${org.id} limit 1`),
      contrato: await um(sql`select id from maestro.contratos where org_id = ${org.id} limit 1`),
      roteiro: await um(sql`select id from maestro.roteiros where org_id = ${org.id} and demo limit 1`),
      // Um card da demonstração com versões: a ficha mostra a lista e o campo de colar o link.
      cardComVersao:
        (await sql`select card_id from maestro.versoes where org_id = ${org.id} and apagado_em is null order by n desc limit 1`)[0]?.card_id ?? null,
      documentos: (await sql`select distinct on (tipo) id, projeto_id from maestro.documentos where org_id = ${org.id} order by tipo`) as unknown as {
        id: string;
        projeto_id: string;
      }[],
      fluxo: await fluxoDeExemplo(sql, org.id),
      convite: await conviteDeExemplo(sql, org.id),
    };
  } finally {
    await sql.end();
  }
}

/** Token fixo do convite de um freela da demonstração (a página `/convite/<token>`, drizzle/0036). */
const TOKEN_CONVITE = "corte-do-convite-do-freela-".padEnd(43, "x");

/** Um freela sem conta com o convite aberto (só o sha256, como o app grava); criado uma vez. */
async function conviteDeExemplo(sql: postgres.Sql, org: string): Promise<boolean> {
  const [f] = await sql`select id from maestro.freelas where org_id = ${org} and zro_sub is null order by nome limit 1`;
  if (!f) return false;
  await sql`
    insert into maestro.freela_convites (org_id, freela_id, token_hash, token_enc, expira_em)
    values (${org}, ${f.id}, encode(sha256(convert_to(${TOKEN_CONVITE}, 'UTF8')), 'hex'), 'copia-cifrada-de-teste', now() + interval '7 days')
    on conflict do nothing`;
  return true;
}

/** Token fixo do link de exportação do fluxo de exemplo (a página `/f/<token>`, Criação F6). */
const TOKEN_FLUXO = "corte-do-fluxo-de-exemplo-".padEnd(43, "x");

/** O link do fluxo de exemplo (só o sha256 no banco, como o app grava; a cópia cifrada aqui não abre, e não precisa). */
async function linkDeExemplo(sql: postgres.Sql, org: string, fluxo: string): Promise<void> {
  await sql`
    insert into maestro.fluxo_links (org_id, fluxo_id, token_hash, token_enc, expira_em)
    values (${org}, ${fluxo}, encode(sha256(convert_to(${TOKEN_FLUXO}, 'UTF8')), 'hex'), 'copia-cifrada-de-teste', now() + interval '7 days')
    on conflict (token_hash) do nothing`;
}

/** Um fluxo pequeno (seção, duas notas, link e ligação) para a tela do canvas e a Lista; criado uma vez. */
async function fluxoDeExemplo(sql: postgres.Sql, org: string): Promise<string> {
  const [ja] = await sql`select id from maestro.fluxos where org_id = ${org} and titulo = 'Verão Café Aurora' limit 1`;
  if (ja) {
    await linkDeExemplo(sql, org, ja.id as string);
    return ja.id as string;
  }
  const [f] = await sql`insert into maestro.fluxos (org_id, titulo) values (${org}, 'Verão Café Aurora') returning id`;
  const no = async (tipo: string, x: number, y: number, w: number, h: number, dados: Record<string, unknown>, secao: string | null = null) =>
    (
      await sql`insert into maestro.fluxo_nos (org_id, fluxo_id, tipo, x, y, w, h, z, secao_id, dados)
        values (${org}, ${f.id}, ${tipo}, ${x}, ${y}, ${w}, ${h}, 1, ${secao}, ${sql.json(dados as never)}) returning id`
    )[0].id as string;
  const s = await no("secao", 0, 0, 520, 300, { nome: "Clima e luz", cor: "pessego" });
  const a = await no("nota", 32, 64, 200, 120, { texto: "Paleta quente, nada de azul.", cor: "amarelo" }, s);
  const b = await no("nota", 620, 80, 200, 120, { texto: "Trilha: violão e piano.", cor: "menta" });
  await no(
    "link",
    268,
    64,
    220,
    120,
    {
      url: "https://vimeo.com/76979871",
      titulo: "Ritmo",
      link: {
        fonte: "vimeo",
        url: "https://vimeo.com/76979871",
        dominio: "vimeo.com",
        id: "76979871",
        embed: "https://player.vimeo.com/video/76979871",
        miniatura: null,
      },
    },
    s,
  );
  await sql`insert into maestro.fluxo_ligacoes (org_id, fluxo_id, de, para, rotulo) values (${org}, ${f.id}, ${a}, ${b}, 'clima')`;
  await linkDeExemplo(sql, org, f.id as string);
  return f.id as string;
}

async function telas(): Promise<Tela[]> {
  const s = sessao();
  const i = await ids();
  const t: Tela[] = [
    { nome: "inicio", rota: "/", publica: true },
    { nome: "hoje", rota: "/app/hoje" },
    { nome: "z", rota: "/app/z" },
    { nome: "mais", rota: "/app/mais" },
    {
      nome: "quadro",
      rota: "/app/quadro",
      depois: async (page, ver) => {
        const c = page.locator(".q-card__abrir").first();
        if (!(await c.count())) return;
        await c.click();
        await page.locator(".q-veu--ficha").waitFor();
        await ver("quadro-ficha");
      },
    },
    ...(i.cardComVersao
      ? [
          {
            nome: "quadro-ficha-versoes",
            rota: `/app/quadro?card=${encodeURIComponent(i.cardComVersao)}`,
            depois: async (page: Page, ver: (nome: string) => Promise<void>) => {
              const versoes = page.getByRole("region", { name: "Versões" });
              await versoes.locator(".vc__versao").first().waitFor();
              await versoes.scrollIntoViewIfNeeded();
              await ver("quadro-ficha-versoes-lista");
              // O erro do link colado (pasta do Drive) cabe na ficha.
              await versoes.getByLabel("Link da versão").fill("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp");
              await versoes.getByRole("alert").waitFor();
              await ver("quadro-ficha-versoes-erro");
            },
          },
        ]
      : []),
    { nome: "aprovacoes", rota: "/app/aprovacoes" },
    { nome: "aprovacoes-novo", rota: "/app/aprovacoes/novo" },
    ...s.lotes.map((l, n) => ({ nome: `lote-${n + 1}`, rota: `/app/aprovacoes/${l}` })),
    // O lote de quem tem o SOBEDESCE: a linha da versão ganha o "Escolher no Drive" (o caso do iPhone do titular).
    { nome: "lote-drive", rota: `/app/aprovacoes/${(JSON.parse(readFileSync(DRIVE, "utf8")) as { lote: string }).lote}`, drive: true },
    { nome: "projetos", rota: "/app/projetos" },
    {
      nome: "criacao",
      rota: "/app/criacao",
      depois: async (page, ver) => {
        await page.getByRole("button", { name: "Novo roteiro" }).first().click();
        await page.getByRole("dialog", { name: "Novo roteiro" }).waitFor();
        await ver("criacao-novo");
      },
    },
    { nome: "projetos-novo", rota: "/app/projetos/novo" },
    { nome: "clientes", rota: "/app/clientes" },
    { nome: "clientes-novo", rota: "/app/clientes/novo" },
    { nome: "pedidos", rota: "/app/pedidos" },
    { nome: "pedidos-lista", rota: "/app/pedidos?ver=lista" },
    { nome: "orcamentos", rota: "/app/orcamentos" },
    { nome: "orcamentos-novo", rota: "/app/orcamentos/novo" },
    { nome: "financeiro", rota: "/app/financeiro" },
    { nome: "financeiro-contas", rota: "/app/financeiro/contas" },
    { nome: "financeiro-fluxo", rota: "/app/financeiro/fluxo" },
    { nome: "financeiro-recorrencias", rota: "/app/financeiro/recorrencias" },
    { nome: "financeiro-numeros", rota: "/app/financeiro/numeros" },
    { nome: "financeiro-novo", rota: "/app/financeiro/novo" },
    { nome: "freelas", rota: "/app/freelas" },
    { nome: "freelas-equip", rota: "/app/freelas?equip=sim" },
    { nome: "freelas-novo", rota: "/app/freelas/novo" },
    { nome: "inventario", rota: "/app/inventario" },
    { nome: "inventario-novo", rota: "/app/inventario/novo" },
    { nome: "agenda", rota: "/app/agenda" },
    { nome: "agenda-novo", rota: "/app/agenda/novo" },
    { nome: "arquivos-cadeado", rota: "/app/arquivos" },
    {
      nome: "arquivos-sobedesce",
      rota: "/app/arquivos",
      drive: true,
      // o quadro do SOBEDESCE pronto (o selo, a faixa de projetos e o quadro até a barra)
      depois: async (page, ver) => {
        await page.locator('.sd-vivo[data-fase="pronto"]').waitFor();
        await ver("arquivos-sobedesce-pronto");
      },
    },
    { nome: "ajustes", rota: "/app/ajustes" },
    { nome: "ajustes-empresa", rota: "/app/ajustes/empresa" },
    { nome: "ajustes-importar", rota: "/app/ajustes/importar" },
    { nome: "ajustes-agenda", rota: "/app/ajustes/agenda" },
    { nome: "ajustes-pessoas", rota: "/app/ajustes/pessoas" },
    { nome: "ajustes-marca", rota: "/app/ajustes/marca" },
    { nome: "ajustes-contrato", rota: "/app/ajustes/contrato" },
    { nome: "ajustes-pedido", rota: "/app/ajustes/pedido" },
    { nome: "ajustes-precos", rota: "/app/ajustes/precos" },
    { nome: "entrar", rota: "/entrar", publica: true },
    {
      nome: "fluxos",
      rota: "/app/criacao/fluxos",
      depois: async (page, ver) => {
        // segurar o cartão abre a folha com "Apagar" (components/criacao/lixeira.tsx); nada é apagado aqui
        const frente = page.locator("[data-item][data-pronto] .lx-frente").first();
        if (!(await frente.count())) return;
        await frente.evaluate(async (el) => {
          const r = el.getBoundingClientRect();
          const o = { bubbles: true, pointerId: 61, pointerType: "touch", isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
          el.dispatchEvent(new PointerEvent("pointerdown", o));
          await new Promise((ok) => setTimeout(ok, 650));
          el.dispatchEvent(new PointerEvent("pointerup", o));
        });
        await page.locator(".lx-folha").waitFor();
        await ver("fluxos-segurar");
        await page.keyboard.press("Escape");
        await page.locator(".lx-folha").waitFor({ state: "detached" });
      },
    },
    { nome: "fluxos-lixeira", rota: "/app/criacao/fluxos?lixeira=1" },
    { nome: "criacao-lixeira", rota: "/app/criacao?lixeira=1" },
    {
      nome: "fluxo",
      rota: `/app/criacao/fluxos/${i.fluxo}`,
      depois: async (page, ver) => {
        await page.getByRole("tab", { name: "Lista" }).click();
        await page.locator(".fx-lista").waitFor();
        await ver("fluxo-lista");
        await page.getByRole("tab", { name: "Canvas" }).click();
        await page.getByRole("button", { name: "Adicionar" }).click();
        await page.getByRole("dialog", { name: "Adicionar" }).waitFor();
        await ver("fluxo-adicionar");
        await page.keyboard.press("Escape");
        await page.getByRole("dialog", { name: "Adicionar" }).waitFor({ state: "detached" });
        await page.getByRole("button", { name: "Exportar" }).click();
        await page.getByRole("dialog", { name: "Exportar" }).waitFor();
        await ver("fluxo-exportar");
        await page
          .getByRole("dialog", { name: "Exportar" })
          .getByRole("menuitem", { name: /^Links/ })
          .click();
        await page.getByRole("dialog", { name: "Links do fluxo" }).waitFor();
        await ver("fluxo-links");
      },
    },
    { nome: "fluxo-publico", rota: `/f/${TOKEN_FLUXO}`, publica: true },
    {
      nome: "trabalhos",
      rota: "/trabalhos",
      freela: "alice",
      depois: async (page, ver) => {
        await page.locator("details.ft-anteriores summary").first().click();
        await ver("trabalhos-anteriores");
        await page.locator(".ft-conta summary").click();
        await ver("trabalhos-conta");
      },
    },
    { nome: "trabalho", rota: `/trabalhos/${areaFreela().aliceDiaria}`, freela: "alice" },
    { nome: "trabalhos-vazio", rota: "/trabalhos", freela: "cora" },
  ];
  const ficha = (nome: string, id: string | null, rota: (id: string) => string) => {
    if (id) t.push({ nome, rota: rota(id) });
  };
  ficha("projeto", i.projeto, (x) => `/app/projetos/${x}`);
  ficha("projeto-editar", i.projeto, (x) => `/app/projetos/${x}/editar`);
  ficha("cliente", i.cliente, (x) => `/app/clientes/${x}`);
  ficha("cliente-editar", i.cliente, (x) => `/app/clientes/${x}/editar`);
  ficha("pedido", i.pedido, (x) => `/app/pedidos/${x}`);
  ficha("orcamento-rascunho", i.rascunho, (x) => `/app/orcamentos/${x}`);
  ficha("orcamento-enviado", i.enviado, (x) => `/app/orcamentos/${x}`);
  ficha("orcamento-aprovado", i.aprovado, (x) => `/app/orcamentos/${x}`);
  ficha("timbrado", i.aprovado, (x) => `/app/orcamentos/${x}/timbrado`);
  ficha("contrato", i.contrato, (x) => `/app/contratos/${x}`);
  for (const v of ["literario", "tecnico", "teleprompter", "edicao"]) ficha(`roteiro-${v}`, i.roteiro, (x) => `/app/criacao/roteiros/${x}?vista=${v}`);
  ficha("roteiro-imprimir", i.roteiro, (x) => `/app/criacao/roteiros/${x}/imprimir?vista=tecnico`);
  // o "PDF para a edição" de uma versão salva (a demonstração tem a v1)
  ficha("roteiro-imprimir-edicao", i.roteiro, (x) => `/app/criacao/roteiros/${x}/imprimir?vista=edicao&versao=1`);
  ficha("freela", i.freela, (x) => `/app/freelas/${x}`);
  ficha("freela-editar", i.freela, (x) => `/app/freelas/${x}/editar`);
  ficha("equipamento", i.equipamento, (x) => `/app/inventario/${x}`);
  ficha("equipamento-editar", i.equipamento, (x) => `/app/inventario/${x}/editar`);
  ficha("evento", i.evento, (x) => `/app/agenda/${x}`);
  ficha("lancamento", i.lancamento, (x) => `/app/financeiro/${x}`);
  ficha("lancamento-editar", i.lancamento, (x) => `/app/financeiro/${x}/editar`);
  i.documentos.forEach((d, n) => t.push({ nome: `documento-${n + 1}`, rota: `/app/projetos/${d.projeto_id}/documentos/${d.id}` }));
  if (i.convite) t.push({ nome: "convite-freela", rota: `/convite/${TOKEN_CONVITE}`, publica: true });
  if (s.p) t.push({ nome: "pedido-publico", rota: `/p/${s.p}`, publica: true });
  if (s.o) t.push({ nome: "orcamento-publico", rota: `/o/${s.o}`, publica: true });
  if (s.a)
    t.push({
      nome: "cliente-aprovacao",
      rota: `/a/${s.a}`,
      publica: true,
      depois: async (page, ver) => {
        const antes = page.getByRole("button", { name: "Antes", exact: true }).first();
        if (await antes.count()) {
          await antes.click();
          await ver("cliente-antes");
        }
        // O resumo: uma escolha só na tela (nada vai ao servidor antes do "Enviar").
        const aprovar = page.locator(".cl-escolha[data-tipo='aprovado']").first();
        if (await aprovar.count()) {
          await aprovar.click();
          await page.getByRole("button", { name: /Revisar e enviar/ }).click();
          await page.locator(".cl-resumo").waitFor();
          await ver("cliente-resumo");
        }
      },
    });
  return t;
}

async function abrir(context: BrowserContext, baseURL: string, tela: Tela, tema: string) {
  const token = tela.freela ? areaFreela()[tela.freela] : tela.drive ? (JSON.parse(readFileSync(DRIVE, "utf8")) as { token: string }).token : sessao().token;
  await context.clearCookies();
  await context.addCookies([...(tela.publica ? [] : [{ name: "mae_sessao", value: token, url: baseURL }]), { name: "zro_theme", value: tema, url: baseURL }]);
}

async function conferir(page: Page, nome: string, achados: string[], projeto: string, largura: number, tema: string) {
  // Fontes carregadas e entradas terminadas (um painel subindo com opacidade 0 ficaria de fora da medida); a luz
  // lenta (60 s e 120 s), o que não acaba e o que segue a rolagem não contam; no máximo 3 s.
  await page.evaluate(() =>
    Promise.race([
      Promise.all([
        document.fonts.ready,
        ...document
          .getAnimations()
          .filter((a) => a.timeline === document.timeline && Number(a.effect?.getComputedTiming().endTime) <= 2000)
          .map((a) => a.finished.catch(() => {})),
      ]),
      new Promise((ok) => setTimeout(ok, 3000)),
    ]),
  );
  await page.waitForTimeout(150);
  for (const a of await achadosDeCorte(page)) achados.push(`${nome}: ${a}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/corte-${nome}-${largura}-${tema}-${projeto}.png`, fullPage: true });
}

for (const largura of [375, 393]) {
  for (const tema of ["light", "dark"]) {
    test.describe(`sem corte a ${largura} px (${tema})`, () => {
      test.use({ viewport: { width: largura, height: 812 } });

      test("nenhum texto, botão ou campo cortado em todas as telas", async ({ page, context, baseURL }, info) => {
        test.skip(info.project.name === "computador", "o detector é do celular");
        test.setTimeout(420_000);
        await googleDeMentira(context);
        // Arquivos com o SOBEDESCE: o quadro do app de mentira (e2e/falsos/sobedesce.ts), como no arquivos.spec.ts.
        await sobedesceDeMentira(context);
        const achados: string[] = [];
        for (const tela of await telas()) {
          await abrir(context, baseURL!, tela, tema);
          const r = await page.goto(tela.rota);
          expect(r?.status(), tela.rota).toBeLessThan(400);
          await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
          await conferir(page, tela.nome, achados, info.project.name, largura, tema);
          await tela.depois?.(page, (nome) => conferir(page, nome, achados, info.project.name, largura, tema));
        }
        expect(achados, achados.join("\n")).toEqual([]);
      });
    });
  }
}

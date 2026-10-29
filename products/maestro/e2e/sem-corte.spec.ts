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

const CORTE = "test-results/e2e-sessao-corte.json";
const DRIVE = "test-results/e2e-sessao-drive.json";
const SHOTS = process.env.CORTE_SHOTS;
type Sessao = { token: string; lote: string | null; lotes: string[]; a: string | null; p: string | null; o: string | null };
const sessao = () => JSON.parse(readFileSync(CORTE, "utf8")) as Sessao;

type Tela = { nome: string; rota: string; drive?: true; publica?: true; depois?: (page: Page, ver: (nome: string) => Promise<void>) => Promise<void> };

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
      documentos: (await sql`select distinct on (tipo) id, projeto_id from maestro.documentos where org_id = ${org.id} order by tipo`) as unknown as {
        id: string;
        projeto_id: string;
      }[],
    };
  } finally {
    await sql.end();
  }
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
    { nome: "aprovacoes", rota: "/app/aprovacoes" },
    { nome: "aprovacoes-novo", rota: "/app/aprovacoes/novo" },
    ...s.lotes.map((l, n) => ({ nome: `lote-${n + 1}`, rota: `/app/aprovacoes/${l}` })),
    // O lote de quem tem o SOBEDESCE: a linha da versão ganha o "Escolher no Drive" (o caso do iPhone do titular).
    { nome: "lote-drive", rota: `/app/aprovacoes/${(JSON.parse(readFileSync(DRIVE, "utf8")) as { lote: string }).lote}`, drive: true },
    { nome: "projetos", rota: "/app/projetos" },
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
    { nome: "arquivos-drive", rota: "/app/arquivos", drive: true },
    { nome: "ajustes", rota: "/app/ajustes" },
    { nome: "ajustes-empresa", rota: "/app/ajustes/empresa" },
    { nome: "ajustes-importar", rota: "/app/ajustes/importar" },
    { nome: "ajustes-agenda", rota: "/app/ajustes/agenda" },
    { nome: "ajustes-pessoas", rota: "/app/ajustes/pessoas" },
    { nome: "ajustes-marca", rota: "/app/ajustes/marca" },
    { nome: "ajustes-pedido", rota: "/app/ajustes/pedido" },
    { nome: "ajustes-precos", rota: "/app/ajustes/precos" },
    { nome: "entrar", rota: "/entrar", publica: true },
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
  ficha("freela", i.freela, (x) => `/app/freelas/${x}`);
  ficha("freela-editar", i.freela, (x) => `/app/freelas/${x}/editar`);
  ficha("equipamento", i.equipamento, (x) => `/app/inventario/${x}`);
  ficha("equipamento-editar", i.equipamento, (x) => `/app/inventario/${x}/editar`);
  ficha("evento", i.evento, (x) => `/app/agenda/${x}`);
  ficha("lancamento", i.lancamento, (x) => `/app/financeiro/${x}`);
  ficha("lancamento-editar", i.lancamento, (x) => `/app/financeiro/${x}/editar`);
  i.documentos.forEach((d, n) => t.push({ nome: `documento-${n + 1}`, rota: `/app/projetos/${d.projeto_id}/documentos/${d.id}` }));
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
  const token = tela.drive ? (JSON.parse(readFileSync(DRIVE, "utf8")) as { token: string }).token : sessao().token;
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

/**
 * O negócio por dentro (estudo MakersHub §4, itens 1, 2, 6 e 7): o funil do pedido com o retorno que aparece no Hoje e
 * as ações rápidas, importar planilha (prévia sem gravar, confirmar, reimportar igual), a agenda por assinatura (.ics
 * servido, baixado e desligado) e o acesso por cliente (a gestão restringe em Pessoas; a pessoa restrita não vê o
 * outro cliente). Organização própria (e2e/preparar.ts), no computador e no iPhone, sem rolagem de lado.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO = "test-results/e2e-sessao-negocio.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; equipe: string; proibido: string };

async function entrar(context: BrowserContext, baseURL: string, token = sessao().token) {
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

async function semRolagemDeLado(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, page.url()).toBeLessThanOrEqual(0);
}

/** Hoje no fuso de Brasília (AAAA-MM-DD), como o servidor. */
const hojeBr = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

test("funil: etapa, próximo contato, Retornar hoje no Hoje com ações rápidas e Perdido com motivo", async ({ page, context, baseURL }, info) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await entrar(context, baseURL!);
  const lead = info.project.name === "iphone" ? "Lead Iphone" : "Lead Computador";

  // O quadro do funil e a lista.
  await page.goto("/app/pedidos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/pedidos\./);
  const novo = page.getByRole("region", { name: "Novo" });
  await expect(novo.getByRole("link", { name: new RegExp(lead) })).toBeVisible();
  await semRolagemDeLado(page);
  await page.getByRole("link", { name: "Lista" }).click();
  await expect(page.locator(".lista .item").filter({ hasText: lead })).toBeVisible();

  // A ficha: Ganho travado (sem orçamento aprovado), Em conversa e o próximo contato para hoje.
  await page.locator(".lista .item").filter({ hasText: lead }).click();
  const funil = page.getByRole("group", { name: "Etapa do pedido" });
  await expect(funil.getByRole("button", { name: "Ganho" })).toBeDisabled();
  await funil.getByRole("button", { name: "Em conversa" }).click();
  await expect(page.getByText("Etapa mudou.")).toBeVisible();
  await expect(funil.getByRole("button", { name: "Em conversa" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Próximo contato").fill(hojeBr());
  await page.getByLabel("Nota").fill("Mandar o portfólio");
  await page.getByRole("button", { name: "Marcar", exact: true }).click();
  await expect(page.getByText("Retorno marcado.")).toBeVisible();
  await semRolagemDeLado(page);

  // Hoje: Retornar hoje, e o "Amanhã" tira da lista.
  await page.goto("/app/hoje");
  const retornos = page.getByRole("region", { name: "Retornar hoje" });
  const item = retornos.locator(".hoje-retorno").filter({ hasText: lead });
  await expect(item).toBeVisible();
  await expect(item.getByText("Mandar o portfólio")).toBeVisible();
  await expect(item.locator(".funil-chip")).toHaveText("hoje");
  await semRolagemDeLado(page);
  await item.getByRole("button", { name: "Amanhã" }).click();
  await expect(retornos.locator(".hoje-retorno").filter({ hasText: lead })).toHaveCount(0);

  // Perdido pede o motivo.
  await page.goto("/app/pedidos?ver=lista");
  await page.locator(".lista .item").filter({ hasText: lead }).click();
  await page.getByRole("group", { name: "Etapa do pedido" }).getByRole("button", { name: "Perdido" }).click();
  await page.getByLabel("Motivo da perda").fill("Preço");
  await page.getByRole("button", { name: "Marcar perdido" }).click();
  await expect(page.locator("header.perfil .selo")).toHaveText("Perdido");
  await expect(page.getByText("Motivo: Preço")).toBeVisible();
  expect(erros).toEqual([]);
});

test("importar planilha: prévia sem gravar, confirmar e reimportar igual", async ({ page, context, baseURL }, info) => {
  await entrar(context, baseURL!);
  const sufixo = info.project.name;
  const csv = `Nome;E-mail;WhatsApp;Status\nPadaria ${sufixo};padaria-${sufixo}@exemplo.com;(11) 98765-4321;ativo\nHotel ${sufixo};;;lead\n;sem@nome.com;;\n`;
  const arquivo = { name: `clientes-${sufixo}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") };

  await page.goto("/app/ajustes/importar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Importar planilha");
  await semRolagemDeLado(page);
  await page.locator('input[type="file"]').setInputFiles(arquivo);
  await page.getByRole("button", { name: "Conferir" }).click();
  await expect(page.locator(".importar__resumo").getByText("2 novos")).toBeVisible();
  await expect(page.locator(".importar__resumo").getByText("1 com erro")).toBeVisible();
  await expect(page.getByText("Falta o nome")).toBeVisible();
  await semRolagemDeLado(page);

  // Nada gravado ainda.
  await page.goto("/app/clientes");
  await expect(page.getByText(`Padaria ${sufixo}`)).toHaveCount(0);

  await page.goto("/app/ajustes/importar");
  await page.locator('input[type="file"]').setInputFiles(arquivo);
  await page.getByRole("button", { name: "Conferir" }).click();
  await page.getByRole("button", { name: "Importar 2 linhas" }).click();
  await expect(page.getByText("Importação feita")).toBeVisible();
  await expect(page.locator(".importar__resumo").getByText("2 novos")).toBeVisible();
  await page.goto("/app/clientes");
  await expect(page.getByText(`Padaria ${sufixo}`)).toBeVisible();

  // De novo: tudo igual.
  await page.goto("/app/ajustes/importar");
  await page.locator('input[type="file"]').setInputFiles(arquivo);
  await page.getByRole("button", { name: "Conferir" }).click();
  await expect(page.locator(".importar__resumo").getByText("2 iguais")).toBeVisible();
  await expect(page.getByText("Nada para gravar.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Importações anteriores" })).toContainText(`clientes-${sufixo}.csv`);
});

test("agenda no celular: o endereço serve o .ics, baixar e desligar", async ({ page, context, baseURL }) => {
  await entrar(context, baseURL!);
  await page.goto("/app/ajustes/agenda");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Agenda no celular");
  await semRolagemDeLado(page);
  await page.getByRole("button", { name: /^(Gerar|Trocar) endereço$/ }).click();
  const endereco = page.getByTestId("endereco-agenda");
  await expect(endereco).toHaveText(/\/api\/agenda\/[A-Za-z0-9_-]{43}\.ics$/);
  const url = (await endereco.textContent())!.trim();
  const r = await page.request.get(url);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/^text\/calendar/);
  const corpo = await r.text();
  expect(corpo.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(corpo).toContain("X-WR-TIMEZONE:America/Sao_Paulo");

  const [baixado] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Baixar .ics" }).click()]);
  expect(baixado.suggestedFilename()).toBe("maestro-agenda.ics");

  await page.getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByText("Endereço desligado.")).toBeVisible();
  expect((await page.request.get(url)).status()).toBe(404);
});

test("acesso por cliente: a gestão restringe em Pessoas e a pessoa restrita não vê o outro cliente", async ({ page, context, baseURL, browser }, info) => {
  await entrar(context, baseURL!);
  await page.goto("/app/ajustes/pessoas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pessoas");
  await semRolagemDeLado(page);
  const teo = page.locator("li.pessoa").filter({ hasText: "Téo Equipe" });
  await teo.getByText("Clientes que vê").click();
  await teo.getByRole("radio", { name: "Só alguns" }).click();
  const permitido = teo.getByRole("checkbox", { name: "Cliente Permitido" });
  if (!(await permitido.isChecked())) await permitido.check();
  const proibido = teo.getByRole("checkbox", { name: "Cliente Proibido" });
  if (await proibido.isChecked()) await proibido.uncheck();
  await teo.getByRole("button", { name: "Salvar acesso" }).click();
  await expect(teo.getByText("Vê 1 cliente.")).toBeVisible();

  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const outro = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL });
  await entrar(outro, baseURL!, sessao().equipe);
  const p = await outro.newPage();
  await p.goto("/app/clientes");
  await expect(p.getByText("Cliente Permitido")).toBeVisible();
  await expect(p.getByText("Cliente Proibido")).toHaveCount(0);
  await p.goto(`/app/clientes/${sessao().proibido}`);
  await expect(p.getByRole("heading", { level: 1 })).toHaveText(/não existe/);
  await p.goto("/app/projetos");
  await expect(p.getByText("Projeto Permitido")).toBeVisible();
  await expect(p.getByText("Projeto Proibido")).toHaveCount(0);
  await p.goto("/app/ajustes");
  await expect(p.getByText(/Só 1 cliente/)).toBeVisible();
  await semRolagemDeLado(p);
  await outro.close();
});

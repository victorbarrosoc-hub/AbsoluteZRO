// Contrato junto com o orçamento (drizzle/0020; decisão do titular, 29/10/2026): o preenchimento das variáveis (puro),
// o modelo em versões só de inclusão (administração escreve, gestão lê, duas organizações), "Enviar contrato junto",
// o aceite pelo link com CPF/CNPJ e endereço que grava o HTML e o sha256 (conferido pelo banco), a imutabilidade do
// registro, quem lê e o que o banco recusa (aceite sem contrato, hash trocado, modelo que mudou).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("contrato");
const { getBanco } = amb.banco;
const { hashToken } = await import("../src/lib/auth/cripto");
const m = await import("../src/lib/contrato/modelo");
const ct = await import("../src/lib/contrato/servidor");
const lk = await import("../src/lib/orcamento/link");
const { chamarPorta } = await import("../src/lib/publico/porta");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const HOJE = new Date().toISOString().slice(0, 10);
const VALIDADE = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const CPF = "529.982.247-25";
const CNPJ = "11.222.333/0001-81";
let ipN = 0;
const ip = () => `10.7.0.${++ipN}`;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
/** O drizzle embrulha o erro do banco ("Failed query"): confere a mensagem da causa. */
async function rejeita(p: Promise<unknown>, re: RegExp) {
  await assert.rejects(p, (e: unknown) => {
    const err = e as { message?: string; cause?: { message?: string; constraint_name?: string } };
    const txt = `${err.message} ${err.cause?.message ?? ""} ${err.cause?.constraint_name ?? ""}`;
    assert.match(txt, re);
    return true;
  });
}
const sistema = <T,>(q: ReturnType<typeof sql>) => getBanco().asSystem("teste", (tx) => tx.execute(q)) as Promise<T>;

async function orcamentoComLink(numero: string): Promise<{ id: string; token: string }> {
  const [q] = await sistema<{ id: string }[]>(sql`
    insert into maestro.orcamentos (org_id, numero, titulo, validade, periodo, escopo)
    values (${o.orgA}, ${numero}, 'Filme da marca', ${VALIDADE}, '2 diárias em dezembro', 'Captação e edição de um filme.') returning id`);
  await sistema(sql`
    insert into maestro.orcamento_itens (org_id, orcamento_id, descricao, quantidade, unidade, preco_cents, custo_cents, ordem) values
      (${o.orgA}, ${q.id}, 'Diária de captação', 2, 'diaria', 400000, 100000, 0),
      (${o.orgA}, ${q.id}, 'Edição <b>do filme</b>', 1, 'video', 300000, 50000, 1)`);
  const l = await lk.gerarLinkDoOrcamento(o.gestor, q.id, 2, HOJE);
  assert.ok(l.ok);
  return { id: q.id, token: l.ok ? l.token : "" };
}

before(async () => {
  o = await duasOrganizacoes();
  await sistema(sql`
    insert into maestro.org_marca (org_id, nome, cnpj, endereco, email, telefone) values
      (${o.orgA}, 'Lumen Filmes', '12.345.678/0001-95', 'Rua das Flores, 10, São Paulo/SP', 'oi@lumen.exemplo', '(11) 98888-7777')`);
  await sistema(sql`
    update maestro.organizations set settings = settings || '{"empresa": {"razao": "Lumen Filmes Ltda.", "cidade": "São Paulo", "uf": "SP"}}'::jsonb
     where id = ${o.orgA}`);
});
after(() => amb.fechar());

describe("modelo (puro)", () => {
  test("preenche as variáveis, escapa HTML, lista os entregáveis e marca o que falta", () => {
    const html = m.desenharContrato("# Contrato\n\nDe **{{contratada_nome}}** para {{contratante_nome}}.\n\n{{entregaveis}}\n\n- item {{valor_total}}", {
      contratada_nome: "Lumen <script>alert(1)</script>",
      contratante_nome: "",
      entregaveis: ["Filme", "Cortes & versões"],
      valor_total: "R$ 10,00",
    });
    assert.ok(html.startsWith('<article class="ct-texto"><h2 class="ct-titulo">Contrato</h2>'));
    assert.ok(html.includes('<strong><span class="ct-var">Lumen &lt;script&gt;alert(1)&lt;/script&gt;</span></strong>'));
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes('<span class="ct-vazio">[a preencher]</span>'));
    assert.ok(html.includes("<ul><li>Filme</li><li>Cortes &amp; versões</li></ul>"));
    assert.ok(html.includes('<ul><li>item <span class="ct-var">R$ 10,00</span></li></ul>'));
    assert.deepEqual(m.faltando("{{contratante_nome}} {{valor_total}}", { valor_total: "x" }), ["contratante_nome"]);
  });

  test("o modelo base só usa variáveis conhecidas; texto com variável estranha ou aberta é recusado", () => {
    assert.ok(m.validarTexto(m.MODELO_PADRAO).ok);
    const usadas = m.variaveisDoTexto(m.MODELO_PADRAO);
    for (const c of m.CAMPOS_CONFIG) assert.ok(usadas.includes(c.chave), `o modelo base usa {{${c.chave}}}`);
    assert.match((m.validarTexto("# Contrato\n\nOlá {{nome_errado}}, tudo certo?") as { mensagem: string }).mensagem, /nome_errado/);
    assert.equal(m.validarTexto("# Contrato\n\nOlá {{contratante_nome, tudo certo?").ok, false);
    assert.equal(m.validarTexto("curto").ok, false);
  });

  test("números configuráveis com limites; o que falta vira o padrão", () => {
    const r = m.validarConfig({ revisoes_incluidas: "3", multa_cancelamento_antes_pct: "25,5", foro_cidade: "Campinas/SP" });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.config.revisoes_incluidas, 3);
      assert.equal(r.config.multa_cancelamento_antes_pct, 25.5);
      assert.equal(r.config.juros_atraso_pct, 1);
      assert.equal(r.config.foro_cidade, "Campinas/SP");
    }
    const ruim = m.validarConfig({ multa_cancelamento_depois_pct: 150 });
    assert.ok(!ruim.ok && ruim.erros.multa_cancelamento_depois_pct);
  });

  test("CPF e CNPJ com dígito verificador", () => {
    assert.deepEqual(m.conferirDocumento(CPF), { ok: true, digitos: "52998224725", tipo: "cpf" });
    assert.deepEqual(m.conferirDocumento(CNPJ), { ok: true, digitos: "11222333000181", tipo: "cnpj" });
    for (const ruim of ["529.982.247-24", "111.111.111-11", "11.222.333/0001-80", "123", ""]) assert.equal(m.conferirDocumento(ruim).ok, false, ruim);
    assert.equal(m.formatarDocumento("52998224725"), CPF);
  });

  test("valores da proposta: foro pela sede, parcelas que andam com o aceite atrasado, portfólio por escolha", () => {
    const d = m.dadosDeExemplo(
      { ...m.CONFIG_PADRAO },
      { nome: "Lumen", razao: null, cnpj: null, endereco: null, email: "a@b.c", telefone: null },
      "2026-11-01",
    );
    d.sede = { cidade: "Recife", uf: "PE" };
    d.dataAceite = "2026-11-11";
    d.contratante.portfolio = false;
    const v = m.valoresDoContrato(d);
    assert.equal(v.foro_cidade, "Recife/PE");
    assert.equal(v.contratada_contato, "a@b.c");
    assert.equal(v.portfolio, m.PORTFOLIO_NAO);
    assert.match(String((v.parcelas as string[])[0]), /11\/11\/2026/);
    assert.deepEqual(v.entregaveis, ["Diária de captação (2 diárias)", "Edição do filme principal (1 vídeo)", "Cortes para redes sociais (3 vídeos)"]);
  });
});

describe("modelo da produtora (versões)", () => {
  test("sem nada salvo vale o modelo base (versão 0); só a administração salva; cada mudança é uma versão nova", async () => {
    const base = await ct.lerModeloVigente(o.gestor);
    assert.equal(base.versao, 0);
    assert.equal(base.texto, m.MODELO_PADRAO);
    const g = await ct.salvarModelo(o.gestor, m.MODELO_PADRAO, {});
    assert.ok(!g.ok && g.erro === "sem_permissao");
    const a = await ct.salvarModelo(o.admin, m.MODELO_PADRAO.replace("Objeto e escopo", "Objeto"), { revisoes_incluidas: 3 });
    assert.ok(a.ok && a.versao === 1);
    const igual = await ct.salvarModelo(o.admin, m.MODELO_PADRAO.replace("Objeto e escopo", "Objeto"), { revisoes_incluidas: 3 });
    assert.ok(igual.ok && igual.versao === 1, "igual ao vigente não cria versão");
    const vig = await ct.lerModeloVigente(o.gestor);
    assert.equal(vig.versao, 1);
    assert.equal(vig.config.revisoes_incluidas, 3);
    const r = await ct.restaurarPadrao(o.admin);
    assert.ok(r.ok && r.versao === 2);
    assert.deepEqual(
      (await ct.listarVersoes(o.admin)).map((v) => [v.versao, v.padrao]),
      [
        [2, true],
        [1, false],
      ],
    );
    // equipe não lê o modelo (RLS) e a outra organização também não
    assert.equal((await ct.lerModeloVigente(o.equipe)).versao, 0);
    assert.equal((await ct.lerModeloVigente(o.b)).versao, 0);
    assert.deepEqual(await ct.listarVersoes(o.b), []);
    const forjado = await ct.salvarModelo(o.forjado, m.MODELO_PADRAO, {});
    assert.equal(forjado.ok, false);
  });

  test("versão salva não muda nem se apaga, nem pelo dono do banco", async () => {
    await rejeita(sistema(sql`update maestro.contrato_modelos set texto = repeat('x', 30) where org_id = ${o.orgA}`), /imutável/);
    await rejeita(sistema(sql`delete from maestro.contrato_modelos where org_id = ${o.orgA}`), /imutável/);
  });
});

describe("aceite com contrato", () => {
  const ids: Record<string, string> = {};

  test("só administração e gestão ligam o contrato no orçamento", async () => {
    const q = await orcamentoComLink("2026-301");
    ids.orc = q.id;
    ids.token = q.token;
    assert.equal((await ct.ligarContrato(o.equipe, q.id, true)).ok, false);
    assert.equal((await ct.ligarContrato(o.b, q.id, true)).ok, false);
    assert.ok((await ct.ligarContrato(o.gestor, q.id, true)).ok);
  });

  test("o cliente vê o contrato do modelo vigente; aceitar sem contrato o banco recusa", async () => {
    const a = await lk.abrirOrcamentoDoCliente(ids.token, ip());
    assert.equal(a.estado, "ok");
    if (a.estado !== "ok") return;
    assert.equal(a.dados.contrato?.modeloVersao, 2);
    assert.equal(a.dados.contrato?.aceito, null);
    // a função antiga, direto, não passa (gatilho orcamentos_exige_contrato)
    await rejeita(
      chamarPorta("teste", sql`select maestro.orcamento_link_aceitar(${hashToken(ids.token)}, '{"nome": "Carla", "aceite": true}'::jsonb) as r`),
      /pede o aceite do contrato/,
    );
    const semDoc = await lk.aceitarOrcamento(ids.token, { nome: "Carla Souza", aceite: true, contrato: true, endereco: "Rua A, 1" }, ip(), "teste");
    assert.ok(!semDoc.ok && semDoc.erro === "documento");
    const docRuim = await lk.aceitarOrcamento(
      ids.token,
      { nome: "Carla", aceite: true, contrato: true, documento: "111.111.111-11", endereco: "Rua A, 1" },
      ip(),
      "x",
    );
    assert.ok(!docRuim.ok && docRuim.erro === "documento");
    const semLi = await lk.aceitarOrcamento(ids.token, { nome: "Carla", aceite: true, documento: CPF, endereco: "Rua A, 1" }, ip(), "x");
    assert.ok(!semLi.ok && semLi.erro === "contrato");
    // hash trocado na porta: recusa
    const html = "<article>contrato qualquer com texto suficiente para passar no tamanho mínimo</article>";
    const forjado = (await chamarPorta(
      "teste",
      sql`select maestro.orcamento_link_aceitar_contrato(${hashToken(ids.token)}, ${JSON.stringify({
        nome: "Carla",
        aceite: true,
        contrato: { html, hash: sha(html + " "), modelo_versao: 2, documento: CPF, endereco: "Rua A, 1" },
      })}::jsonb) as r`,
    )) as { erro: string };
    assert.equal(forjado.erro, "hash");
    const velho = (await chamarPorta(
      "teste",
      sql`select maestro.orcamento_link_aceitar_contrato(${hashToken(ids.token)}, ${JSON.stringify({
        nome: "Carla",
        aceite: true,
        contrato: { html, hash: sha(html), modelo_versao: 1, documento: CPF, endereco: "Rua A, 1" },
      })}::jsonb) as r`,
    )) as { erro: string };
    assert.equal(velho.erro, "contrato_mudou");
    const [q] = await sistema<{ status: string }[]>(sql`select status from maestro.orcamentos where id = ${ids.orc}`);
    assert.equal(q.status, "enviado", "nada foi aceito");
  });

  test("aceita uma vez: projeto, parcelas e o contrato com o HTML e o sha256 conferidos", async () => {
    const r = await lk.aceitarOrcamento(
      ids.token,
      { nome: "  Carla   Souza ", aceite: true, contrato: true, documento: CPF, endereco: "Av. Paulista, 1000, São Paulo/SP", portfolio: false },
      ip(),
      "Navegador de teste",
    );
    assert.ok(r.ok && !r.repetido);
    const [c] = await sistema<Record<string, unknown>[]>(sql`select * from maestro.contratos where orcamento_id = ${ids.orc}`);
    ids.contrato = c.id as string;
    assert.equal(c.hash, sha(c.html as string));
    assert.equal(c.documento, "52998224725");
    assert.equal(c.nome, "Carla Souza");
    assert.equal(c.portfolio, false);
    assert.equal(c.modelo_versao, 2);
    assert.match(c.ip_hash as string, /^[0-9a-f]{64}$/);
    assert.equal(c.user_agent, "Navegador de teste");
    const html = c.html as string;
    for (const parte of [
      "Carla Souza",
      CPF,
      "Av. Paulista, 1000",
      "Lumen Filmes Ltda.",
      "R$ 11.000,00",
      "São Paulo/SP",
      m.PORTFOLIO_NAO,
      "Edição &lt;b&gt;do filme&lt;/b&gt;",
    ])
      assert.ok(html.includes(parte), parte);
    assert.ok(!html.includes("[a preencher]"), "nada ficou para preencher");
    const [q] = await sistema<{ status: string; projeto_id: string; aceite: { hash: string } }[]>(
      sql`select status, projeto_id, aceite from maestro.orcamentos where id = ${ids.orc}`,
    );
    assert.equal(q.status, "aprovado");
    assert.equal(c.projeto_id, q.projeto_id);
    const de = await sistema<{ n: number }[]>(sql`select count(*)::int as n from maestro.lancamentos where orcamento_id = ${ids.orc}`);
    assert.equal(de[0].n, 2);
    const [aud] = await sistema<{ n: number }[]>(
      sql`select count(*)::int as n from maestro.audit_log where action = 'contrato.aceito' and target_id = ${ids.contrato}`,
    );
    assert.equal(aud.n, 1);
    const de2 = await lk.aceitarOrcamento(ids.token, { nome: "Outra", aceite: true, contrato: true, documento: CNPJ, endereco: "Rua B, 2" }, ip(), "x");
    assert.ok(de2.ok && de2.repetido);
    const [{ n }] = await sistema<{ n: number }[]>(sql`select count(*)::int as n from maestro.contratos where orcamento_id = ${ids.orc}`);
    assert.equal(n, 1);
    // o cliente vê o registro gravado depois
    const a = await lk.abrirOrcamentoDoCliente(ids.token, ip());
    assert.ok(a.estado === "ok" && a.dados.contrato?.aceito?.hash === c.hash);
  });

  test("a equipe com dinheiro lê e confere o hash; equipe, leitura e a outra organização não", async () => {
    const c = await ct.lerContrato(o.gestor, ids.contrato);
    assert.ok(c?.conferido);
    assert.equal(c?.nome, "Carla Souza");
    assert.ok(c?.projetoCodigo?.startsWith("MAE-"));
    assert.equal(await ct.lerContrato(o.equipe, ids.contrato), null);
    assert.equal(await ct.lerContrato(o.leitura, ids.contrato), null);
    assert.equal(await ct.lerContrato(o.b, ids.contrato), null);
    assert.equal(await ct.lerContrato(o.forjado, ids.contrato), null);
    assert.equal((await ct.contratosDe(o.admin, { projetoId: c!.projetoId! })).length, 1);
    assert.equal((await ct.contratosDe(o.equipe, { projetoId: c!.projetoId! })).length, 0);
  });

  test("o registro é imutável: não muda, não se apaga, e o banco recusa hash que não bate", async () => {
    await rejeita(sistema(sql`update maestro.contratos set nome = 'Outra' where id = ${ids.contrato}`), /imutável/);
    await rejeita(sistema(sql`delete from maestro.contratos where id = ${ids.contrato}`), /imutável/);
    // como a pessoa (admin): sem privilégio de mudar, e apagar só demonstração
    await rejeita(
      getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.contratos set nome = 'Outra' where id = ${ids.contrato}`)),
      /permission denied/,
    );
    const apagou = await getBanco().asUser(o.admin, (tx) => tx.execute(sql`delete from maestro.contratos where id = ${ids.contrato} returning id`));
    assert.equal(apagou.length, 0);
    await rejeita(
      sistema(sql`
        insert into maestro.contratos (org_id, orcamento_id, modelo_versao, html, hash, nome, documento, endereco)
        select org_id, orcamento_id, 0, html || ' ', hash, nome, documento, endereco from maestro.contratos where id = ${ids.contrato}`),
      /contratos_hash_confere|duplicate|unique/,
    );
    // o contrato de um orçamento aprovado não se desliga
    await rejeita(sistema(sql`update maestro.orcamentos set contrato = false where id = ${ids.orc}`), /não muda/);
  });

  test("hash que não bate é barrado pelo check, mesmo num orçamento livre", async () => {
    const q = await orcamentoComLink("2026-302");
    await rejeita(
      sistema(sql`
        insert into maestro.contratos (org_id, orcamento_id, modelo_versao, html, hash, nome, documento, endereco)
        values (${o.orgA}, ${q.id}, 0, ${"<article>" + "x".repeat(60) + "</article>"}, ${"0".repeat(64)}, 'Carla', '52998224725', 'Rua A, 1')`),
      /contratos_hash_confere/,
    );
  });

  test("sem contrato, o aceite segue o de sempre (nada gravado)", async () => {
    const q = await orcamentoComLink("2026-303");
    const r = await lk.aceitarOrcamento(q.token, { nome: "Bruno", aceite: true }, ip(), "x");
    assert.ok(r.ok);
    const [{ n }] = await sistema<{ n: number }[]>(sql`select count(*)::int as n from maestro.contratos where orcamento_id = ${q.id}`);
    assert.equal(n, 0);
  });
});

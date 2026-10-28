// Marca da produtora (drizzle/0011, fase 11): o logo só entra como PNG, JPEG ou WebP conferidos pelos bytes e sai
// reencodado em WebP (SVG, GIF, texto e arquivo grande não entram); a cor passa pelo contraste com o papel; só a
// administração muda; duas organizações não se veem; o logo público só sai com a organização e o sha certos.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { pedido, prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("marca");
const { getBanco } = amb.banco;
const { prepararLogo, tipoPelosBytes, LOGO_SAIDA_MAX } = await import("../src/lib/marca/logo");
const { conferirCor, contraste, normalizarCor, textoSobre } = await import("../src/lib/marca/cor");
const { lerMarca, salvarMarca, salvarLogo, removerLogo, validarMarca, lerLogoPublico } = await import("../src/lib/marca/servidor");
const { rotaLogo } = await import("../src/lib/marca/rota");
const { lerEmpresa } = await import("../src/lib/organizacao");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;

const png = (w = 300, h = 120) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 30, g: 30, b: 34, alpha: 1 } } })
    .png()
    .toBuffer();

before(async () => {
  o = await duasOrganizacoes();
});
after(() => amb.fechar());

describe("logo: conferido pelos bytes e reencodado", () => {
  test("PNG, JPEG e WebP entram e saem WebP limpo, dentro do limite", async () => {
    for (const fmt of ["png", "jpeg", "webp"] as const) {
      const entrada = await sharp({ create: { width: 2400, height: 800, channels: 3, background: "#1f6feb" } })
        .toFormat(fmt)
        .withMetadata({ exif: { IFD0: { Copyright: "segredo" } } })
        .toBuffer();
      const r = await prepararLogo(entrada);
      assert.ok(r.ok, fmt);
      if (!r.ok) continue;
      assert.equal(r.mime, "image/webp");
      assert.equal(tipoPelosBytes(r.bytes), "webp");
      assert.ok(r.largura <= 1024 && r.altura <= 1024, "cabe em 1024 px");
      assert.ok(r.bytes.length <= LOGO_SAIDA_MAX);
      assert.match(r.sha256, /^[0-9a-f]{64}$/);
      const meta = await sharp(r.bytes).metadata();
      assert.equal(meta.exif, undefined, "sem metadados");
    }
  });

  test("SVG, GIF, texto, vazio e arquivo grande não entram", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.deepEqual((await prepararLogo(svg)) as unknown, { ok: false, erro: "tipo", mensagem: "Use PNG, JPEG ou WebP. SVG não entra." });
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    assert.equal(((await prepararLogo(gif)) as { erro: string }).erro, "tipo");
    assert.equal(((await prepararLogo(Buffer.from("olá, sou texto"))) as { erro: string }).erro, "tipo");
    assert.equal(((await prepararLogo(Buffer.alloc(0))) as { erro: string }).erro, "vazio");
    assert.equal(((await prepararLogo(Buffer.alloc(5 * 1024 * 1024, 1))) as { erro: string }).erro, "grande");
    // Cabeçalho de PNG com lixo depois: não decodifica.
    const falso = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
    assert.equal(((await prepararLogo(falso)) as { erro: string }).erro, "invalido");
  });
});

describe("cor de destaque: contraste com o papel", () => {
  test("normaliza, aceita escura e recusa clara demais", () => {
    assert.equal(normalizarCor("ABC"), "#aabbcc");
    assert.equal(normalizarCor("#1F6FEB"), "#1f6feb");
    assert.equal(normalizarCor("azul"), null);
    assert.ok(contraste("#000000", "#ffffff") > 20);
    const ok = conferirCor("#1f6feb");
    assert.ok(ok.ok && ok.cor === "#1f6feb");
    const clara = conferirCor("#ffe680");
    assert.equal(clara.ok, false);
    const vazia = conferirCor("");
    assert.ok(vazia.ok && vazia.cor === null);
    assert.equal(textoSobre("#1d1d1f"), "#ffffff");
    assert.equal(textoSobre("#ffc857"), "#1d1d1f");
  });

  test("validarMarca: e-mail, CNPJ e cor", () => {
    const r = validarMarca({ nome: "  Lumen   Filmes ", email: "x", cnpj: "abc", cor: "#fff" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(Object.keys(r.erros).sort(), ["cnpj", "cor", "email"]);
    const bom = validarMarca({ nome: "Lumen Filmes", cnpj: "12.345.678/0001-90", cor: "#0f7b5f", assinatura: "Ana · Direção" });
    assert.ok(bom.ok && bom.entrada.nome === "Lumen Filmes" && bom.entrada.cor === "#0f7b5f");
  });
});

describe("marca no banco: papel, duas organizações e logo público", () => {
  test("só a administração grava; a gestão e a equipe leem", async () => {
    const e = { nome: "Lumen Filmes", cnpj: null, email: "oi@lumen.exemplo", telefone: "(11) 99999-0000", endereco: null, assinatura: "Ana", cor: "#1f6feb" };
    assert.equal((await salvarMarca(o.gestor, e)).ok, false);
    assert.equal((await salvarMarca(o.equipe, e)).ok, false);
    assert.ok((await salvarMarca(o.admin, e)).ok);
    const lida = await lerMarca(o.equipe);
    assert.equal(lida.nome, "Lumen Filmes");
    assert.equal(lida.cor, "#1f6feb");
    // A empresa (timbrado) passa a usar a marca.
    const emp = await lerEmpresa(o.admin);
    assert.equal(emp.fantasia, "Lumen Filmes");
    assert.equal(emp.cor, "#1f6feb");
  });

  test("a outra organização e a forjada não veem a marca da A", async () => {
    const nB = await getBanco().asUser(o.b, (tx) => tx.execute(sql`select count(*)::int as n from maestro.org_marca`));
    assert.equal((nB as unknown as { n: number }[])[0].n, 0);
    const nF = await getBanco().asUser(o.forjado, (tx) => tx.execute(sql`select count(*)::int as n from maestro.org_marca`));
    assert.equal((nF as unknown as { n: number }[])[0].n, 0);
    assert.equal((await lerMarca(o.b)).nome, null);
    const e = await getBanco()
      .asUser(o.admin, (tx) => tx.execute(sql`insert into maestro.org_marca (org_id, nome) values (${o.orgB}, 'invasor')`))
      .then(
        () => null,
        (x) => x,
      );
    assert.ok(e, "não grava na B");
  });

  test("logo: grava reencodado, sai pela rota com cache imutável e só com o sha certo", async () => {
    assert.equal((await salvarLogo(o.gestor, await png())).ok, false, "gestão não troca o logo");
    const r = await salvarLogo(o.admin, await png());
    assert.ok(r.ok);
    if (!r.ok) return;
    const [, , , org, sha] = r.logo.split("/");
    assert.equal(org, o.orgA);
    const l = await lerLogoPublico(o.orgA, sha);
    assert.ok(l && l.mime === "image/webp" && tipoPelosBytes(l.bytes) === "webp");
    assert.equal(await lerLogoPublico(o.orgB, sha), null, "o sha da A não abre na B");
    assert.equal(await lerLogoPublico(o.orgA, "0".repeat(64)), null);
    assert.equal(await lerLogoPublico("x", sha), null);
    const res = await rotaLogo(pedido(r.logo), Promise.resolve({ org, sha }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/webp");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    const nada = await rotaLogo(pedido("/api/marca/x/y"), Promise.resolve({ org, sha: "f".repeat(64) }));
    assert.equal(nada.status, 404);
    assert.ok((await removerLogo(o.admin)).ok);
    assert.equal(await lerLogoPublico(o.orgA, sha), null, "tirado, some");
  });

  test("maestro_app não lê o logo direto: só a função da porta", async () => {
    const r = (await getBanco().asSystem("teste", async (tx) => {
      await tx.execute(sql.raw("set local role maestro_app"));
      return tx.execute(sql`select count(*)::int as n from maestro.org_marca`);
    })) as unknown as { n: number }[];
    assert.equal(r[0].n, 0, "sem organização na sessão, o RLS esconde tudo");
  });
});

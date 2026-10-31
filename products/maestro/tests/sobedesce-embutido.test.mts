// O SOBEDESCE embutido em Arquivos (src/lib/sobedesce/embutido.ts): o endereço do quadro, a troca de pasta só pelo
// `#`, a leitura dos recados (origem exata, forma conferida, nada de outro tipo) e a CSP que abre o quadro só para a
// equipe. Puro: sem banco.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import config from "../next.config";
import { comPasta, enderecoDoQuadro, lerRecado, SOBEDESCE_APP, SOBEDESCE_ORIGEM, temaDoQuadro } from "../src/lib/sobedesce/embutido";
import { ABAS, MAIS } from "../src/lib/navegacao";

const S = SOBEDESCE_ORIGEM;

describe("o quadro do SOBEDESCE", () => {
  test("endereço: o app embutido do Maestro, no tema do Maestro", () => {
    assert.equal(SOBEDESCE_APP, "https://sobedesce.absolutezro.com/app/");
    assert.equal(enderecoDoQuadro("dark"), "https://sobedesce.absolutezro.com/app/?no=maestro&tema=escuro");
    assert.equal(enderecoDoQuadro("light"), "https://sobedesce.absolutezro.com/app/?no=maestro&tema=claro");
    assert.equal(temaDoQuadro("dark"), "escuro");
    assert.equal(temaDoQuadro("light"), "claro");
  });

  test("pasta: só o # muda, e id estranho não entra", () => {
    assert.equal(enderecoDoQuadro("light", "1AbC_d-9"), "https://sobedesce.absolutezro.com/app/?no=maestro&tema=claro#drive/1AbC_d-9");
    assert.equal(enderecoDoQuadro("light", "../x"), enderecoDoQuadro("light"));
    const base = enderecoDoQuadro("dark");
    assert.equal(comPasta(base, "abc"), `${base}#drive/abc`);
    assert.equal(comPasta(`${base}#drive/velha`, "nova"), `${base}#drive/nova`);
    for (const ruim of ["", "a/b", "a#b", "x y", "<s>", "a".repeat(201)]) assert.equal(comPasta(base, ruim), null, ruim);
  });
});

describe("recados do quadro", () => {
  test("os três recados combinados, da origem do SOBEDESCE", () => {
    assert.deepEqual(lerRecado(S, { fonte: "sobedesce", tipo: "pronto" }), { tipo: "pronto" });
    assert.deepEqual(lerRecado(S, { fonte: "sobedesce", tipo: "envios", andando: 2 }), { tipo: "envios", andando: 2 });
    assert.deepEqual(lerRecado(S, { fonte: "sobedesce", tipo: "envios", andando: 0 }), { tipo: "envios", andando: 0 });
    assert.deepEqual(lerRecado(S, { fonte: "sobedesce", tipo: "envios", andando: 2.7 }), { tipo: "envios", andando: 2 });
    assert.deepEqual(lerRecado(S, { fonte: "sobedesce", tipo: "envios", andando: 1e9 }), { tipo: "envios", andando: 9999 });
    assert.deepEqual(lerRecado(S, { fonte: "sobedesce", tipo: "pasta", id: "1AbC", nome: "  Café   Aurora " }), {
      tipo: "pasta",
      pasta: { id: "1AbC", nome: "Café Aurora" },
    });
    // a raiz do Drive (nenhuma pasta aberta)
    assert.deepEqual(lerRecado(S, { fonte: "sobedesce", tipo: "pasta", id: null, nome: null }), { tipo: "pasta", pasta: null });
  });

  test("outra origem, parecida ou não, não vale", () => {
    const d = { fonte: "sobedesce", tipo: "envios", andando: 3 };
    for (const o of [
      "https://sobedesce.com",
      "http://sobedesce.absolutezro.com",
      "https://sobedesce.absolutezro.com.evil.com",
      "https://evil.sobedesce.absolutezro.com",
      "https://sobedesce.absolutezro.com:444",
      "https://maestro.absolutezro.com",
      "null",
      "",
    ])
      assert.equal(lerRecado(o, d), null, o);
  });

  test("forma errada não vale", () => {
    const ruins: unknown[] = [
      null,
      undefined,
      "pronto",
      42,
      [],
      ["sobedesce", "pronto"],
      { tipo: "pronto" },
      { fonte: "outro", tipo: "pronto" },
      { fonte: "sobedesce", tipo: "tema", tema: "escuro" },
      { fonte: "sobedesce", tipo: "token", token: "x" },
      { fonte: "sobedesce", tipo: "envios" },
      { fonte: "sobedesce", tipo: "envios", andando: "3" },
      { fonte: "sobedesce", tipo: "envios", andando: -1 },
      { fonte: "sobedesce", tipo: "envios", andando: Number.NaN },
      { fonte: "sobedesce", tipo: "envios", andando: Infinity },
      { fonte: "sobedesce", tipo: "pasta", id: "../x", nome: "x" },
      { fonte: "sobedesce", tipo: "pasta", id: "abc", nome: 3 },
      { fonte: "sobedesce", tipo: "pasta", id: "abc", nome: "   " },
      { fonte: "sobedesce", tipo: "pasta", id: 7, nome: "x" },
    ];
    for (const d of ruins) assert.equal(lerRecado(S, d), null, JSON.stringify(d));
  });
});

describe("CSP e navegação", () => {
  test("a CSP da equipe abre o quadro do SOBEDESCE; os links públicos não", async () => {
    const regras = await config.headers!();
    const csp = (fonte: string) => regras.find((r) => r.source === fonte)?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    const frame = (fonte: string) =>
      csp(fonte)
        .split("; ")
        .find((d) => d.startsWith("frame-src ")) ?? "";
    assert.ok(frame("/app/aprovacoes/:path*").split(" ").includes(SOBEDESCE_ORIGEM), frame("/app/aprovacoes/:path*"));
    for (const publico of ["/a/:path*", "/p/:path*", "/o/:path*", "/convite/:path*", "/f/:path*"]) assert.ok(!csp(publico).includes("sobedesce"), publico);
  });

  test("o ponto do envio andando: em Arquivos e em Mais (no celular Arquivos mora em Mais)", () => {
    assert.equal(ABAS.find((a) => a.href === "/app/arquivos")?.sinal, "envios");
    assert.equal(MAIS.sinal, "envios");
    assert.deepEqual(
      ABAS.filter((a) => a.sinal).map((a) => a.href),
      ["/app/arquivos"],
    );
  });
});

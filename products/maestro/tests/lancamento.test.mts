// Lançamento em Beta grátis (ADR 0027 do HUB): o app de computador só aparece com instalador publicado no catálogo
// da Absolute ZRO (nada de botão para arquivo que não existe), o manifesto do app na Tela de Início e a chave da vitrine.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

process.env.ZRO_ISSUER = "https://hub.teste.local";
const { downloadsDoCatalogo, downloadsDoMaestro, esquecerDownloads } = await import("../src/lib/desktop");
const manifest = (await import("../src/app/manifest")).default;
const site = await import("../src/lib/site");

const HUB = "https://hub.teste.local";
const CATALOGO = {
  versao: 1,
  apps: [
    { id: "sobedesce", mac: { arquivos: [{ arquivo: "SOBEDESCE-1.0.0-b1-mac-universal.dmg", versao: "1.0.0" }] }, windows: null },
    {
      id: "maestro",
      mac: { arquivos: [{ arquivo: "Maestro-0.1.0-b3-mac-universal.dmg", versao: "0.1.0" }] },
      windows: { arquivo: { arquivo: "Maestro-0.1.0-b3-windows-setup.exe", versao: "0.1.0" } },
    },
  ],
};

describe("app de computador na página inicial", () => {
  test("com instalador: Mac e Windows pelo /baixar do HUB; sem o Maestro no catálogo, nada", () => {
    assert.deepEqual(downloadsDoCatalogo(CATALOGO, HUB + "/"), [
      { sistema: "mac", rotulo: "Mac", href: `${HUB}/baixar/app/maestro/Maestro-0.1.0-b3-mac-universal.dmg`, versao: "0.1.0" },
      { sistema: "windows", rotulo: "Windows", href: `${HUB}/baixar/app/maestro/Maestro-0.1.0-b3-windows-setup.exe`, versao: "0.1.0" },
    ]);
    assert.deepEqual(downloadsDoCatalogo({ apps: [CATALOGO.apps[0]] }, HUB), []);
    assert.deepEqual(downloadsDoCatalogo({ apps: [{ id: "maestro", mac: null, windows: null }] }, HUB), []);
    assert.deepEqual(downloadsDoCatalogo(null, HUB), []);
    assert.deepEqual(downloadsDoCatalogo("lixo", HUB), []);
  });

  test("nome de arquivo estranho não vira link (nada de URL vinda de fora)", () => {
    const ruim = {
      apps: [
        {
          id: "maestro",
          mac: { arquivos: [{ arquivo: "../../x?y=1", versao: "1" }] },
          windows: { arquivo: { arquivo: "https://mal.example/x.exe", versao: "1" } },
        },
      ],
    };
    assert.deepEqual(downloadsDoCatalogo(ruim, HUB), []);
  });

  test("lê o catálogo do HUB uma vez a cada 5 min; HUB fora do ar ou 404 = nada; desligado não pergunta", async () => {
    esquecerDownloads();
    const pedidos: string[] = [];
    const ok = (async (url: string) => {
      pedidos.push(url);
      return new Response(JSON.stringify(CATALOGO), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    assert.equal((await downloadsDoMaestro(ok, 1_000)).length, 2);
    assert.equal((await downloadsDoMaestro(ok, 2_000)).length, 2);
    assert.deepEqual(pedidos, [`${HUB}/api/v1/desktop/apps`]);

    esquecerDownloads();
    const fora = (async () => {
      throw new Error("fora do ar");
    }) as unknown as typeof fetch;
    assert.deepEqual(await downloadsDoMaestro(fora, 1_000), []);
    esquecerDownloads();
    const nao = (async () => new Response("não", { status: 404 })) as unknown as typeof fetch;
    assert.deepEqual(await downloadsDoMaestro(nao, 1_000), []);

    esquecerDownloads();
    process.env.MAESTRO_CATALOGO_DESKTOP = "desligado";
    try {
      assert.deepEqual(await downloadsDoMaestro(ok, 1_000), []);
      assert.equal(pedidos.length, 1);
    } finally {
      delete process.env.MAESTRO_CATALOGO_DESKTOP;
    }
  });
});

describe("app na Tela de Início", () => {
  test("manifesto: abre no /app, sem barra do navegador, com os ícones que existem", () => {
    const m = manifest();
    assert.equal(m.name, "Maestro");
    assert.equal(m.short_name, "Maestro");
    assert.equal(m.start_url, "/app");
    assert.equal(m.scope, "/");
    assert.equal(m.display, "standalone");
    assert.equal(m.theme_color, "#f7f3ee");
    // a cor do tema claro da casa (--bg do globals.css)
    assert.match(readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8"), /--bg: #f7f3ee;/);
    const icones = m.icons ?? [];
    assert.deepEqual(
      icones.map((i) => `${i.sizes}:${i.purpose}`),
      ["192x192:any", "512x512:any", "512x512:maskable"],
    );
    for (const i of icones) {
      const png = readFileSync(new URL(`../public${i.src}`, import.meta.url));
      assert.equal(png.subarray(1, 4).toString(), "PNG", i.src);
      const lado = Number(i.sizes?.split("x")[0]);
      assert.equal(png.readUInt32BE(16), lado, `${i.src} largura`);
      assert.equal(png.readUInt32BE(20), lado, `${i.src} altura`);
    }
    // o ícone do iPhone (apple-touch-icon) segue o do app: 180 px
    const apple = readFileSync(new URL("../src/app/apple-icon.png", import.meta.url));
    assert.equal(apple.readUInt32BE(16), 180);
  });

  test("a vitrine do lançamento é uma chave só, e a descrição acompanha", () => {
    assert.equal(typeof site.MAESTRO_LANCADO, "boolean");
    assert.match(site.SITE_DESCRICAO, site.MAESTRO_LANCADO ? /Beta grátis\.$/ : /Em teste fechado, por convite\.$/);
    assert.equal(site.ENTRAR_ZRO, "/api/zro/entrar?volta=%2Fapp");
    assert.equal(site.CRIAR_CONTA_ZRO, "/api/zro/entrar?modo=criar&volta=%2Fapp");
  });
});

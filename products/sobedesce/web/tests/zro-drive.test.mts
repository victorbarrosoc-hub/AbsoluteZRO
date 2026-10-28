/**
 * A Z no Drive (27/10/2026): o HUB da Absolute ZRO pede ao SOBEDESCE, servidor a servidor, com um JWT curto
 * (zro-pedido+jwt) assinado pela chave do login único. Aqui, contra a Absolute ZRO e o Google falsos: recusa pedido sem
 * token, vencido, de outro público, de outro emissor, com outra assinatura, de outra ação ou reapresentado; acha a
 * conta pelo vínculo (sem vínculo 404, sem Drive 409); monta a `q` com escape; devolve só metadados; lista uma pasta
 * pelo nome ou id na ordem pedida (o primeiro que entrou), com link de baixar e a resolução do vídeo; acha a versão
 * pronta (ex.: MP4 720p) e, sem ela, cria o mesmo pedido "Baixar como…" do celular para o computador; limite por pessoa.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { CONTA_ANA, CONTA_BETO, pedido, prepararAmbiente } from "./ambiente.mjs";
import { iniciarZroFalsa } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let contas: typeof import("../src/lib/auth/contas");
let cripto: typeof import("../src/lib/google/cripto");
let driveZ: typeof import("../src/lib/zro/drive-da-z");
let rBuscar: typeof import("../src/app/api/zro/drive/buscar/route");
let rPasta: typeof import("../src/app/api/zro/drive/pasta/route");
let rVersao: typeof import("../src/app/api/zro/drive/versao/route");
let rComputador: typeof import("../src/app/api/zro/drive/computador/route");
let rPedidos: typeof import("../src/app/api/proxies/pedidos/route");
let sessao: typeof import("../src/lib/auth/sessao");

type Pessoa = { id: string; sub: string };
let ana: Pessoa;
let semDrive: Pessoa;
const corpo = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ip = 0;
async function novaPessoa(nome: string, email: string, sub: string | null, produtos = "sobedesce"): Promise<Pessoa> {
  const r = await contas.criarConta({ nome, email, senha: "uma senha comprida", ip: `10.9.0.${++ip}` });
  assert.ok(r.ok);
  if (sub) await amb.banco.db.insert(amb.banco.schema.contasZro).values({ usuarioId: r.usuario.id, zroSub: sub, email, produtos });
  return { id: r.usuario.id, sub: sub ?? "" };
}

async function ligarDrive(p: Pessoa, conta: typeof CONTA_ANA, id: string) {
  const { db, schema } = amb.banco;
  const refresh = amb.google.emitirRefresh(conta);
  await db.insert(schema.contasGoogle).values({
    id,
    usuarioId: p.id,
    googleSub: conta.sub,
    email: conta.email,
    nome: conta.name,
    refreshTokenEnc: cripto.selar(refresh, `contas_google.refresh:${id}`),
    escopos: "https://www.googleapis.com/auth/drive",
  });
}

const jwt = (sub: string, acao = "drive.buscar", o: { aud?: string; mudar?: Record<string, unknown>; typ?: string; assinarErrado?: boolean } = {}) => zro.pedido({ sub, aud: CLIENTE.clientId, acao, ...o });
const buscar = (token: string | null, termo: unknown = "roteiro") => rBuscar.POST(pedido("/api/zro/drive/buscar", { corpo: { termo }, bearer: token ?? undefined, origin: null }));
const pasta = (token: string, p: unknown, ordem?: string) => rPasta.POST(pedido("/api/zro/drive/pasta", { corpo: { pasta: p, ordem }, bearer: token, origin: null }));

let pastaMotion = "";
let primeiro = "";
let segundo = "";
const versao = (token: string, arquivoId: string, formato: string) => rVersao.POST(pedido("/api/zro/drive/versao", { corpo: { arquivoId, formato }, bearer: token, origin: null }));
const computador = (token: string, arquivoId: string, formato: string) =>
  rComputador.POST(pedido("/api/zro/drive/computador", { corpo: { arquivoId, formato }, bearer: token, origin: null }));

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  contas = await import("../src/lib/auth/contas");
  cripto = await import("../src/lib/google/cripto");
  driveZ = await import("../src/lib/zro/drive-da-z");
  rBuscar = await import("../src/app/api/zro/drive/buscar/route");
  rPasta = await import("../src/app/api/zro/drive/pasta/route");
  rVersao = await import("../src/app/api/zro/drive/versao/route");
  rComputador = await import("../src/app/api/zro/drive/computador/route");
  rPedidos = await import("../src/app/api/proxies/pedidos/route");
  sessao = await import("../src/lib/auth/sessao");
  ana = await novaPessoa("Ana Montadora", "ana@zdrive.com", "zro-ana");
  semDrive = await novaPessoa("Beto Cor", "beto@zdrive.com", "zro-beto");
  await ligarDrive(ana, CONTA_ANA, "g-ana");

  const g = amb.google;
  g.adicionarArquivo(CONTA_ANA.sub, {
    name: "Roteiro final.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    parents: ["root"],
    description: "segredo interno",
    appProperties: { sobedesce: "x" },
    permissionIds: ["p1"],
    webViewLink: "https://drive.google.com/file/d/r1/view",
    size: "2048",
  });
  g.adicionarArquivo(CONTA_ANA.sub, { name: "Rock'n roll \\ teste.mov", mimeType: "video/quicktime", parents: ["root"] });
  const motion = g.adicionarArquivo(CONTA_ANA.sub, { name: "Referências de Motion", mimeType: "application/vnd.google-apps.folder", parents: ["root"], webViewLink: "https://drive.google.com/drive/folders/m1" });
  pastaMotion = motion.id;
  g.adicionarArquivo(CONTA_ANA.sub, { name: "Motion antigo", mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
  g.adicionarArquivo(CONTA_ANA.sub, { name: "Motion novo", mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
  primeiro = g.adicionarArquivo(CONTA_ANA.sub, {
    name: "primeiro.mov",
    mimeType: "video/quicktime",
    parents: [motion.id],
    size: "734003200",
    webViewLink: "https://drive.google.com/file/d/v1/view",
    webContentLink: "https://drive.google.com/uc?id=v1&export=download",
    videoMediaMetadata: { durationMillis: "12500", width: 3840, height: 2160 },
  }).id;
  segundo = g.adicionarArquivo(CONTA_ANA.sub, { name: "segundo.mp4", mimeType: "video/mp4", parents: [motion.id] }).id;
  // A versão 720p do primeiro, salva pelo computador em outra pasta (achada pelo nome).
  g.adicionarArquivo(CONTA_ANA.sub, {
    name: "primeiro (MP4 720p).mp4",
    mimeType: "video/mp4",
    parents: ["root"],
    webContentLink: "https://drive.google.com/uc?id=v720&export=download",
    videoMediaMetadata: { durationMillis: "12500", width: 1280, height: 720 },
  });
  g.adicionarArquivo(CONTA_ANA.sub, { name: "apagado.mp4", mimeType: "video/mp4", parents: [motion.id], trashed: true });
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

describe("o pedido do HUB", () => {
  test("sem token, ou com token ruim, é 401", async () => {
    const agora = Math.floor(Date.now() / 1000);
    const ruins: (string | null)[] = [
      null,
      "nao-e-jwt",
      jwt(ana.sub, "drive.buscar", { typ: "JWT" }), // um id_token não serve
      jwt(ana.sub, "drive.buscar", { mudar: { iat: agora - 600, exp: agora - 540 } }), // vencido
      jwt(ana.sub, "drive.buscar", { mudar: { exp: agora + 3600 } }), // vida longa demais
      jwt(ana.sub, "drive.buscar", { aud: "outro-app" }),
      jwt(ana.sub, "drive.buscar", { mudar: { iss: "https://outro.exemplo" } }),
      jwt(ana.sub, "drive.buscar", { assinarErrado: true }),
      jwt(ana.sub, "drive.pasta"), // outra ação
    ];
    for (const t of ruins) {
      const r = await buscar(t);
      assert.equal(r.status, 401, String(t).slice(0, 40));
      assert.equal((await corpo(r)).erro, "nao_autorizado");
    }
  });

  test("o mesmo pedido não vale duas vezes", async () => {
    const t = jwt(ana.sub);
    assert.equal((await buscar(t)).status, 200);
    assert.equal((await buscar(t)).status, 401);
  });

  test("sem vínculo é 404, sem Drive é 409, sem o SOBEDESCE liberado é 403", async () => {
    const r1 = await buscar(jwt("zro-desconhecida"));
    assert.equal(r1.status, 404);
    assert.equal((await corpo(r1)).erro, "sem_vinculo");
    const r2 = await buscar(jwt(semDrive.sub));
    assert.equal(r2.status, 409);
    const c2 = await corpo(r2);
    assert.equal(c2.erro, "sem_drive");
    assert.match(c2.mensagem, /\/conta/);
    const bloqueada = await novaPessoa("Caio", "caio@zdrive.com", "zro-caio", "nossom");
    assert.equal((await buscar(jwt(bloqueada.sub))).status, 403);
  });

  test("termo vazio ou longo demais é 400", async () => {
    assert.equal((await buscar(jwt(ana.sub), "  ")).status, 400);
    assert.equal((await buscar(jwt(ana.sub), "x".repeat(201))).status, 400);
  });
});

describe("busca", () => {
  test("a q leva o termo escapado; nome ou conteúdo, fora da lixeira, em todos os Drives", async () => {
    assert.equal(driveZ.consultaDoTermo("Rock'n roll \\ x"), "(name contains 'Rock\\'n roll \\\\ x' or fullText contains 'Rock\\'n roll \\\\ x') and trashed = false");
    const r = await buscar(jwt(ana.sub), "Rock'n roll \\ teste");
    assert.equal(r.status, 200);
    const c = await corpo(r);
    assert.deepEqual(
      c.arquivos.map((a: { nome: string }) => a.nome),
      ["Rock'n roll \\ teste.mov"],
    );
    const q = amb.google.ultimasBuscas.at(-1)!;
    assert.equal(q.get("q"), driveZ.consultaDoTermo("Rock'n roll \\ teste"));
    assert.equal(q.get("corpora"), "allDrives");
    assert.equal(q.get("includeItemsFromAllDrives"), "true");
    assert.equal(q.get("supportsAllDrives"), "true");
    assert.equal(q.get("pageSize"), "10");
    assert.equal(q.get("orderBy"), null);
    assert.doesNotMatch(q.get("fields") ?? "", /appProperties|description|permission/);
  });

  test("repassa só metadados, mesmo que o Google mande mais", async () => {
    const c = await corpo(await buscar(jwt(ana.sub), "roteiro"));
    assert.equal(c.arquivos.length, 1);
    const a = c.arquivos[0];
    assert.deepEqual(Object.keys(a).sort(), ["abrir_no_sobedesce", "criado", "icone", "id", "imagem", "link", "link_download", "modificado", "nome", "pasta", "tamanho", "tipo", "video"]);
    assert.equal(a.tamanho, 2048);
    assert.equal(a.link, "https://drive.google.com/file/d/r1/view");
    assert.doesNotMatch(JSON.stringify(c), /segredo interno|permissionIds|appProperties|parents|ya29/);
  });

  test("abrir_no_sobedesce: a pasta onde o arquivo está, ou a própria pasta, na aba Drive do app", async () => {
    const c = await corpo(await buscar(jwt(ana.sub), "Motion"));
    const pastaAchada = c.arquivos.find((a: { id: string }) => a.id === pastaMotion);
    assert.equal(pastaAchada.abrir_no_sobedesce, `http://localhost:3000/app/#drive/${pastaMotion}`);
    const arq = (await corpo(await buscar(jwt(ana.sub), "primeiro.mov"))).arquivos.find((a: { id: string }) => a.id === primeiro);
    assert.equal(arq.abrir_no_sobedesce, `http://localhost:3000/app/#drive/${pastaMotion}`);
    assert.equal(driveZ.linkNoSobedesce("abc_DEF-123"), "http://localhost:3000/app/#drive/abc_DEF-123");
    for (const ruim of ["", "a/b", "x#y", "../app", "a b", null, 7, "x".repeat(201)]) assert.equal(driveZ.linkNoSobedesce(ruim), null);
  });

  test("Drive pedindo reconectar é 409 reconectar_drive", async () => {
    const p = await novaPessoa("Dora", "dora@zdrive.com", "zro-dora");
    await ligarDrive(p, CONTA_BETO, "g-dora");
    const { db, schema } = amb.banco;
    const { eq } = await import("drizzle-orm");
    await db.update(schema.contasGoogle).set({ estado: "reconectar" }).where(eq(schema.contasGoogle.id, "g-dora"));
    const r = await buscar(jwt(p.sub));
    assert.equal(r.status, 409);
    assert.equal((await corpo(r)).erro, "reconectar_drive");
  });
});

describe("pasta", () => {
  test("pelo nome exato: lista do primeiro que entrou, com link de baixar, tamanho e resolução", async () => {
    const r = await pasta(jwt(ana.sub, "drive.pasta"), "referências de motion", "mais_antigo");
    assert.equal(r.status, 200);
    const c = await corpo(r);
    assert.equal(c.pasta.id, pastaMotion);
    assert.deepEqual(
      c.arquivos.map((a: { nome: string }) => a.nome),
      ["primeiro.mov", "segundo.mp4"],
    );
    const p = c.arquivos[0];
    assert.equal(p.link_download, "https://drive.google.com/uc?id=v1&export=download");
    assert.equal(p.tamanho, 734003200);
    assert.deepEqual(p.video, { largura: 3840, altura: 2160, duracao_s: 13 });
    assert.equal(c.pasta.abrir_no_sobedesce, `http://localhost:3000/app/#drive/${pastaMotion}`);
    assert.equal(p.abrir_no_sobedesce, c.pasta.abrir_no_sobedesce);
    const q = amb.google.ultimasBuscas.at(-1)!;
    assert.equal(q.get("q"), `'${pastaMotion}' in parents and trashed = false`);
    assert.equal(q.get("orderBy"), "createdTime");
  });

  test("mais recente primeiro, e pelo id", async () => {
    const c = await corpo(await pasta(jwt(ana.sub, "drive.pasta"), pastaMotion, "mais_recente"));
    assert.equal(c.arquivos[0].nome, "segundo.mp4");
    assert.equal(amb.google.ultimasBuscas.at(-1)!.get("orderBy"), "createdTime desc");
  });

  test("nome em várias pastas devolve as opções; nenhuma, nao_achou; ordem estranha é 400", async () => {
    const c = await corpo(await pasta(jwt(ana.sub, "drive.pasta"), "Motion"));
    assert.deepEqual(c.escolher.map((p: { nome: string }) => p.nome).sort(), ["Motion antigo", "Motion novo", "Referências de Motion"]);
    for (const p of c.escolher) assert.equal(p.abrir_no_sobedesce, `http://localhost:3000/app/#drive/${p.id}`);
    assert.deepEqual(await corpo(await pasta(jwt(ana.sub, "drive.pasta"), "Casamento 2019")), { nao_achou: true });
    assert.equal((await pasta(jwt(ana.sub, "drive.pasta"), "Motion", "aleatoria")).status, 400);
    assert.equal(driveZ.consultaDePasta("d'x"), "mimeType = 'application/vnd.google-apps.folder' and name contains 'd\\'x' and trashed = false");
  });

  test("o pedido de pasta não vale para a busca (cada ação com o seu)", async () => {
    assert.equal((await pasta(jwt(ana.sub, "drive.buscar"), "Motion")).status, 401);
  });
});

describe("versão pronta e pedido ao computador", () => {
  test("a versão pedida já existe: devolve ela com o link de baixar", async () => {
    const r = await versao(jwt(ana.sub, "drive.versao"), primeiro, "mp4-720");
    assert.equal(r.status, 200);
    const c = await corpo(r);
    assert.equal(c.o_proprio, false);
    assert.deepEqual(
      c.versoes.map((v: { nome: string }) => v.nome),
      ["primeiro (MP4 720p).mp4"],
    );
    assert.equal(c.versoes[0].link_download, "https://drive.google.com/uc?id=v720&export=download");
    assert.equal(c.original.nome, "primeiro.mov");
    assert.equal(c.original.abrir_no_sobedesce, `http://localhost:3000/app/#drive/${pastaMotion}`);
  });

  test("o próprio arquivo já está no formato: o_proprio", async () => {
    const c = await corpo(await versao(jwt(ana.sub, "drive.versao"), segundo, "mp4"));
    assert.equal(c.o_proprio, true);
  });

  test("não existe: nada de versão, diz se converte e como estão os computadores (sem criar pedido)", async () => {
    const c = await corpo(await versao(jwt(ana.sub, "drive.versao"), segundo, "mp4-720"));
    assert.deepEqual(c.versoes, []);
    assert.equal(c.converte, true);
    assert.deepEqual(c.computadores, []);
    const { db, schema } = amb.banco;
    assert.equal((await db.select().from(schema.pedidosProxy)).length, 0, "só ler não pede nada");
  });

  test("sem computador conectado, o pedido é 409 sem_computador", async () => {
    const r = await computador(jwt(ana.sub, "drive.computador"), segundo, "mp4-720");
    assert.equal(r.status, 409);
    assert.equal((await corpo(r)).erro, "sem_computador");
  });

  test("com computador: cria o mesmo pedido do Baixar como…, que o computador vê na fila dele", async () => {
    const mac = await sessao.criarSessao(ana.id, "dispositivo", { nome: "MacBook da Ana", plataforma: "mac" });
    const r = await computador(jwt(ana.sub, "drive.computador"), segundo, "mp4-720");
    assert.equal(r.status, 201);
    const c = await corpo(r);
    assert.equal(c.pedido.status, "pendente");
    assert.equal(c.formato, "MP4 720p");
    assert.equal(c.computadores[0].nome, "MacBook da Ana");
    assert.match(c.acompanhar, /\/app\/#referencias$/);
    // De novo: não duplica.
    assert.equal((await computador(jwt(ana.sub, "drive.computador"), segundo, "mp4-720")).status, 200);
    const fila = await rPedidos.GET(pedido("/api/proxies/pedidos?status=pendente&tipo=formato", { bearer: mac.token }));
    const f = await corpo(fila);
    assert.equal(f.pedidos.length, 1);
    assert.equal(f.pedidos[0].fileId, segundo);
    assert.deepEqual(f.pedidos[0].ajustes, { formato: "mp4-720" });
    assert.equal(f.pedidos[0].contaGoogleId, "g-ana");
  });

  test("o pedido de leitura não cria pedido ao computador; formato que o computador não faz é 400", async () => {
    assert.equal((await computador(jwt(ana.sub, "drive.versao"), segundo, "mp4-720")).status, 401);
    assert.equal((await computador(jwt(ana.sub, "drive.computador"), segundo, "jpg")).status, 400);
    assert.equal((await computador(jwt(ana.sub, "drive.computador"), pastaMotion, "mp4-720")).status, 404);
  });
});

test("limite por pessoa: passou de 30 em 10 minutos, 429", async () => {
  const p = await novaPessoa("Eva", "eva@zdrive.com", "zro-eva");
  for (let i = 0; i < 30; i++) assert.equal((await buscar(jwt(p.sub))).status, 409);
  const r = await buscar(jwt(p.sub));
  assert.equal(r.status, 429);
  assert.equal((await corpo(r)).erro, "devagar");
});

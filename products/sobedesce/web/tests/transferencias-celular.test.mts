/**
 * Tela Transferências do app do celular (public/app): o motor de envio do navegador (lib/uploader.js) com passar na
 * frente, cancelar de verdade, lotes, o histórico no IndexedDB (migração v1 → v2) e a conferência por MD5 (lib/md5.js,
 * lib/conferir.js). Roda no Node com um navegador de mentira mínimo: nada aqui fala com o Google.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, beforeEach, describe, test } from "node:test";
import { criarIndexedDB } from "./indexeddb-falso.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const loja = new Map<string, string>();
const chamadas: { url: string; method: string }[] = [];

// O navegador que o app espera, só o mínimo. Precisa existir antes de importar os módulos do app.
g.location = { hostname: "127.0.0.1", search: "", hash: "", href: "http://127.0.0.1/app/", pathname: "/app/" };
g.window = g;
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.document = { addEventListener() {}, visibilityState: "visible", documentElement: { classList: { add() {}, toggle() {} }, dataset: {} } };
g.localStorage = {
  getItem: (k: string) => (loja.has(k) ? loja.get(k) : null),
  setItem: (k: string, v: string) => loja.set(k, String(v)),
  removeItem: (k: string) => loja.delete(k),
};
g.indexedDB = criarIndexedDB();
g.requestAnimationFrame = (fn: () => void) => setTimeout(fn, 0);
g.fetch = async (url: string, init: { method?: string } = {}) => {
  chamadas.push({ url: String(url), method: init.method || "GET" });
  return new Response(null, { status: 499 });
};

const APP = "../public/app/lib/";
// O motor é um só (como na página): um teste por vez.
const EM_ORDEM = { concurrency: 1 };
let up: any;
let idb: any;
let md5: any;
let conferir: any;
let tr: any;
let engine: any;

const folder = (id: string, name = id) => ({ id, name, driveId: null, path: [{ id: "root", name: "Meu Drive" }, { id, name }] });
const arquivo = (name: string, size = 1000, conteudo?: Uint8Array) => {
  const b = conteudo ? new Blob([conteudo as BlobPart]) : new Blob([new Uint8Array(size)]);
  return Object.assign(b, { name, lastModified: 1_700_000_000_000 }) as any;
};
const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function ate(cond: () => boolean, ms = 3000) {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error("demorou demais");
    await esperar(5);
  }
}

/** pump() de verdade, mas sem rede: começar = marcar como andando, com um controle que dá para interromper. */
const comecados: string[] = [];
function semRede() {
  engine._start = (it: any) => {
    it.status = "running";
    const ctl = { aborted: null, xhr: { abort() {} }, abortCtl: new AbortController() };
    it.ctl = ctl;
    engine.running.add(it);
    // como o .finally do _start: o envio interrompido sai da vaga e o pump enche de novo
    ctl.abortCtl.signal.addEventListener("abort", () =>
      setTimeout(() => {
        if (it.ctl === ctl) it.ctl = null;
        engine.running.delete(it);
        engine.pump();
      }, 0),
    );
    comecados.push(it.name);
  };
}
function terminar(it: any) {
  it.ctl = null;
  engine.running.delete(it);
  it.status = "done";
  engine.pump();
}

before(async () => {
  // Banco v1 já existe no aparelho (a versão de antes), com uma sessão de envio guardada.
  await new Promise<void>((ok) => {
    const req = g.indexedDB.open("sobedesce", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("uploads", { keyPath: "key" });
    req.onsuccess = () => {
      const tx = req.result.transaction("uploads", "readwrite");
      tx.objectStore("uploads").put({ key: "antigo", uri: "https://upload.example/s-antiga", name: "A001.mov", size: 10, createdAt: Date.now(), folder: folder("p0") });
      tx.oncomplete = () => {
        req.result.close();
        ok();
      };
    };
  });
  idb = await import(APP + "idb.js");
  md5 = await import(APP + "md5.js");
  conferir = await import(APP + "conferir.js");
  tr = await import(APP + "transferencias.js");
  up = await import(APP + "uploader.js");
  engine = up.engine;
});

beforeEach(async () => {
  await esperar(); // o que o teste anterior mandou gravar termina antes
  for (const h of await idb.allHistory()) await idb.deleteHistory(h.id);
  engine.items = [];
  engine.history = [];
  engine.running.clear();
  engine._verifyQueue = [];
  engine._verifying = null;
  comecados.length = 0;
  chamadas.length = 0;
  loja.set("sobedesce.settings", JSON.stringify({ concurrency: 1, chunkMiB: "auto" }));
  semRede();
});

after(() => {
  engine.running.clear();
  engine._activity();
  clearTimeout(engine._emitTimer);
});

describe("IndexedDB v1 → v2", EM_ORDEM, () => {
  test("a migração cria o histórico e mantém as sessões do v1", async () => {
    assert.equal(idb.DB_VERSION, 2);
    const sessao = await idb.getRecord("antigo");
    assert.equal(sessao?.uri, "https://upload.example/s-antiga", "a sessão do v1 continua lá");
    await idb.putHistory({ id: "h1", name: "A.mov", size: 1, finishedAt: 1, result: "done" });
    assert.deepEqual((await idb.allHistory()).map((h: any) => h.id), ["h1"]);
    const banco = g.indexedDB.bancos.get("sobedesce");
    assert.equal(banco.version, 2);
    assert.ok(banco.objectStoreNames.contains("uploads") && banco.objectStoreNames.contains("historico"));
    await idb.deleteHistory("h1");
    assert.equal((await idb.allHistory()).length, 0);
  });

  test("upgrade só cria o que falta (abrir de novo não quebra)", () => {
    const criados: string[] = [];
    const tem = new Set(["uploads"]);
    idb.upgrade({ objectStoreNames: { contains: (n: string) => tem.has(n) }, createObjectStore: (n: string) => criados.push(n) });
    assert.deepEqual(criados, ["historico"]);
  });

  test("histórico sobrevive a recarregar a página (outra abertura do banco)", async () => {
    await idb.putHistory({ id: "h-recarga", name: "B.mov", size: 2, finishedAt: 2, result: "done", verify: { state: "ok" } });
    const outra = await import(APP + "idb.js?recarregou=1");
    const lidas = await outra.allHistory();
    assert.ok(lidas.some((h: any) => h.id === "h-recarga" && h.verify.state === "ok"));
    await idb.deleteHistory("h-recarga");
  });
});

describe("passar na frente", EM_ORDEM, () => {
  test("pump começa o da fila com maior prioridade, e a prioridade fica guardada", async () => {
    engine.addFiles([arquivo("a.mov"), arquivo("b.mov"), arquivo("c.mov")], folder("p1"));
    assert.deepEqual(comecados, ["a.mov"], "um por vez (Ajustes)");
    const [a, b, c] = engine.items;
    assert.equal(a.batchId, c.batchId, "escolhidos juntos = um lote");
    await idb.putRecord({ key: c.key, uri: "https://upload.example/s-c", name: "c.mov", size: c.size, createdAt: Date.now(), folder: c.folder });
    assert.equal(await engine.prioritize(c), true);
    assert.equal(c.priority, 1);
    assert.equal((await idb.getRecord(c.key)).priority, 1, "guardado no IndexedDB");
    terminar(a);
    assert.deepEqual(comecados, ["a.mov", "c.mov"], "c passou na frente de b");
    terminar(c);
    assert.deepEqual(comecados, ["a.mov", "c.mov", "b.mov"]);
    assert.equal(b.priority, 0);
    await idb.deleteRecord(c.key);
  });

  test("o último a passar na frente vai primeiro; pausado volta para a fila; andando não muda", () => {
    engine.addFiles([arquivo("a.mov"), arquivo("b.mov"), arquivo("c.mov"), arquivo("d.mov")], folder("p1"));
    const [a, b, c, d] = engine.items;
    engine.pause(d);
    assert.equal(d.status, "paused");
    engine.prioritize(b);
    engine.prioritize(d);
    assert.equal(d.status, "queued");
    assert.equal(engine.prioritize(a), false, "o que já está andando não passa na frente");
    terminar(a);
    assert.deepEqual(comecados, ["a.mov", "d.mov"]);
    assert.ok(d.priority > b.priority);
    assert.deepEqual([c, b].sort(tr.ordemFila).map((x: any) => x.name), ["b.mov", "c.mov"], "na tela: quem passou na frente primeiro");
    assert.equal(engine.items.find((x: any) => x.name === "b.mov").status, "queued");
  });
});

describe("cancelar de verdade", EM_ORDEM, () => {
  test("encerra a sessão no Google, esquece a retomada e vira cancelado no histórico", async () => {
    engine.setAccount("lia@exemplo.com");
    engine.addFiles([arquivo("grande.mov", 5000), arquivo("depois.mov")], folder("p2", "Diária 02"));
    const [it, depois] = engine.items;
    let abortou = false;
    it.ctl.xhr = { abort: () => (abortou = true) };
    await idb.putRecord({ key: it.key, uri: "https://upload.example/s-grande", name: it.name, size: it.size, createdAt: Date.now(), folder: it.folder });
    assert.equal(engine.cancel(it), true);
    assert.equal(abortou, true, "interrompeu o envio");
    assert.equal(it.status, "canceled");
    await it._ended;
    assert.deepEqual(chamadas, [{ url: "https://upload.example/s-grande", method: "DELETE" }], "DELETE na sessão retomável (cortesia)");
    assert.equal(await idb.getRecord(it.key), undefined, "a retomada foi esquecida");
    await it._saved;
    const h = (await idb.allHistory()).find((x: any) => x.id === it.histId);
    assert.equal(h.result, "canceled");
    assert.equal(h.folder.name, "Diária 02");
    assert.equal(h.account, "lia@exemplo.com");
    assert.equal(engine.history[0].id, it.histId);
    assert.deepEqual(comecados, ["grande.mov", "depois.mov"], "a vaga foi para o próximo");
    const s = up.summarize(engine.items);
    assert.equal(s.total, 1, "cancelado não entra na conta do medidor");
    assert.equal(depois.status, "running");
    assert.equal(engine.cancel(it), false, "cancelar de novo não faz nada");
    await idb.deleteHistory(it.histId);
  });

  test("cancelar sem sessão aberta não chama o Google", async () => {
    engine.addFiles([arquivo("a.mov"), arquivo("b.mov")], folder("p2"));
    const b = engine.items[1];
    engine.cancel(b);
    await b._ended;
    assert.equal(chamadas.length, 0);
    assert.equal(b.status, "canceled");
  });
});

describe("lotes", EM_ORDEM, () => {
  test("pausar, retomar e cancelar valem para o lote inteiro", async () => {
    loja.set("sobedesce.settings", JSON.stringify({ concurrency: 4, chunkMiB: "auto" }));
    const l1 = engine.addFiles([arquivo("a.mov"), arquivo("b.mov"), arquivo("c.mov")], folder("p3")).batchId;
    const l2 = engine.addFiles([arquivo("x.mov")], folder("p4")).batchId;
    assert.notEqual(l1, l2);
    assert.equal(engine.batchItems(l1).length, 3);
    engine.pauseBatch(l1);
    await esperar();
    assert.deepEqual(engine.batchItems(l1).map((it: any) => it.status), ["paused", "paused", "paused"]);
    assert.equal(engine.batchItems(l2)[0].status, "running", "o outro lote segue");
    engine.resumeBatch(l1);
    assert.deepEqual(engine.batchItems(l1).map((it: any) => it.status), ["running", "running", "running"]);
    loja.set("sobedesce.settings", JSON.stringify({ concurrency: 1, chunkMiB: "auto" }));
    const n = engine.cancelBatch(l1);
    assert.equal(n, 3);
    assert.deepEqual(engine.batchItems(l1).map((it: any) => it.status), ["canceled", "canceled", "canceled"]);
    assert.equal(engine.history.filter((h: any) => h.batchId === l1 && h.result === "canceled").length, 3);
    assert.equal(engine.batchItems(l2)[0].status, "running");
    // na tela: agrupado por lote
    const lotes = tr.porLote(engine.history);
    assert.equal(lotes.length, 1);
    assert.equal(lotes[0].folder.id, "p3");
    for (const h of engine.history) await idb.deleteHistory(h.id);
  });
});

describe("histórico", EM_ORDEM, () => {
  test("restore lê o histórico do aparelho (só da conta) e o que estava conferindo vira sem conferência", async () => {
    await idb.putHistory({ id: "r1", account: "ana@exemplo.com", name: "A.mov", size: 1, finishedAt: 10, result: "done", sizeOk: true, verify: { state: "running", progress: 0.4 } });
    await idb.putHistory({ id: "r2", account: "ana@exemplo.com", name: "B.mov", size: 1, finishedAt: 20, result: "done", verify: { state: "ok" } });
    await idb.putHistory({ id: "r3", account: "outra@exemplo.com", name: "C.mov", size: 1, finishedAt: 30, result: "done" });
    engine.setAccount("ana@exemplo.com");
    engine._restoredFor = undefined;
    await engine.restore();
    assert.deepEqual(engine.history.map((h: any) => h.id), ["r2", "r1"], "mais recente primeiro, só da conta");
    assert.equal(engine.history[1].verify.state, "unchecked");
    assert.equal(conferir.seloConferencia(engine.history[1]).texto, "Tamanho confere · sem conferência");
    assert.equal(conferir.seloConferencia(engine.history[0]).texto, "Conferido");
    // "Limpar concluídas" tira do aparelho também (o "Não conferiu" fica)
    engine.history.push({ id: "r4", account: "ana@exemplo.com", name: "D.mov", size: 1, finishedAt: 5, result: "done", verify: { state: "mismatch" } });
    await idb.putHistory(engine.history.at(-1));
    engine.clearFinished();
    assert.deepEqual(engine.history.map((h: any) => h.id), ["r4"]);
    await esperar(10);
    assert.deepEqual((await idb.allHistory()).map((h: any) => h.id).sort(), ["r3", "r4"]);
    engine.forget("r4");
    await idb.deleteHistory("r3");
    // as sessões guardadas do v1 voltam como "escolha o arquivo de novo" (não somem com a migração)
    assert.ok(engine.items.some((it: any) => it.key === "antigo" && it.status === "needsFile"));
  });

  test("guarda no máximo HIST_MAX entradas (as mais antigas saem)", () => {
    const muitas = Array.from({ length: up.HIST_MAX + 5 }, (_, i) => ({ id: `m${i}`, name: "x", size: 1, finishedAt: i, result: "done" }));
    engine._loadHistory(muitas);
    assert.equal(engine.history.length, up.HIST_MAX);
    assert.equal(engine.history[0].id, `m${up.HIST_MAX + 4}`);
  });
});

describe("MD5 incremental", EM_ORDEM, () => {
  test("vetores da RFC 1321", () => {
    const rfc: [string, string][] = [
      ["", "d41d8cd98f00b204e9800998ecf8427e"],
      ["a", "0cc175b9c0f1b6a831c399e269772661"],
      ["abc", "900150983cd24fb0d6963f7d28e17f72"],
      ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
      ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
      ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "d174ab98d277d9f5a5611c2c9f419d9f"],
      ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "57edf4a22be3c955ac49da2e2107b67a"],
    ];
    for (const [txt, want] of rfc) assert.equal(md5.md5(txt), want, JSON.stringify(txt));
  });

  test("bate com o crypto do Node em arquivo de alguns MB, em pedaços de qualquer tamanho", async () => {
    const dados = crypto.randomBytes(6 * 1024 * 1024 + 37);
    const want = crypto.createHash("md5").update(dados).digest("hex");
    assert.equal(md5.md5(new Uint8Array(dados)), want);
    const h = new md5.Md5();
    for (let i = 0, passo = 1; i < dados.length; i += passo, passo = (passo * 7 + 3) % 70_001 || 1) h.update(dados.subarray(i, i + passo));
    assert.equal(h.hex(), want, "pedaços desalinhados");
    // as bordas do enchimento: 55, 56, 63, 64 e 65 bytes
    for (const n of [55, 56, 63, 64, 65, 119, 120]) assert.equal(md5.md5(new Uint8Array(dados.subarray(0, n))), crypto.createHash("md5").update(dados.subarray(0, n)).digest("hex"), `${n} bytes`);
    // lendo um Blob com Blob.slice (o que o Worker faz), com aviso de progresso
    const prog: number[] = [];
    const doBlob = await md5.md5DoBlob(new Blob([dados]), { pedaco: 1_000_003, onProgress: (f: number) => prog.push(f) });
    assert.equal(doBlob, want);
    assert.equal(prog.at(-1), dados.length);
    // sem Worker (Node): md5DoArquivo calcula na própria página, devolvendo a vez entre os pedaços
    assert.equal(await conferir.md5DoArquivo(new Blob([dados])), want);
  });

  test("interromper a conferência para no próximo pedaço", async () => {
    const ctl = new AbortController();
    const p = md5.md5DoBlob(new Blob([new Uint8Array(4 * 1024 * 1024)]), { pedaco: 1024 * 1024, signal: ctl.signal, onProgress: () => ctl.abort() });
    await assert.rejects(p, (e: any) => e.aborted === true);
  });
});

describe("conferência ao fim", EM_ORDEM, () => {
  const conteudo = new TextEncoder().encode("frame 0001 do bruto da diária");
  const certo = crypto.createHash("md5").update(conteudo).digest("hex");

  function terminado(nome: string, { driveMd5 = certo as string | null, size = conteudo.length, fileId = "f1" as string | null } = {}) {
    const it = { ...engine._blank(), file: arquivo(nome, 0, conteudo), name: nome, size, folder: folder("p5"), key: nome, status: "done", sizeOk: true, fileId, driveMd5, finishedAt: Date.now(), batchId: "lote-c" };
    engine.items.push(it);
    engine._saveHistory(it);
    return it;
  }

  test("MD5 igual → Conferido; diferente → Não conferiu (fica em Com erro)", async () => {
    const ok = terminado("igual.mov");
    const ruim = terminado("diferente.mov", { driveMd5: "0".repeat(32) });
    engine._queueVerify(ok);
    engine._queueVerify(ruim);
    await ate(() => ok.verify?.state === "ok" && ruim.verify?.state === "mismatch");
    assert.equal(conferir.seloConferencia(ok).texto, "Conferido");
    assert.equal(conferir.seloConferencia(ruim).texto, "Não conferiu");
    await esperar(5);
    const salvos = await idb.allHistory();
    assert.equal(salvos.find((h: any) => h.id === ok.histId).verify.state, "ok", "a conferência fica no histórico");
    assert.equal(salvos.find((h: any) => h.id === ruim.histId).verify.state, "mismatch");
    assert.equal(tr.filtraHist("erro", engine.history.find((h: any) => h.id === ruim.histId)), true);
    assert.equal(tr.filtraHist("erro", engine.history.find((h: any) => h.id === ok.histId)), false);
    assert.equal(tr.textoConferencia(tr.conferenciaLote(engine.history)), "1 de 2 conferidos · 1 não conferiu");
    for (const h of salvos) await idb.deleteHistory(h.id);
  });

  test("acima do limite automático: não confere sozinho; Conferir agora confere", async () => {
    const it = terminado("enorme.braw", { size: conferir.CONFERIR_AUTO_MAX + 1 });
    engine._queueVerify(it);
    assert.equal(it.verify.state, "big");
    assert.equal(conferir.seloConferencia(it).texto, "Tamanho confere · sem conferência");
    assert.equal(engine.verifyNow(it), true);
    await ate(() => it.verify?.state === "ok");
    await idb.deleteHistory(it.histId);
  });

  test("sem MD5 do Drive (nem id para perguntar): sem conferência, nunca Conferido", async () => {
    const it = terminado("doc.mov", { driveMd5: null, fileId: null });
    engine._queueVerify(it);
    await ate(() => it.verify?.state === "unchecked");
    assert.equal(it.verify.reason, "semMd5");
    assert.equal(conferir.seloConferencia(it).texto, "Tamanho confere · sem conferência");
    await idb.deleteHistory(it.histId);
  });

  test("o selo só diz Conferido com o MD5 igual", () => {
    for (const state of [undefined, "pending", "running", "big", "unchecked", "mismatch"]) {
      for (const sizeOk of [true, false]) {
        const s = conferir.seloConferencia({ result: "done", sizeOk, verify: state ? { state } : null });
        assert.notEqual(s.texto, "Conferido", `${state} / ${sizeOk}`);
        assert.doesNotMatch(s.texto, /^Conferido/);
      }
    }
    assert.equal(conferir.seloConferencia({ result: "done", sizeOk: false, verify: null }).texto, "Sem conferência");
    assert.equal(conferir.mesmoMd5("ABC".padEnd(32, "0"), "abc".padEnd(32, "0")), true);
    assert.equal(conferir.mesmoMd5(null, null), false);
  });
});

describe("filtros da tela", EM_ORDEM, () => {
  test("Tudo / Enviando / Pausados / Terminados / Com erro", () => {
    const fila = [{ status: "running" }, { status: "queued" }, { status: "paused" }, { status: "needsFile" }, { status: "failed" }, { status: "mac" }];
    const hist = [{ result: "done", verify: { state: "ok" } }, { result: "done", verify: { state: "mismatch" } }, { result: "canceled" }];
    assert.deepEqual(tr.FILTROS.map((f: any) => f.label), ["Tudo", "Enviando", "Pausados", "Terminados", "Com erro"]);
    assert.deepEqual(tr.contagem(fila, hist), { tudo: 9, enviando: 3, pausados: 2, terminados: 3, erro: 2 });
  });

  test("a porcentagem geral é a da rodada: lote todo terminado e cancelado ficam de fora", () => {
    const r = tr.rodada([
      { batchId: "L1", status: "done", size: 100 },
      { batchId: "L1", status: "running", size: 100, offset: 50, inflight: 0 },
      { batchId: "L1", status: "canceled", size: 900 },
      { batchId: "L0", status: "done", size: 10_000 },
    ]);
    assert.equal(r.frac, 0.75);
    assert.deepEqual([r.feitos, r.total, r.restantes], [1, 2, 50]);
  });
});

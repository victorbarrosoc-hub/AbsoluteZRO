// Criação · Fluxo, o que é puro (fase F4): o link colado (YouTube, Vimeo, Drive, redes, web; nada interno; sem rede),
// a referência do próprio Maestro, a conferência das operações e dos dados de cada nó, texto colado vira notas, a
// exportação em Markdown e em JSON maestro.fluxo/1 (seções, notas, links, legendas, referências, sem URL de imagem sem
// o link) e as contas da cota. Mais a imagem: conferida pelos bytes, reencodada em WebP ≤ 400 KB, sem metadados.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import sharp from "sharp";
import { lerLink, referenciaDoMaestro, NOME_FONTE_LINK } from "../src/lib/criacao/fluxo/endereco";
import { lerDados, lerOps, notasDoTexto, LIMITES, TAMANHO_PADRAO, type NoFluxo, type LigacaoFluxo } from "../src/lib/criacao/fluxo/modelo";
import { fluxoParaJson, fluxoParaMarkdown, duracao, FORMATO_FLUXO } from "../src/lib/criacao/fluxo/exportar";
import { cabeNaCota, COTA, formatarBytes, fracaoUsada, mensagemDaCota } from "../src/lib/criacao/fluxo/cota";
import { prepararImagem, IMAGEM_SAIDA_MAX, MINI_SAIDA_MAX, IMAGEM_LADO_MAX } from "../src/lib/criacao/fluxo/imagem";

const link = (u: string) => {
  const r = lerLink(u);
  assert.equal(r.ok, true, `${u}: ${JSON.stringify(r)}`);
  return (r as Extract<typeof r, { ok: true }>).link;
};
const recusa = (u: string) => {
  const r = lerLink(u);
  assert.equal(r.ok, false, u);
  return (r as Extract<typeof r, { ok: false }>).erro;
};

describe("link colado: reconhecido pelo endereço, sem buscar nada", () => {
  test("YouTube: watch, youtu.be, shorts, embed, com tempo", () => {
    const a = link("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x#comentario");
    assert.deepEqual(a, {
      fonte: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      dominio: "youtube.com",
      id: "dQw4w9WgXcQ",
      embed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      miniatura: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    const b = link("https://youtu.be/dQw4w9WgXcQ?t=42");
    assert.equal(b.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s");
    assert.equal(b.inicio, 42);
    assert.equal(b.embed, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42");
    assert.equal(link("https://m.youtube.com/shorts/dQw4w9WgXcQ").id, "dQw4w9WgXcQ");
    assert.equal(link("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s").inicio, 90);
    assert.equal(link("youtube.com/embed/dQw4w9WgXcQ").fonte, "youtube", "sem https:// também lê");
    assert.match(recusa("https://www.youtube.com/watch?v=curto"), /YouTube/);
  });

  test("Vimeo: público e privado (h), player; sem miniatura inventada", () => {
    const a = link("https://vimeo.com/76979871");
    assert.equal(a.embed, "https://player.vimeo.com/video/76979871");
    assert.equal(a.miniatura, null);
    const p = link("https://vimeo.com/76979871/abc123def0");
    assert.deepEqual(
      [p.url, p.chave, p.embed],
      ["https://vimeo.com/76979871/abc123def0", "abc123def0", "https://player.vimeo.com/video/76979871?h=abc123def0"],
    );
    assert.equal(link("https://player.vimeo.com/video/76979871?h=abc123def0").chave, "abc123def0");
    assert.match(recusa("https://vimeo.com/canal/sobre"), /Vimeo/);
  });

  test("Google Drive: arquivo, pasta, Documentos, Planilhas, Apresentações, Formulários", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    const arq = link(`https://drive.google.com/file/d/${id}/view?usp=sharing`);
    assert.deepEqual(
      [arq.drive, arq.url, arq.embed],
      ["arquivo", `https://drive.google.com/file/d/${id}/view`, `https://drive.google.com/file/d/${id}/preview`],
    );
    assert.equal(link(`https://drive.google.com/open?id=${id}`).drive, "arquivo");
    const rk = link(`https://drive.google.com/file/d/${id}/view?resourcekey=0-abc`);
    assert.equal(rk.url, `https://drive.google.com/file/d/${id}/view?resourcekey=0-abc`);
    const pasta = link(`https://drive.google.com/drive/u/1/folders/${id}`);
    assert.deepEqual([pasta.drive, pasta.url, pasta.embed], ["pasta", `https://drive.google.com/drive/folders/${id}`, null]);
    const doc = link(`https://docs.google.com/document/d/${id}/edit#heading=h.1`);
    assert.deepEqual(
      [doc.drive, doc.url, doc.embed],
      ["documento", `https://docs.google.com/document/d/${id}/edit`, `https://docs.google.com/document/d/${id}/preview`],
    );
    assert.equal(link(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`).drive, "planilha");
    assert.equal(link(`https://docs.google.com/presentation/d/${id}/edit`).drive, "apresentacao");
    const form = link(`https://docs.google.com/forms/d/e/${id}/viewform`);
    assert.deepEqual([form.drive, form.embed], ["formulario", null]);
    assert.match(recusa("https://drive.google.com/file/d/x/view"), /Drive/);
  });

  test("redes e web: nome do site, domínio, nada de player nem miniatura", () => {
    assert.equal(link("https://www.instagram.com/p/Cabc123/").fonte, "instagram");
    assert.equal(link("https://vm.tiktok.com/ZM123/").fonte, "tiktok");
    assert.equal(link("https://br.pinterest.com/pin/123/").fonte, "pinterest");
    assert.equal(link("https://pin.it/abc").fonte, "pinterest");
    const w = link("https://www.exemplo.com.br/referencia?x=1#parte");
    assert.deepEqual(
      [w.fonte, w.dominio, w.url, w.embed, w.miniatura],
      ["web", "exemplo.com.br", "https://www.exemplo.com.br/referencia?x=1#parte", null, null],
    );
    assert.equal(link("http://exemplo.com/a").url, "http://exemplo.com/a", "http vale como referência");
    assert.equal(NOME_FONTE_LINK.web, "Link");
  });

  test("recusa: vazio, outro protocolo, endereço interno, usuário e senha, comprido demais", () => {
    for (const u of [
      "",
      "javascript:alert(1)",
      "ftp://exemplo.com/a",
      "file:///etc/passwd",
      "data:text/html,oi",
      "http://localhost:3000/x",
      "http://127.0.0.1/x",
      "http://10.0.0.1/x",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://intranet/",
      "https://servidor.local/a",
      "https://usuario:senha@exemplo.com/",
      `https://exemplo.com/${"a".repeat(2001)}`,
    ])
      recusa(u);
  });

  test("referência do próprio Maestro: roteiro e card, só da origem do site", () => {
    const origens = ["http://localhost:3000", "https://maestro.absolutezro.com"];
    const r = referenciaDoMaestro("https://maestro.absolutezro.com/app/criacao/roteiros/5F1A2B3C-0000-4000-8000-000000000001", origens);
    assert.deepEqual(r, { tipo: "roteiro", id: "5f1a2b3c-0000-4000-8000-000000000001" });
    assert.deepEqual(referenciaDoMaestro("http://localhost:3000/app/quadro?card=card-aurora", origens), { tipo: "card", id: "card-aurora" });
    assert.equal(referenciaDoMaestro("https://outro.exemplo/app/quadro?card=card-aurora", origens), null);
    assert.equal(referenciaDoMaestro("https://maestro.absolutezro.com/app/criacao/roteiros/nao-e-uuid", origens), null);
    assert.equal(referenciaDoMaestro("https://maestro.absolutezro.com/app/hoje", origens), null);
  });
});

describe("dados de cada nó e operações", () => {
  test("lerDados: normaliza, tira chave desconhecida, refaz o link no servidor", () => {
    assert.deepEqual(lerDados("nota", { texto: "  Linha 1  \r\n\n\n\nLinha 2 ", extra: 1 }), { texto: "Linha 1\n\nLinha 2", cor: "amarelo" });
    assert.equal(lerDados("nota", { texto: "x".repeat(LIMITES.nota + 1) }), null);
    assert.equal(lerDados("nota", { texto: "a", cor: "azul-royal" }), null);
    assert.deepEqual(lerDados("secao", { nome: "  Clima   e luz " }), { nome: "Clima e luz", cor: "pessego" });
    assert.deepEqual(lerDados("imagem", { legenda: "Fim de tarde" }), { legenda: "Fim de tarde" });
    const l = lerDados("link", { url: "https://youtu.be/dQw4w9WgXcQ", titulo: "Ritmo", link: { fonte: "web", embed: "https://mal.exemplo" } });
    assert.ok(l && "link" in l);
    assert.equal(l.link.fonte, "youtube");
    assert.equal(l.link.embed, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "a tela não escolhe o player");
    assert.equal(lerDados("link", { url: "http://localhost/x" }), null);
    assert.deepEqual(lerDados("roteiro", { titulo: "não guarda título" }), {});
  });

  test("lerOps: criar com padrão de tamanho, mudar parcial, ligação, recusa com o índice", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const outro = "00000000-0000-4000-8000-000000000002";
    const r = lerOps([
      { op: "criar_no", id, tipo: "nota", x: 10.123, y: -5, dados: { texto: "Oi" } },
      { op: "mudar_no", id, rev: 2, x: 30 },
      { op: "criar_ligacao", de: id, para: outro, rotulo: "  leva a  " },
      { op: "apagar_no", id: outro },
    ]);
    assert.ok(r.ok);
    const c = r.ops[0];
    assert.ok(c.op === "criar_no");
    assert.deepEqual([c.x, c.y, c.w, c.h, c.z], [10.12, -5, TAMANHO_PADRAO.nota.w, TAMANHO_PADRAO.nota.h, 0]);
    assert.deepEqual(r.ops[1], { op: "mudar_no", id, rev: 2, x: 30 });
    assert.deepEqual(r.ops[2], { op: "criar_ligacao", de: id, para: outro, rotulo: "leva a" });

    const casos: [unknown, number, RegExp][] = [
      [[{ op: "criar_no", tipo: "video" }], 0, /Tipo/],
      [[{ op: "criar_no", tipo: "nota", x: 2_000_000 }], 0, /canvas/],
      [[{ op: "criar_no", tipo: "nota", w: 2 }], 0, /canvas/],
      [[{ op: "criar_no", tipo: "imagem" }], 0, /imagem/],
      [[{ op: "criar_no", tipo: "roteiro", roteiroId: "x" }], 0, /roteiro/],
      [[{ op: "criar_no", tipo: "card", cardId: "a b" }], 0, /card/],
      [[{ op: "criar_no", tipo: "secao", secaoId: id }], 0, /Seção/],
      [[{ op: "criar_no", tipo: "link", dados: { url: "ftp://x" } }], 0, /conteúdo/],
      [
        [
          { op: "apagar_no", id },
          { op: "mudar_no", id },
        ],
        1,
        /Nada/,
      ],
      [[{ op: "mudar_no", id, rev: 0, x: 1 }], 0, /Versão/],
      [[{ op: "mudar_no", id, secaoId: id }], 0, /Seção/],
      [[{ op: "criar_ligacao", de: id, para: id }], 0, /dois itens/],
      [[{ op: "criar_ligacao", de: id, para: outro, rotulo: "x".repeat(121) }], 0, /rótulo/],
      [[{ op: "explodir" }], 0, /desconhecida/],
    ];
    for (const [ops, indice, msg] of casos) {
      const l = lerOps(ops);
      assert.equal(l.ok, false, JSON.stringify(ops));
      assert.ok(!l.ok && l.indice === indice && msg.test(l.mensagem), `${JSON.stringify(ops)} → ${JSON.stringify(l)}`);
    }
    assert.equal(lerOps([]).ok, false);
    assert.equal(lerOps(Array.from({ length: LIMITES.ops + 1 }, () => ({ op: "apagar_no", id }))).ok, false);
    assert.equal(lerOps(Array.from({ length: LIMITES.ops }, () => ({ op: "apagar_no", id }))).ok, true);
  });

  test("texto colado com parágrafos vira várias notas em coluna", () => {
    const ops = notasDoTexto("Gancho: a xícara\n\nPaleta quente\n\n\n  \nTrilha: violão", { x: 100, y: 50 });
    assert.deepEqual(
      ops.map((o) => [(o.dados as { texto: string }).texto, o.x, o.y]),
      [
        ["Gancho: a xícara", 100, 50],
        ["Paleta quente", 100, 186],
        ["Trilha: violão", 100, 322],
      ],
    );
    const l = lerOps(ops);
    assert.ok(l.ok, "o que a tela monta passa na conferência");
  });
});

// ───────────── exportar ─────────────

let seq = 0;
const no = (p: Partial<NoFluxo> & Pick<NoFluxo, "tipo" | "dados">): NoFluxo => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  z: 0,
  secaoId: null,
  imagemId: null,
  roteiroId: null,
  cardId: null,
  imagem: null,
  rev: 1,
  apagado: false,
  atualizado: "2026-10-29 12:00:00+00",
  atualizadoPor: null,
  ...p,
});

function fluxoDeExemplo() {
  const clima = no({ tipo: "secao", x: 60, y: 150, dados: { nome: "Clima e luz", cor: "pessego" } });
  const narrativa = no({ tipo: "secao", x: 700, y: 160, dados: { nome: "Narrativa", cor: "lavanda" } });
  const img = no({
    tipo: "imagem",
    x: 80,
    y: 190,
    secaoId: clima.id,
    imagemId: "11111111-0000-4000-8000-000000000001",
    dados: { legenda: "Fim de tarde, contraluz" },
    imagem: {
      id: "11111111-0000-4000-8000-000000000001",
      sha256: "a".repeat(64),
      largura: 1600,
      altura: 1000,
      miniLargura: 320,
      miniAltura: 200,
      url: "/api/criacao/img/x/y",
      miniUrl: "/api/criacao/img/x/y?mini=1",
    },
  });
  const nota = no({ tipo: "nota", x: 450, y: 200, secaoId: clima.id, dados: { texto: "Paleta quente, nada de azul.\nRitmo lento.", cor: "amarelo" } });
  const yt = lerDados("link", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", titulo: "Referência de ritmo" })!;
  const lk = no({ tipo: "link", x: 80, y: 370, secaoId: clima.id, dados: yt });
  const gancho = no({ tipo: "nota", x: 720, y: 205, secaoId: narrativa.id, dados: { texto: "Gancho: a xícara antes do sol nascer.", cor: "amarelo" } });
  const rot = no({ tipo: "roteiro", x: 720, y: 315, secaoId: narrativa.id, roteiroId: "22222222-0000-4000-8000-000000000001", dados: {} });
  const card = no({ tipo: "card", x: 940, y: 215, secaoId: narrativa.id, cardId: "card-aurora", dados: {} });
  const fora = no({ tipo: "roteiro", x: 950, y: 330, secaoId: narrativa.id, roteiroId: "22222222-0000-4000-8000-000000000002", dados: {} });
  const trilha = no({ tipo: "nota", x: 360, y: 575, dados: { texto: "Trilha: violão + piano, 70 bpm.", cor: "menta" } });
  const morto = no({ tipo: "nota", x: 0, y: 0, apagado: true, dados: { texto: "apagado", cor: "amarelo" } });
  const ligacoes: LigacaoFluxo[] = [
    { id: "l1", de: gancho.id, para: rot.id, rotulo: null, rev: 1, apagado: false, atualizado: "" },
    { id: "l2", de: trilha.id, para: img.id, rotulo: "clima", rev: 1, apagado: false, atualizado: "" },
    { id: "l3", de: morto.id, para: img.id, rotulo: null, rev: 1, apagado: false, atualizado: "" },
    { id: "l4", de: nota.id, para: gancho.id, rotulo: null, rev: 2, apagado: true, atualizado: "" },
  ];
  return {
    titulo: "Verão · Café Aurora",
    nos: [trilha, card, morto, clima, narrativa, img, nota, lk, gancho, rot, fora],
    ligacoes,
    refs: {
      [rot.id]: {
        tipo: "roteiro" as const,
        estado: "ok" as const,
        id: rot.roteiroId!,
        titulo: "Institucional",
        situacao: "com_cliente" as const,
        versao: 3,
        duracaoSeg: 74,
        naLixeira: false,
      },
      [card.id]: {
        tipo: "card" as const,
        estado: "ok" as const,
        id: "card-aurora",
        titulo: "Gravação",
        coluna: "agendado",
        colunaNome: "Agendado",
        colunaCor: "lavanda",
        prazo: "2026-11-12",
        naLixeira: false,
      },
      [fora.id]: { tipo: "roteiro" as const, estado: "sem_acesso" as const },
    },
  };
}
const AGORA = new Date("2026-10-29T15:00:00Z");

describe("exportar: Markdown para IA e JSON maestro.fluxo/1", () => {
  test("Markdown: seções em ordem de leitura, itens, ligações vivas; sem link, imagem 'não incluída'", () => {
    const md = fluxoParaMarkdown(fluxoDeExemplo(), { agora: AGORA });
    assert.equal(
      md,
      [
        "# Fluxo: Verão · Café Aurora",
        "> Do Maestro, 29/10/2026 · 8 itens",
        "",
        "## Clima e luz",
        '- Imagem: "Fim de tarde, contraluz" (não incluída)',
        "- Nota: Paleta quente, nada de azul.",
        "  Ritmo lento.",
        "- Link: Referência de ritmo, youtube.com (https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
        "",
        "## Narrativa",
        "- Nota: Gancho: a xícara antes do sol nascer.",
        '- Card: "Gravação" (Agendado, prazo 12/11)',
        '- Roteiro: "Institucional" (v3, 1:14)',
        "- Roteiro: (sem acesso)",
        "",
        "## Fora das seções",
        "- Nota: Trilha: violão + piano, 70 bpm.",
        "",
        "## Ligações",
        '- "Gancho: a xícara antes do sol nascer." → Roteiro "Institucional" (v3, 1:14)',
        '- "Trilha: violão + piano, 70 bpm." → Imagem "Fim de tarde, contraluz" · clima',
        "",
        "> Crie um link para incluir as imagens.",
        "",
      ].join("\n"),
    );
    assert.doesNotMatch(md, /\/api\/criacao\/img/, "o endereço interno nunca sai");
    assert.doesNotMatch(md, /apagado/);
  });

  test("Markdown com o link (F6): imagem leva o endereço público e some o aviso", () => {
    const md = fluxoParaMarkdown(fluxoDeExemplo(), { agora: AGORA, urlImagem: (i) => `https://maestro.absolutezro.com/f/TOKEN/i/${i.id}.webp` });
    assert.match(md, /- Imagem: "Fim de tarde, contraluz" \(https:\/\/maestro\.absolutezro\.com\/f\/TOKEN\/i\/11111111-0000-4000-8000-000000000001\.webp\)/);
    assert.doesNotMatch(md, /Crie um link/);
  });

  test("sem seção: itens direto; referência removida; fluxo vazio", () => {
    const n = no({ tipo: "card", cardId: null, dados: {} });
    const md = fluxoParaMarkdown({ titulo: "## Ideias", nos: [n], ligacoes: [], refs: { [n.id]: { tipo: "card", estado: "removido" } } }, { agora: AGORA });
    assert.equal(md, "# Fluxo: Ideias\n> Do Maestro, 29/10/2026 · 1 item\n\n- Card: (removido)\n");
    assert.equal(
      fluxoParaMarkdown({ titulo: "Vazio", nos: [], ligacoes: [], refs: {} }, { agora: AGORA }),
      "# Fluxo: Vazio\n> Do Maestro, 29/10/2026 · 0 itens\n",
    );
  });

  test("JSON: formato, seções à parte, nós em ordem, sem URL de imagem sem link, sem título do que não se vê", () => {
    const f = fluxoDeExemplo();
    const j = fluxoParaJson(f, { agora: AGORA });
    assert.equal(j.formato, FORMATO_FLUXO);
    assert.equal(j.formato, "maestro.fluxo/1");
    assert.equal(j.geradoEm, "2026-10-29T15:00:00.000Z");
    assert.equal(j.itens, 8);
    assert.deepEqual(
      j.secoes.map((s) => [s.nome, s.cor]),
      [
        ["Clima e luz", "pessego"],
        ["Narrativa", "lavanda"],
      ],
    );
    assert.deepEqual(
      j.nos.map((n) => n.tipo),
      ["imagem", "nota", "link", "nota", "card", "roteiro", "roteiro", "nota"],
    );
    const img = j.nos[0];
    assert.deepEqual(img.imagem, { largura: 1600, altura: 1000, url: null });
    assert.equal(img.legenda, "Fim de tarde, contraluz");
    assert.deepEqual(j.nos[2].link, {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      titulo: "Referência de ritmo",
      fonte: "youtube",
      nomeFonte: "YouTube",
      dominio: "youtube.com",
      id: "dQw4w9WgXcQ",
    });
    assert.deepEqual(j.nos[5].ref, { estado: "ok", titulo: "Institucional", situacao: "com_cliente", versao: 3, duracaoSeg: 74, naLixeira: false });
    assert.deepEqual(j.nos[6].ref, { estado: "sem_acesso" });
    assert.equal(j.nos[7].secao, null);
    assert.deepEqual(
      j.ligacoes.map((l) => l.id),
      ["l1", "l2"],
    );
    const texto = JSON.stringify(j);
    assert.doesNotMatch(texto, /22222222-0000-4000-8000-000000000002/, "o id do roteiro fora do alcance não sai");
    assert.doesNotMatch(texto, /\/api\/criacao\/img/);
    assert.equal(fluxoParaJson(f, { agora: AGORA, urlImagem: () => "https://x/i.webp" }).nos[0].imagem?.url, "https://x/i.webp");
  });

  test("duração m:ss", () => {
    assert.deepEqual([duracao(0), duracao(74), duracao(600), duracao(3725)], ["0:00", "1:14", "10:00", "1:02:05"]);
  });
});

describe("cota de imagens", () => {
  test("contas: cabe até o limite exato; passa um byte, não; por fluxo", () => {
    assert.equal(COTA.bytesPorOrganizacao, 200 * 1024 * 1024);
    assert.deepEqual(cabeNaCota({ usado: 0, novo: 100, limite: 100, noFluxo: 0 }), { ok: true, sobra: 0 });
    const c = cabeNaCota({ usado: 1, novo: 100, limite: 100, noFluxo: 0 });
    assert.equal(c.ok, false);
    assert.ok(!c.ok && c.erro === "cota" && /limite \(1 B de 100 B\)/.test(c.mensagem));
    const f = cabeNaCota({ usado: 0, novo: 1, noFluxo: COTA.imagensPorFluxo });
    assert.ok(!f.ok && f.erro === "cota_fluxo" && /300 imagens/.test(f.mensagem));
    assert.equal(cabeNaCota({ usado: 0, novo: 1, noFluxo: COTA.imagensPorFluxo - 1 }).ok, true);
  });

  test("bytes em português e fração usada", () => {
    assert.deepEqual(
      [
        formatarBytes(12),
        formatarBytes(1024),
        formatarBytes(1536),
        formatarBytes(400 * 1024),
        formatarBytes(200 * 1024 * 1024),
        formatarBytes(1.25 * 1024 ** 3),
      ],
      ["12 B", "1 KB", "1,5 KB", "400 KB", "200 MB", "1,3 GB"],
    );
    assert.equal(fracaoUsada({ usado: 50, limite: 200 }), 0.25);
    assert.equal(fracaoUsada({ usado: 999, limite: 1000 }), 0.99);
    assert.equal(fracaoUsada({ usado: 5000, limite: 1000 }), 1);
    assert.equal(fracaoUsada({ usado: 0, limite: 0 }), 1);
  });

  test("mensagem do erro do banco", () => {
    assert.match(mensagemDaCota("cota", "209715000/209715200"), /200 MB de 200 MB/);
    assert.match(mensagemDaCota("cota_fluxo", "300/300"), /300 imagens/);
    assert.match(mensagemDaCota("cota", null), /200 MB/);
  });
});

describe("imagem colada: conferida pelos bytes, WebP limpo", () => {
  test("JPEG grande com EXIF vira WebP ≤ 2048 px e 400 KB, sem metadados, com miniatura", async () => {
    // ruído: não comprime fácil, força os degraus
    const w = 3000;
    const h = 2000;
    const ruido = Buffer.alloc(w * h * 3);
    for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 2654435761) >>> 24;
    const jpeg = await sharp(ruido, { raw: { width: w, height: h, channels: 3 } })
      .jpeg({ quality: 95 })
      .withMetadata({ exif: { IFD0: { Copyright: "Pessoa de teste", Make: "Câmera" } } })
      .toBuffer();
    assert.ok((await sharp(jpeg).metadata()).exif, "a entrada tem EXIF");
    const r = await prepararImagem(jpeg);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(r.webp.length <= IMAGEM_SAIDA_MAX, `${r.webp.length}`);
    assert.ok(r.mini.length <= MINI_SAIDA_MAX, `${r.mini.length}`);
    assert.ok(Math.max(r.largura, r.altura) <= IMAGEM_LADO_MAX);
    assert.ok(Math.max(r.miniLargura, r.miniAltura) <= 320);
    const meta = await sharp(r.webp).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined, "sem EXIF");
    assert.equal(meta.xmp, undefined, "sem XMP");
    assert.equal(meta.icc, undefined, "sem perfil");
    assert.equal(r.sha256.length, 64);
  });

  test("gira pela orientação; pequena não aumenta", async () => {
    const jpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#c96" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = await prepararImagem(jpeg);
    assert.ok(r.ok);
    assert.deepEqual([r.largura, r.altura], [20, 40]);
  });

  test("recusa: vazio, SVG, GIF, texto, extensão mentirosa, grande demais", async () => {
    assert.equal((await prepararImagem(new Uint8Array())).ok, false);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const r1 = await prepararImagem(svg);
    assert.ok(!r1.ok && r1.erro === "tipo");
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    assert.ok(!(await prepararImagem(gif)).ok);
    const quebrado = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("não é png")]);
    const r2 = await prepararImagem(quebrado);
    assert.ok(!r2.ok && r2.erro === "invalido");
    const r3 = await prepararImagem(new Uint8Array(12 * 1024 * 1024 + 1));
    assert.ok(!r3.ok && r3.erro === "grande");
  });
});

// Detector de fontes da revisão (src/lib/revisao/fontes/detectar.ts) e o tempo (src/lib/revisao/tempo.ts): puros.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { capacidades, detectarFonte, urlDrivePreview, urlDriveStream, type TipoFonte } from "../src/lib/revisao/fontes/detectar";
import { formatarTempo, lerTempo, notasCsv, notasEdl, timecode, type Nota } from "../src/lib/revisao/tempo";

const DRIVE = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

type Caso = [entrada: string, tipo: TipoFonte, url: string, extra?: { id?: string; chave?: string }];

const CASOS: Caso[] = [
  // Google Drive: link de ver, de prévia, de editar, open?id= e uc?id=; resourcekey preservada
  [`https://drive.google.com/file/d/${DRIVE}/view?usp=sharing`, "drive", `https://drive.google.com/file/d/${DRIVE}/view`, { id: DRIVE }],
  [`https://drive.google.com/file/d/${DRIVE}/preview`, "drive", `https://drive.google.com/file/d/${DRIVE}/view`, { id: DRIVE }],
  [`https://drive.google.com/file/d/${DRIVE}/edit#t=10`, "drive", `https://drive.google.com/file/d/${DRIVE}/view`, { id: DRIVE }],
  [`https://drive.google.com/open?id=${DRIVE}`, "drive", `https://drive.google.com/file/d/${DRIVE}/view`, { id: DRIVE }],
  [`https://drive.google.com/uc?id=${DRIVE}&export=download`, "drive", `https://drive.google.com/file/d/${DRIVE}/view`, { id: DRIVE }],
  [
    `https://drive.google.com/file/d/${DRIVE}/view?resourcekey=0-abcDEF_12`,
    "drive",
    `https://drive.google.com/file/d/${DRIVE}/view?resourcekey=0-abcDEF_12`,
    { id: DRIVE, chave: "0-abcDEF_12" },
  ],
  [`https://docs.google.com/file/d/${DRIVE}/view`, "drive", `https://drive.google.com/file/d/${DRIVE}/view`, { id: DRIVE }],
  // YouTube: watch, youtu.be, shorts, embed, live, celular, nocookie; o tempo do link é ignorado
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { id: "dQw4w9WgXcQ" }],
  ["https://youtu.be/dQw4w9WgXcQ?si=abc", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { id: "dQw4w9WgXcQ" }],
  ["https://youtube.com/shorts/dQw4w9WgXcQ", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { id: "dQw4w9WgXcQ" }],
  ["https://www.youtube.com/embed/dQw4w9WgXcQ", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { id: "dQw4w9WgXcQ" }],
  ["https://www.youtube.com/live/dQw4w9WgXcQ", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { id: "dQw4w9WgXcQ" }],
  ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { id: "dQw4w9WgXcQ" }],
  ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { id: "dQw4w9WgXcQ" }],
  // Vimeo: público, privado (hash no caminho ou em ?h=), player e canal
  ["https://vimeo.com/76979871", "vimeo", "https://vimeo.com/76979871", { id: "76979871" }],
  ["https://vimeo.com/76979871/8272103f6e", "vimeo", "https://vimeo.com/76979871/8272103f6e", { id: "76979871", chave: "8272103f6e" }],
  ["https://player.vimeo.com/video/76979871?h=8272103f6e&badge=0", "vimeo", "https://vimeo.com/76979871/8272103f6e", { id: "76979871", chave: "8272103f6e" }],
  ["https://vimeo.com/channels/staffpicks/76979871", "vimeo", "https://vimeo.com/76979871", { id: "76979871" }],
  // Dropbox: ?dl=0 vira ?raw=1 (o <video> toca), rlkey preservada; link direto do conteúdo
  ["https://www.dropbox.com/s/abc123/peca.mp4?dl=0", "dropbox", "https://www.dropbox.com/s/abc123/peca.mp4?raw=1"],
  ["https://www.dropbox.com/scl/fi/xyz789/peca-final.mp4?rlkey=k3y&dl=0", "dropbox", "https://www.dropbox.com/scl/fi/xyz789/peca-final.mp4?rlkey=k3y&raw=1"],
  ["https://dl.dropboxusercontent.com/s/abc123/peca.mp4", "dropbox", "https://dl.dropboxusercontent.com/s/abc123/peca.mp4"],
  // Arquivo direto e HLS
  ["https://cdn.exemplo.com/entregas/peca-v2.mp4", "mp4", "https://cdn.exemplo.com/entregas/peca-v2.mp4"],
  ["https://cdn.exemplo.com/peca.MOV?assinatura=1", "mp4", "https://cdn.exemplo.com/peca.MOV?assinatura=1"],
  ["https://cdn.exemplo.com/peca.webm", "mp4", "https://cdn.exemplo.com/peca.webm"],
  ["https://stream.exemplo.com/hls/peca/master.m3u8", "hls", "https://stream.exemplo.com/hls/peca/master.m3u8"],
  // Genérico: qualquer outro https abre em outra aba (tempo digitado)
  ["https://wetransfer.com/downloads/abc", "link", "https://wetransfer.com/downloads/abc"],
  ["  https://frame.exemplo.com/review/1#x  ", "link", "https://frame.exemplo.com/review/1"],
];

const RECUSADOS: [string, RegExp][] = [
  ["", /Cole o link/],
  ["não é link", /não parece um link/],
  ["http://cdn.exemplo.com/peca.mp4", /https/],
  ["javascript:alert(1)", /https/],
  ["https://user:senha@cdn.exemplo.com/peca.mp4", /usuário e senha/],
  ["https://localhost/peca.mp4", /público/],
  ["https://127.0.0.1/peca.mp4", /público/],
  ["https://[::1]/peca.mp4", /público/],
  ["https://10.0.0.5/peca.mp4", /público/],
  ["https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp", /pasta/],
  ["https://drive.google.com/file/d/curto/view", /arquivo/],
  ["https://www.youtube.com/watch?v=curto", /vídeo/],
  ["https://vimeo.com/sobre", /vídeo/],
  ["https://www.dropbox.com/sh/abc/def", /pasta/],
  [`https://cdn.exemplo.com/${"a".repeat(2000)}.mp4`, /comprido/],
];

describe("detector de fontes", () => {
  for (const [entrada, tipo, url, extra] of CASOS) {
    test(`${tipo}: ${entrada.trim().slice(0, 70)}`, () => {
      const r = detectarFonte(entrada);
      assert.equal(r.ok, true, JSON.stringify(r));
      if (!r.ok) return;
      assert.equal(r.tipo, tipo);
      assert.equal(r.url, url);
      if (extra?.id) assert.equal(r.id, extra.id);
      assert.equal(r.chave, extra?.chave);
    });
  }
  for (const [entrada, msg] of RECUSADOS) {
    test(`recusa: ${entrada.slice(0, 60) || "(vazio)"}`, () => {
      const r = detectarFonte(entrada);
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.erro, msg);
    });
  }

  test("capacidades: Drive só tem tempo com a chave do Maestro e sem resourcekey", () => {
    assert.deepEqual(capacidades({ tipo: "drive" }), { tempo: false, quadro: false, velocidade: false });
    assert.equal(capacidades({ tipo: "drive" }, { driveStream: true }).tempo, true);
    assert.equal(capacidades({ tipo: "drive", chave: "0-x" }, { driveStream: true }).tempo, false);
    assert.equal(capacidades({ tipo: "mp4" }).quadro, true);
    assert.equal(capacidades({ tipo: "youtube" }).quadro, false);
    assert.equal(capacidades({ tipo: "link" }).tempo, false);
  });

  test("endereços do Drive: stream pela Drive API com a chave e iframe de prévia", () => {
    assert.equal(
      urlDriveStream(DRIVE, "CHAVE_DE_TESTE_123"),
      `https://www.googleapis.com/drive/v3/files/${DRIVE}?alt=media&supportsAllDrives=true&key=CHAVE_DE_TESTE_123`,
    );
    assert.equal(urlDriveStream(DRIVE, ""), null);
    assert.equal(urlDrivePreview(DRIVE), `https://drive.google.com/file/d/${DRIVE}/preview`);
    assert.equal(urlDrivePreview("../x"), null);
  });
});

describe("tempo", () => {
  test("formata e lê", () => {
    assert.equal(formatarTempo(83_500), "1:23");
    assert.equal(formatarTempo(3_723_000), "1:02:03");
    assert.equal(formatarTempo(null), "–:––");
    assert.equal(timecode(83_500, 30), "00:01:23:15");
    assert.equal(timecode(1_000 / 25, 25), "00:00:00:01");
    for (const [t, ms] of [
      ["83", 83_000],
      ["1:23", 83_000],
      ["01:02:03", 3_723_000],
      ["1:23.5", 83_500],
      ["1,5", 1_500],
      ["1m23s", 83_000],
      ["2h", 7_200_000],
    ] as const)
      assert.equal(lerTempo(t), ms, t);
    for (const t of ["", "abc", "1:75", "25:00:00:00", "-3"]) assert.equal(lerTempo(t), null, t);
  });

  const notas: Nota[] = [
    { peca: "Reel", versao: 2, t: 12_000, autor: "cliente", nome: "Marina", texto: "Trocar a música aqui", resolvido: false, em: "2026-10-28T12:00:00Z" },
    { peca: "Reel", versao: 2, t: 20_000, tFim: 22_000, autor: "equipe", nome: "Leo", texto: '=HYPERLINK("x")', resolvido: true, em: "2026-10-28T12:01:00Z" },
    { peca: "Reel", versao: 2, t: null, autor: "cliente", nome: null, texto: "Geral, sem tempo", resolvido: false, em: "2026-10-28T12:02:00Z" },
  ];

  test("CSV: cabeçalho, timecode, aspas e nada de fórmula", () => {
    const csv = notasCsv(notas, 30);
    const linhas = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(linhas[0], "peca,versao,tempo,timecode,fim,autor,nome,texto,resolvido,criado_em");
    assert.equal(linhas[1], "Reel,v2,0:12,00:00:12:00,,cliente,Marina,Trocar a música aqui,não,2026-10-28T12:00:00Z");
    assert.match(linhas[2], /"'=HYPERLINK\(""x""\)"/);
    assert.match(linhas[2], /00:00:22:00/);
  });

  test("EDL: um marcador por nota com tempo, com a cor de quem comentou", () => {
    const edl = notasEdl("Lote | semana", notas, 30);
    assert.match(edl, /^TITLE: Lote semana\r\nFCM: NON-DROP FRAME/);
    assert.match(edl, /001 {2}001 {6}V {5}C {8}00:00:12:00 00:00:12:01 00:00:12:00 00:00:12:01/);
    assert.match(edl, /Trocar a msica aqui|Trocar a música aqui/);
    assert.match(edl, /\|C:ResolveColorYellow \|M:Reel v2 Marina \|D:1/);
    assert.match(edl, /002 .*00:00:20:00 00:00:22:00/);
    assert.match(edl, /\|D:60/);
    assert.doesNotMatch(edl, /Geral, sem tempo/);
  });
});

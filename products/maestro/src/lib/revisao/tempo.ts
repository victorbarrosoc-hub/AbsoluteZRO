/**
 * Tempo da revisão: como mostrar (1:23, 01:02:03:12), como ler o que a pessoa digita ("1:23", "83", "1:02:03") e a
 * exportação das notas para a ilha de edição (CSV e EDL com marcadores). Puro, sem navegador nem banco.
 */

/** Quadros por segundo quando a versão não diz (vídeo para redes: 30). */
export const FPS_PADRAO = 30;

/** 83_500 → "1:23"; 3_723_000 → "1:02:03". */
export function formatarTempo(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "–:––";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Timecode SMPTE sem drop frame: "HH:MM:SS:FF". */
export function timecode(ms: number, fps: number = FPS_PADRAO): string {
  const q = Math.max(1, Math.round(fps));
  const quadros = Math.max(0, Math.floor((ms / 1000) * q + 1e-6));
  const ff = quadros % q;
  const totalS = Math.floor(quadros / q);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(totalS / 3600))}:${p(Math.floor((totalS % 3600) / 60))}:${p(totalS % 60)}:${p(ff)}`;
}

/**
 * Lê um tempo digitado: "83" (segundos), "1:23", "01:02:03", "1:23.5" ou "1m23s". null se não der.
 * Teto de 24 h (o mesmo do banco).
 */
export function lerTempo(texto: string): number | null {
  const t = String(texto ?? "")
    .trim()
    .replace(",", ".");
  if (!t) return null;
  let s: number;
  const ms = t.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i);
  if (/[hms]/i.test(t) && ms && (ms[1] || ms[2] || ms[3])) {
    s = Number(ms[1] ?? 0) * 3600 + Number(ms[2] ?? 0) * 60 + Number(ms[3] ?? 0);
  } else if (/^\d+(\.\d+)?$/.test(t)) {
    s = Number(t);
  } else if (/^\d{1,2}(:\d{1,2}){1,2}(\.\d+)?$/.test(t)) {
    const partes = t.split(":").map(Number);
    if (partes.slice(1).some((n) => n >= 60)) return null;
    s = partes.reduce((acc, n) => acc * 60 + n, 0);
  } else return null;
  const r = Math.round(s * 1000);
  return Number.isFinite(r) && r >= 0 && r <= 86_400_000 ? r : null;
}

export type Nota = {
  peca: string;
  versao: number;
  t: number | null;
  tFim?: number | null;
  digitado?: boolean;
  autor: "equipe" | "cliente";
  nome?: string | null;
  texto: string;
  resolvido: boolean;
  em: string;
};

/** Célula de CSV segura: aspas dobradas e nada de fórmula (=, +, -, @ no começo viram texto). */
function celula(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function notasCsv(notas: Nota[], fps: number = FPS_PADRAO): string {
  const linhas = [["peca", "versao", "tempo", "timecode", "fim", "autor", "nome", "texto", "resolvido", "criado_em"].join(",")];
  for (const n of notas) {
    linhas.push(
      [
        n.peca,
        `v${n.versao}`,
        n.t === null ? "" : formatarTempo(n.t),
        n.t === null ? "" : timecode(n.t, fps),
        n.tFim ? timecode(n.tFim, fps) : "",
        n.autor,
        n.nome ?? "",
        n.texto,
        n.resolvido ? "sim" : "não",
        n.em,
      ]
        .map(celula)
        .join(","),
    );
  }
  // BOM: o Excel abre os acentos certos.
  return `﻿${linhas.join("\r\n")}\r\n`;
}

/** Texto de uma linha para a EDL (sem quebra nem barra vertical, que separa campos no marcador do Resolve). */
const linhaEdl = (s: string, max = 200) =>
  s
    .replace(/[\r\n|]+/g, " ")
    .replace(/[^\x20-\x7e -ÿ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * EDL CMX3600 com um marcador por nota com tempo (formato que o DaVinci Resolve importa como marcadores da timeline:
 * Timelines → Import → Timeline Markers from EDL). O timecode conta do zero do vídeo; a linha do marcador leva o texto.
 */
export function notasEdl(titulo: string, notas: Nota[], fps: number = FPS_PADRAO): string {
  const q = Math.max(1, Math.round(fps));
  const linhas = [`TITLE: ${linhaEdl(titulo, 60) || "Maestro"}`, "FCM: NON-DROP FRAME", ""];
  let i = 0;
  for (const n of notas) {
    if (n.t === null) continue;
    i++;
    const ini = timecode(n.t, fps);
    const fim = timecode(n.tFim && n.tFim > n.t ? n.tFim : n.t + 1000 / q, fps);
    const dur = n.tFim && n.tFim > n.t ? Math.max(1, Math.round(((n.tFim - n.t) / 1000) * q)) : 1;
    const cor = n.autor === "cliente" ? "ResolveColorYellow" : "ResolveColorBlue";
    linhas.push(`${String(i).padStart(3, "0")}  001      V     C        ${ini} ${fim} ${ini} ${fim}  `);
    linhas.push(`${linhaEdl(n.texto)} |C:${cor} |M:${linhaEdl(`${n.peca} v${n.versao}${n.nome ? ` ${n.nome}` : ""}`, 60)} |D:${dur}`);
    linhas.push("");
  }
  return linhas.join("\r\n");
}

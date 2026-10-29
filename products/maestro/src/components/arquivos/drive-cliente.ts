"use client";
/**
 * O Drive no navegador (aba Arquivos e player da revisão): o token curto vem de POST /api/arquivos/token (SOBEDESCE pela
 * ponte do HUB) e fica só na memória desta aba, por conta Google. As chamadas ao Drive v3 vão direto do navegador ao
 * Google; o vídeo toca pelo service worker (/drive-sw.js, escopo /app/) com Range. Nenhum byte passa pelo Maestro.
 */
import { criarListador, type ArquivoDrive, type DriveCall } from "@/lib/drive-web/nucleo.js";
import { criarStream, type TokenDoDrive } from "@/lib/drive-web/stream-pagina.js";

export type ContaDrive = { id: string; email: string };
export class ErroDrive extends Error {
  constructor(
    readonly status: number,
    readonly erro: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

type Guardado = TokenDoDrive & { conta: ContaDrive; contas: ContaDrive[] };
const tokens = new Map<string, Guardado>();
const emCurso = new Map<string, Promise<Guardado>>();
let contaPadrao = "";

/** O token de uma conta ('' = a primeira conectada), do cache da aba ou pedido de novo. */
export async function pedirToken(conta = "", renovar = false): Promise<Guardado> {
  const chave = conta || contaPadrao;
  const t = tokens.get(chave);
  if (t && !renovar && t.expiraEm - Date.now() > 60_000) return t;
  let p = emCurso.get(chave);
  if (!p) {
    p = (async () => {
      const r = await fetch("/api/arquivos/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chave ? { conta: chave } : {}),
        cache: "no-store",
        credentials: "same-origin",
      });
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok || !j) throw new ErroDrive(r.status, String(j?.erro ?? "erro"), String(j?.mensagem ?? "Não deu para abrir o Drive agora."));
      const g = j as unknown as Guardado;
      tokens.set(g.conta.id, g);
      if (!chave) contaPadrao = g.conta.id;
      tokens.set(chave || g.conta.id, g);
      return g;
    })().finally(() => emCurso.delete(chave));
    emCurso.set(chave, p);
  }
  return p;
}

/** A função de chamada do Drive v3 (GET) com o token da conta; 401 renova uma vez. */
export function driveCallDa(conta: string): DriveCall {
  return async (caminho, { query = {}, signal } = {}) => {
    for (let tentativa = 0; ; tentativa++) {
      const t = await pedirToken(conta, tentativa > 0);
      const u = new URL(`${t.api}${caminho}`);
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
      const r = await fetch(u, {
        headers: { Authorization: `Bearer ${t.token}` },
        signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (r.status === 401 && tentativa === 0) continue;
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok)
        throw Object.assign(new ErroDrive(r.status, "drive", "O Google Drive recusou agora."), { reason: (j?.error as { status?: string })?.status ?? null });
      return j;
    }
  };
}

export function listadorDa(conta: string) {
  return criarListador(driveCallDa(conta));
}

let stream: ReturnType<typeof criarStream> | null = null;
/** O stream da aba (um só): registra o SW na primeira vez. */
export function streamDoDrive() {
  stream ??= criarStream({ swUrl: "/drive-sw.js", escopo: "/app/", obterToken: (conta, { renovar }) => pedirToken(conta, renovar) });
  return stream;
}

/** Endereço do <video>/<img> para um arquivo do Drive (pelo SW), ou null se o SW não pegou a página. */
export async function urlDeMidia(arquivo: Pick<ArquivoDrive, "id" | "name" | "mimeType" | "size">, conta: string): Promise<string | null> {
  const s = streamDoDrive();
  if (!(await s.iniciar())) return null;
  return s.url(arquivo, conta);
}

/** Qual conta conectada enxerga o arquivo (o vídeo da revisão pode estar no Drive de qualquer uma). */
export async function contaQueVe(arquivoId: string): Promise<{ conta: string; arquivo: ArquivoDrive } | null> {
  const primeiro = await pedirToken("");
  for (const c of primeiro.contas) {
    try {
      const f = (await driveCallDa(c.id)(`/files/${encodeURIComponent(arquivoId)}`, {
        query: { supportsAllDrives: true, fields: "id,name,mimeType,size,videoMediaMetadata" },
      })) as unknown as ArquivoDrive;
      if (f?.id) return { conta: c.id, arquivo: f };
    } catch {
      // esta conta não vê; tenta a próxima
    }
  }
  return null;
}

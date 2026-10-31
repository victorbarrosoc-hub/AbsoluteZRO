/**
 * De onde vem a peça (plano v2 §4.1): a equipe cola um link e o Maestro descobre a fonte, normaliza o endereço e diz com
 * honestidade o que o player consegue (tempo automático, passo de quadro). Puro: roda no navegador (prévia ao colar),
 * no servidor (antes de gravar) e nos testes. O servidor NUNCA busca o link: nada de SSRF.
 *
 * Lista fechada de fontes com player: Google Drive, YouTube, Vimeo, Dropbox, arquivo de vídeo direto (mp4/mov/webm) e
 * HLS (.m3u8). Qualquer outro https vira "link": abre em outra aba e o comentário leva o tempo digitado.
 */

export type TipoFonte = "drive" | "youtube" | "vimeo" | "dropbox" | "mp4" | "hls" | "link";

export type Capacidades = {
  /** O player lê e muda o tempo (comentário no ponto exato). */
  tempo: boolean;
  /** Passo de quadro (← →) e timecode por quadro: só o <video> nativo. */
  quadro: boolean;
  /** Muda a velocidade (J/K/L). */
  velocidade: boolean;
};

export type Fonte = {
  tipo: TipoFonte;
  /** O endereço normalizado que vai para o banco. */
  url: string;
  /** Drive: id do arquivo; YouTube: id do vídeo; Vimeo: id numérico. */
  id?: string;
  /** Drive: resourcekey (arquivo antigo compartilhado por link); Vimeo: o `h` do link privado. */
  chave?: string;
};

export type Deteccao = ({ ok: true } & Fonte) | { ok: false; erro: string };

/** O nome de cada fonte na tela (mais "roteiro", a versão salva de um roteiro da Criação, drizzle/0033). */
export const NOME_DA_FONTE: Record<TipoFonte | "roteiro", string> = {
  drive: "Google Drive",
  youtube: "YouTube",
  vimeo: "Vimeo",
  dropbox: "Dropbox",
  mp4: "Arquivo de vídeo",
  hls: "Transmissão HLS",
  link: "Link",
  roteiro: "Roteiro",
};

export const LIMITE_URL = 2000;
const EXT_VIDEO = /\.(mp4|m4v|mov|webm)$/i;
const ID_DRIVE = /^[A-Za-z0-9_-]{10,200}$/;
const ID_YT = /^[A-Za-z0-9_-]{11}$/;

const falha = (erro: string): Deteccao => ({ ok: false, erro });

function hostPrivado(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IP literal (v4 ou v6): o link de uma peça é sempre um endereço público com nome.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

function drive(u: URL): Deteccao {
  if (/\/(drive\/)?folders\//.test(u.pathname)) return falha("Esse link é de uma pasta. Cole o link do arquivo de vídeo.");
  const m = u.pathname.match(/\/file\/d\/([^/]+)/);
  const id = m?.[1] ?? u.searchParams.get("id") ?? "";
  if (!ID_DRIVE.test(id)) return falha("Não achei o arquivo nesse link do Drive.");
  const chave = u.searchParams.get("resourcekey") ?? undefined;
  if (chave !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(chave)) return falha("Não achei o arquivo nesse link do Drive.");
  const url = `https://drive.google.com/file/d/${id}/view${chave ? `?resourcekey=${chave}` : ""}`;
  return { ok: true, tipo: "drive", url, id, ...(chave ? { chave } : {}) };
}

function youtube(u: URL, host: string): Deteccao {
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
  else id = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ?? "";
  if (!ID_YT.test(id)) return falha("Não achei o vídeo nesse link do YouTube.");
  return { ok: true, tipo: "youtube", url: `https://www.youtube.com/watch?v=${id}`, id };
}

function vimeo(u: URL, host: string): Deteccao {
  const partes = u.pathname.split("/").filter(Boolean);
  let id = "";
  let h = u.searchParams.get("h") ?? "";
  if (host === "player.vimeo.com") {
    if (partes[0] === "video") id = partes[1] ?? "";
  } else {
    const i = partes.findIndex((p) => /^\d{5,12}$/.test(p));
    if (i >= 0) {
      id = partes[i];
      if (!h && partes[i + 1] && /^[0-9a-f]{6,20}$/i.test(partes[i + 1])) h = partes[i + 1];
    }
  }
  if (!/^\d{5,12}$/.test(id)) return falha("Não achei o vídeo nesse link do Vimeo.");
  if (h && !/^[0-9a-f]{6,20}$/i.test(h)) h = "";
  return { ok: true, tipo: "vimeo", url: `https://vimeo.com/${id}${h ? `/${h}` : ""}`, id, ...(h ? { chave: h } : {}) };
}

function dropbox(u: URL, host: string): Deteccao {
  if (/^\/(sh|scl\/fo)\//.test(u.pathname)) return falha("Esse link é de uma pasta. Cole o link do arquivo de vídeo.");
  if (host === "dl.dropboxusercontent.com") {
    const limpo = new URL(`https://dl.dropboxusercontent.com${u.pathname}`);
    const rl = u.searchParams.get("rlkey");
    if (rl) limpo.searchParams.set("rlkey", rl);
    return { ok: true, tipo: "dropbox", url: limpo.toString() };
  }
  if (!/^\/(s|scl\/fi)\//.test(u.pathname)) return falha("Não achei o arquivo nesse link do Dropbox.");
  // ?dl=0 abre a página do Dropbox; ?raw=1 entrega o arquivo, e o <video> toca.
  const limpo = new URL(`https://www.dropbox.com${u.pathname}`);
  const rl = u.searchParams.get("rlkey");
  if (rl) limpo.searchParams.set("rlkey", rl);
  limpo.searchParams.set("raw", "1");
  return { ok: true, tipo: "dropbox", url: limpo.toString() };
}

/** Descobre a fonte de um link colado. */
export function detectarFonte(bruto: string): Deteccao {
  const texto = String(bruto ?? "").trim();
  if (!texto) return falha("Cole o link da peça.");
  if (texto.length > LIMITE_URL) return falha("Esse link é comprido demais.");
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return falha("Isso não parece um link.");
  }
  if (u.protocol !== "https:") return falha("Use um link que comece com https://.");
  if (u.username || u.password) return falha("Tire usuário e senha do link.");
  const host = u.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "");
  if (hostPrivado(host)) return falha("Use um endereço público.");
  u.hash = "";

  if (host === "drive.google.com" || host === "docs.google.com") return drive(u);
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com" || host === "music.youtube.com") return youtube(u, host);
  if (host === "vimeo.com" || host === "player.vimeo.com") return vimeo(u, host);
  if (host === "dropbox.com" || host === "dl.dropboxusercontent.com") return dropbox(u, host);
  if (/\.m3u8$/i.test(u.pathname)) return { ok: true, tipo: "hls", url: u.toString() };
  if (EXT_VIDEO.test(u.pathname)) return { ok: true, tipo: "mp4", url: u.toString() };
  return { ok: true, tipo: "link", url: u.toString() };
}

/**
 * O que cada fonte permite. Drive depende da chave de API do Maestro (MAESTRO_GOOGLE_API_KEY) e do arquivo: com a
 * chave e sem resourcekey, o arquivo toca num <video> (tempo e quadro); sem isso, só o iframe do Google (tempo digitado).
 */
export function capacidades(f: Pick<Fonte, "tipo" | "chave">, opcoes: { driveStream?: boolean } = {}): Capacidades {
  switch (f.tipo) {
    case "mp4":
    case "hls":
    case "dropbox":
      return { tempo: true, quadro: true, velocidade: true };
    case "youtube":
      return { tempo: true, quadro: false, velocidade: true };
    case "vimeo":
      return { tempo: true, quadro: false, velocidade: false };
    case "drive":
      return opcoes.driveStream && !f.chave ? { tempo: true, quadro: true, velocidade: true } : { tempo: false, quadro: false, velocidade: false };
    case "link":
      return { tempo: false, quadro: false, velocidade: false };
  }
}

/** Uma linha curta para a equipe ao colar o link. */
export function resumoDaFonte(f: Pick<Fonte, "tipo" | "chave">, opcoes: { driveStream?: boolean } = {}): string {
  const c = capacidades(f, opcoes);
  if (f.tipo === "link") return "Abre em outra aba. O comentário leva o tempo digitado.";
  if (f.tipo === "drive" && !c.tempo)
    return opcoes.driveStream
      ? "Arquivo antigo do Drive: toca sem tempo automático."
      : "Toca pelo Drive, com o tempo digitado. Compartilhe como “qualquer pessoa com o link”.";
  if (f.tipo === "drive") return "Toca com tempo automático se estiver como “qualquer pessoa com o link”.";
  return c.quadro ? "Tempo automático e passo de quadro." : "Tempo automático.";
}

// ───────────── endereços dos players (só os hosts acima) ─────────────

/** Drive pelo <video>, com a chave de API do Maestro (o arquivo precisa estar como "qualquer pessoa com o link"). */
export function urlDriveStream(id: string, chaveApi: string): string | null {
  if (!ID_DRIVE.test(id) || !chaveApi) return null;
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(chaveApi)}`;
}

/** Drive pelo iframe do Google (último recurso: sem tempo automático). */
export function urlDrivePreview(id: string, chave?: string | null): string | null {
  if (!ID_DRIVE.test(id)) return null;
  return `https://drive.google.com/file/d/${id}/preview${chave ? `?resourcekey=${encodeURIComponent(chave)}` : ""}`;
}

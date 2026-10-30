/**
 * Link colado no Fluxo (plano da Criação §6.4; decisão do titular 29/10/2026: sem busca no servidor na v1). Reconhece
 * YouTube, Vimeo e Google Drive (arquivo, pasta, Documentos, Planilhas, Apresentações, Formulários) pelo endereço,
 * dá nome ao Instagram, TikTok e Pinterest, e todo o resto vira "web" com o domínio e o título que a pessoa digita.
 * Puro e SEM rede: roda na tela (prévia ao colar), no servidor (antes de gravar) e nos testes. O servidor nunca abre o
 * link (nada de SSRF); `embed` e `miniatura` só apontam para hosts fixos dos próprios serviços.
 *
 * `referenciaDoMaestro` reconhece o link de um card ou roteiro do próprio Maestro (colar vira nó de referência).
 */

export type FonteLink = "youtube" | "vimeo" | "drive" | "instagram" | "tiktok" | "pinterest" | "web";
export type TipoDrive = "arquivo" | "pasta" | "documento" | "planilha" | "apresentacao" | "formulario";

export type LinkFluxo = {
  fonte: FonteLink;
  /** O endereço normalizado (o que vai para o banco e para a exportação). */
  url: string;
  /** Domínio sem "www." (o que a tela mostra embaixo do título). */
  dominio: string;
  /** YouTube: id do vídeo; Vimeo: id numérico; Drive: id do arquivo/pasta/documento. */
  id?: string;
  /** Vimeo: o `h` do link privado; Drive: resourcekey. */
  chave?: string;
  drive?: TipoDrive;
  /** YouTube: segundo em que começa (`t=`). */
  inicio?: number;
  /** Endereço para iframe (só hosts fixos: youtube-nocookie, player.vimeo, drive/docs preview). null = sem player. */
  embed: string | null;
  /** Miniatura por endereço conhecido (só YouTube: i.ytimg.com). null = sem miniatura. */
  miniatura: string | null;
};

export type LeituraLink = { ok: true; link: LinkFluxo } | { ok: false; erro: string };

export const NOME_FONTE_LINK: Record<FonteLink, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  drive: "Google Drive",
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  web: "Link",
};

export const LIMITE_URL = 2000;
const ID_YT = /^[A-Za-z0-9_-]{11}$/;
const ID_DRIVE = /^[A-Za-z0-9_-]{10,200}$/;
const CHAVE = /^[A-Za-z0-9_-]{1,200}$/;

const erro = (e: string): LeituraLink => ({ ok: false, erro: e });

function hostPrivado(h: string): boolean {
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

/** "1h2m3s", "90s", "90" → segundos. */
function segundos(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d{1,6}s?$/.test(t)) return Number.parseInt(t, 10);
  const m = t.match(/^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtube(u: URL, host: string, dominio: string): LeituraLink {
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
  else id = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ?? "";
  if (!ID_YT.test(id)) return erro("Não achei o vídeo nesse link do YouTube.");
  const inicio = segundos(u.searchParams.get("t") ?? u.searchParams.get("start"));
  return {
    ok: true,
    link: {
      fonte: "youtube",
      url: `https://www.youtube.com/watch?v=${id}${inicio ? `&t=${inicio}s` : ""}`,
      dominio,
      id,
      ...(inicio ? { inicio } : {}),
      embed: `https://www.youtube-nocookie.com/embed/${id}${inicio ? `?start=${inicio}` : ""}`,
      miniatura: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    },
  };
}

function vimeo(u: URL, host: string, dominio: string): LeituraLink {
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
  if (!/^\d{5,12}$/.test(id)) return erro("Não achei o vídeo nesse link do Vimeo.");
  if (h && !/^[0-9a-f]{6,20}$/i.test(h)) h = "";
  return {
    ok: true,
    link: {
      fonte: "vimeo",
      url: `https://vimeo.com/${id}${h ? `/${h}` : ""}`,
      dominio,
      id,
      ...(h ? { chave: h } : {}),
      embed: `https://player.vimeo.com/video/${id}${h ? `?h=${h}` : ""}`,
      // O Vimeo não tem miniatura num endereço fixo (precisaria buscar a página): a tela mostra o ícone.
      miniatura: null,
    },
  };
}

const DOCS: Record<string, TipoDrive> = { document: "documento", spreadsheets: "planilha", presentation: "apresentacao", forms: "formulario" };

function drive(u: URL, host: string): LeituraLink {
  const chaveBruta = u.searchParams.get("resourcekey");
  const chave = chaveBruta && CHAVE.test(chaveBruta) ? chaveBruta : undefined;
  const rk = chave ? `?resourcekey=${chave}` : "";
  const ok = (tipo: TipoDrive, id: string, url: string, embed: string | null): LeituraLink => ({
    ok: true,
    link: { fonte: "drive", url, dominio: host, id, ...(chave ? { chave } : {}), drive: tipo, embed, miniatura: null },
  });
  if (host === "docs.google.com") {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/(?:e\/)?([^/]+)/);
    if (m && ID_DRIVE.test(m[2])) {
      const tipo = DOCS[m[1]];
      const base = `https://docs.google.com/${m[1]}/d/${m[2]}`;
      if (tipo === "formulario") return ok(tipo, m[2], `${base}/viewform`, null);
      return ok(tipo, m[2], `${base}/edit${rk}`, `${base}/preview${rk}`);
    }
    if (u.pathname.startsWith("/file/d/") || u.searchParams.get("id")) host = "drive.google.com";
    else return erro("Não achei o arquivo nesse link do Google.");
  }
  const pasta = u.pathname.match(/\/folders\/([^/?#]+)/)?.[1];
  if (pasta) {
    if (!ID_DRIVE.test(pasta)) return erro("Não achei a pasta nesse link do Drive.");
    return ok("pasta", pasta, `https://drive.google.com/drive/folders/${pasta}${rk}`, null);
  }
  const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? u.searchParams.get("id") ?? "";
  if (!ID_DRIVE.test(id)) return erro("Não achei o arquivo nesse link do Drive.");
  return ok("arquivo", id, `https://drive.google.com/file/d/${id}/view${rk}`, `https://drive.google.com/file/d/${id}/preview${rk}`);
}

/** Lê o link colado. Aceita https e http (referência), nunca endereço interno, usuário e senha ou outro protocolo. */
export function lerLink(bruto: string): LeituraLink {
  const texto = String(bruto ?? "").trim();
  if (!texto) return erro("Cole um link.");
  if (texto.length > LIMITE_URL) return erro("Esse link é comprido demais.");
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return erro("Isso não parece um link.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return erro("Use um link que comece com https://.");
  if (u.username || u.password) return erro("Tire usuário e senha do link.");
  const hostCompleto = u.hostname.toLowerCase().replace(/\.$/, "");
  if (hostPrivado(hostCompleto.replace(/^\[|\]$/g, ""))) return erro("Use um endereço público.");
  const dominio = hostCompleto.replace(/^www\./, "");
  const host = dominio.replace(/^m\./, "");

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    u.hash = "";
    return youtube(u, host, host === "youtu.be" ? "youtube.com" : host);
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    u.hash = "";
    return vimeo(u, host, "vimeo.com");
  }
  if (host === "drive.google.com" || host === "docs.google.com") {
    u.hash = "";
    return drive(u, host);
  }
  const social: FonteLink | null =
    host === "instagram.com" || host.endsWith(".instagram.com")
      ? "instagram"
      : host === "tiktok.com" || host.endsWith(".tiktok.com")
        ? "tiktok"
        : host === "pin.it" || /^([a-z]{2}\.)?pinterest\.[a-z.]{2,6}$/.test(host)
          ? "pinterest"
          : null;
  if (social) u.hash = "";
  return { ok: true, link: { fonte: social ?? "web", url: u.toString(), dominio, embed: null, miniatura: null } };
}

export type ReferenciaMaestro = { tipo: "roteiro"; id: string } | { tipo: "card"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O link é de um roteiro (`/app/criacao/roteiros/<id>`) ou card (`/app/quadro?card=<id>`) deste Maestro? `origens` =
 * as origens do site (`origensDoSite()`); link de outro site nunca vira referência.
 */
export function referenciaDoMaestro(bruto: string, origens: readonly string[]): ReferenciaMaestro | null {
  let u: URL;
  try {
    u = new URL(String(bruto ?? "").trim());
  } catch {
    return null;
  }
  if (!origens.includes(u.origin)) return null;
  const r = u.pathname.match(/^\/app\/criacao\/roteiros\/([^/]+)\/?$/);
  if (r && UUID.test(r[1])) return { tipo: "roteiro", id: r[1].toLowerCase() };
  if (u.pathname.replace(/\/$/, "") === "/app/quadro") {
    const card = u.searchParams.get("card");
    if (card && /^[A-Za-z0-9_-]{4,64}$/.test(card)) return { tipo: "card", id: card };
  }
  return null;
}

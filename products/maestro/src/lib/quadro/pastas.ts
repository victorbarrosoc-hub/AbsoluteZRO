/**
 * As pastas do Drive no card (titular, 04/11/2026): "Brutos" (o material de câmera) e "Entrega" (onde o final vai).
 * Ficam no próprio card (`dados.pastaBrutos`/`dados.pastaEntrega`, gravadas por `maestro.card_mudar` como qualquer
 * campo), só com o id, um nome curto e o endereço que o Maestro monta a partir do id (nunca o texto colado como veio).
 * Só com o SOBEDESCE no plano (`temArquivos`): a rota do Quadro recusa a gravação sem ele e a ficha não mostra nada.
 *
 * Puro: a ficha, o servidor e os testes usam.
 */

export const CAMPOS_PASTA = ["pastaBrutos", "pastaEntrega"] as const;
export type CampoPasta = (typeof CAMPOS_PASTA)[number];
export const ehCampoPasta = (k: string): k is CampoPasta => (CAMPOS_PASTA as readonly string[]).includes(k);

export type PastaDoCard = { id: string; nome: string; url: string };

/** Como cada uma aparece (o nome padrão quando a pasta chega sem nome). */
export const PASTA: Record<CampoPasta, { rotulo: string; nome: string; titulo: string }> = {
  pastaBrutos: { rotulo: "Brutos", nome: "Brutos", titulo: "Pasta dos brutos" },
  pastaEntrega: { rotulo: "Entrega", nome: "Entrega", titulo: "Pasta de entrega" },
};

/** Id de pasta do Drive (o de um Drive compartilhado tem 19; os comuns, 28 a 44; o mínimo é folga). */
const ID_PASTA = /^[A-Za-z0-9_-]{4,200}$/;
const CHAVE_RECURSO = /^[A-Za-z0-9_-]{1,100}$/;
export const LIMITE_NOME_PASTA = 120;

export type PastaLida = { id: string; chave: string | null };

/**
 * O id da pasta num link do Drive colado. Aceita só `drive.google.com` (com ou sem `https://`, com `www.`):
 * `/drive/folders/<id>`, `/drive/u/<n>/folders/<id>`, `/drive/mobile/folders/<id>`, `/folderview?id=<id>` e
 * `/embeddedfolderview?id=<id>`, com `?usp=…` e outros parâmetros. A `resourcekey` (pasta antiga compartilhada) vai
 * junto. Link de arquivo (`/file/d/…`, `/open?id=` que pode ser arquivo), Docs ou outro site: null.
 */
export function lerLinkDaPasta(texto: unknown): PastaLida | null {
  if (typeof texto !== "string") return null;
  let t = texto.trim();
  if (!t || t.length > 2000 || /\s/.test(t)) return null;
  if (/^(www\.)?drive\.google\.com\//i.test(t)) t = `https://${t}`;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase();
  if (host !== "drive.google.com" && host !== "www.drive.google.com") return null;
  let id: string | null = null;
  const m = /^\/drive(?:\/u\/\d{1,2}|\/mobile)?\/folders\/([^/]+)\/?$/.exec(u.pathname);
  if (m) id = decodeURIComponent(m[1]);
  else if (u.pathname === "/folderview" || u.pathname === "/embeddedfolderview") id = u.searchParams.get("id");
  if (!id || !ID_PASTA.test(id)) return null;
  const rk = u.searchParams.get("resourcekey");
  return { id, chave: rk && CHAVE_RECURSO.test(rk) ? rk : null };
}

/** O endereço que o Maestro guarda e abre: sempre o mesmo formato, montado do id. */
export function enderecoDaPasta(id: string, chave: string | null = null): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}${chave ? `?resourcekey=${encodeURIComponent(chave)}` : ""}`;
}

const nomeLimpo = (v: unknown): string =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, LIMITE_NOME_PASTA)
    : "";

/**
 * Confere o valor de um campo de pasta (o que a tela manda e o servidor grava). `{ id, nome?, url? }`: com `url`, o id
 * dela precisa ser o mesmo; o endereço guardado é sempre o montado aqui. Sem nome, o padrão do campo. Inválido:
 * undefined (quem chama recusa o pedido inteiro). Vazio/null tira a pasta (tratado em `valorDoCampo`).
 */
export function lerPastaDoCard(campo: CampoPasta, v: unknown): PastaDoCard | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID_PASTA.test(o.id)) return undefined;
  let chave: string | null = null;
  if (o.url !== undefined && o.url !== null) {
    const lida = lerLinkDaPasta(o.url);
    if (!lida || lida.id !== o.id) return undefined;
    chave = lida.chave;
  }
  if (o.nome !== undefined && o.nome !== null && typeof o.nome !== "string") return undefined;
  return { id: o.id, nome: nomeLimpo(o.nome) || PASTA[campo].nome, url: enderecoDaPasta(o.id, chave) };
}

/** A pasta a partir do link colado (a tela grava isto). */
export function pastaDoLink(campo: CampoPasta, texto: string, nome?: string | null): PastaDoCard | null {
  const lida = lerLinkDaPasta(texto);
  if (!lida) return null;
  return { id: lida.id, nome: nomeLimpo(nome) || PASTA[campo].nome, url: enderecoDaPasta(lida.id, lida.chave) };
}

/**
 * As subpastas que a estrutura do projeto cria (`drive.pasta.criar` do SOBEDESCE: 01 Briefing, 02 Bruto, 03 Edição,
 * 04 Revisão, 05 Entregas). "Bruto(s)" e "Entrega(s)", com ou sem o número.
 */
const SUBPASTA: Record<CampoPasta, RegExp> = {
  pastaBrutos: /^(0?2\s*[-·.]?\s*)?brutos?$/i,
  pastaEntrega: /^(0?5\s*[-·.]?\s*)?entregas?$/i,
};

export type SugestaoDePastas = Partial<Record<CampoPasta, PastaDoCard>>;

/** Das pastas dentro da pasta do projeto, as que servem de Brutos e de Entrega (a primeira de cada). */
export function sugestaoDasSubpastas(itens: readonly { id?: unknown; nome?: unknown; pasta?: unknown }[]): SugestaoDePastas {
  const out: SugestaoDePastas = {};
  for (const campo of CAMPOS_PASTA) {
    const achou = itens.find((i) => i?.pasta === true && typeof i.id === "string" && ID_PASTA.test(i.id) && SUBPASTA[campo].test(nomeLimpo(i.nome)));
    if (achou) out[campo] = { id: achou.id as string, nome: nomeLimpo(achou.nome), url: enderecoDaPasta(achou.id as string) };
  }
  return out;
}

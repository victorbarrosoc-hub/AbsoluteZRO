/**
 * Exportar e compartilhar o Fluxo (plano da Criação §6.2, fase F6), a parte pura: a tela, o servidor e os testes usam.
 *
 * Decisão do titular (29/10/2026): o fluxo é privado. "Copiar para IA", JSON, PDF e o pacote .zip funcionam sem link.
 * O link (`/f/<token>`) só existe quando administração ou gestão cria: 7 dias por padrão (1 a 30), revogável, PIN
 * opcional, fora dos buscadores. Imagem só leva endereço pelo token de um link vivo, e só quando a pessoa pede
 * (`linkParaIa`: o mais novo sem PIN, porque a IA não digita PIN).
 */
import type { ImagemNo, NoFluxo } from "./modelo";

export const DIAS_LINK = { padrao: 7, min: 1, max: 30 } as const;
/** As validades que a tela oferece (o servidor aceita qualquer número inteiro de 1 a 30). */
export const OPCOES_DIAS = [1, 7, 30] as const;
/** Links vivos por fluxo (o banco confere de novo, com trava). */
export const LINKS_POR_FLUXO = 10;
export const PIN_LINK = /^\d{4,8}$/;
/** Token do link: 32 bytes aleatórios em base64url. */
export const TOKEN_FLUXO = /^[A-Za-z0-9_-]{43}$/;
export const ehTokenFluxo = (t: unknown): t is string => typeof t === "string" && TOKEN_FLUXO.test(t);

/** O link como a equipe vê (só administração e gestão): o token aberto só para copiar. */
export type LinkDoFluxo = {
  id: string;
  /** Endereço inteiro (`<site>/f/<token>`); null se a cópia cifrada não abre (chave trocada). */
  url: string | null;
  token: string | null;
  expira: string;
  temPin: boolean;
  visitas: number;
  vistoEm: string | null;
  criadoEm: string;
};

/** Dias de validade: inteiro de 1 a 30; vazio = 7. null = inválido. */
export function diasDoLink(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return DIAS_LINK.padrao;
  const n = typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= DIAS_LINK.min && n <= DIAS_LINK.max ? n : null;
}

/** PIN opcional: vazio = sem PIN; senão 4 a 8 dígitos. undefined = inválido. */
export function pinDoLink(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const p = v.trim();
  if (!p) return null;
  return PIN_LINK.test(p) ? p : undefined;
}

export const enderecoDoLink = (origem: string, token: string) => `${origem.replace(/\/+$/, "")}/f/${token}`;

/** A imagem pelo token (`/f/<token>/i/<id>/<sha>.webp`): acabou o link, acabou a imagem. */
export const caminhoImagemPeloLink = (token: string, img: Pick<ImagemNo, "id" | "sha256">, mini = false) =>
  `/f/${token}/i/${img.id}/${img.sha256}.webp${mini ? "?mini=1" : ""}`;

export const urlImagemPeloLink =
  (origem: string, token: string) =>
  (img: ImagemNo): string =>
    `${origem.replace(/\/+$/, "")}${caminhoImagemPeloLink(token, img)}`;

/** Vivo = não vencido (a lista do servidor já tira os revogados). */
export const linkVivo = (l: Pick<LinkDoFluxo, "expira">, agora: Date) => new Date(l.expira).getTime() > agora.getTime();

/** O link que pode levar as imagens para uma IA: o mais novo vivo, sem PIN e com o token aberto. */
export function linkParaIa(links: readonly LinkDoFluxo[], agora: Date): LinkDoFluxo | null {
  return [...links].filter((l) => linkVivo(l, agora) && !l.temPin && l.token).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0] ?? null;
}

const DIA_MS = 86_400_000;
const FUSO = "America/Sao_Paulo";
const diaNoFuso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d);

/** "Vence hoje", "Vence amanhã", "Vence em 5 dias" ou "Vencido" (pelo dia no fuso do Brasil). */
export function vencimento(expira: string, agora: Date): string {
  const fim = new Date(expira);
  if (fim.getTime() <= agora.getTime()) return "Vencido";
  const dias = Math.round((Date.parse(diaNoFuso(fim)) - Date.parse(diaNoFuso(agora))) / DIA_MS);
  if (dias <= 0) return "Vence hoje";
  if (dias === 1) return "Vence amanhã";
  return `Vence em ${dias} dias`;
}

/** "Fim de tarde, contraluz" → "fim-de-tarde-contraluz" (sem acento, até 48 letras). */
export function slug(t: string, padrao = "fluxo"): string {
  const s = t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || padrao;
}

/**
 * O nome de cada imagem dentro do pacote, na ordem de leitura do fluxo: `imagens/01-fim-de-tarde.webp`. Uma imagem
 * usada por dois nós sai uma vez (pelo id). Devolve o caminho por id da imagem.
 */
export function nomesDasImagens(ordem: readonly NoFluxo[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of ordem) {
    if (n.tipo !== "imagem" || !n.imagem || out.has(n.imagem.id)) continue;
    const leg = (n.dados as { legenda?: string }).legenda ?? "";
    out.set(n.imagem.id, `imagens/${String(out.size + 1).padStart(2, "0")}-${slug(leg, "imagem")}.webp`);
  }
  return out;
}

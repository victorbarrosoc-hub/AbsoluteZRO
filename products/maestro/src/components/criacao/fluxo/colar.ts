/**
 * Colar no Fluxo (plano da Criação §6.1; ⌘V é o gesto principal), puro: decide o que o texto colado vira e confere a
 * imagem antes de subir. O servidor confere tudo de novo (`lerOps`, `prepararImagem`).
 *
 *   * um endereço do próprio Maestro (roteiro ou card) → nó de referência viva;
 *   * um endereço (YouTube, Vimeo, Drive, redes ou qualquer site público) → nó de link (sem buscar a página);
 *   * qualquer outro texto → notas, uma por parágrafo (`notasDoTexto`).
 */
import { lerLink, referenciaDoMaestro, type LinkFluxo, type ReferenciaMaestro } from "@/lib/criacao/fluxo/endereco";
import { TAMANHO_PADRAO } from "@/lib/criacao/fluxo/modelo";

/** O mesmo `IMAGEM_ENTRADA_MAX` de imagem.ts (lá tem sharp, que não vai ao navegador; o teste confere que batem). */
export const IMAGEM_ENTRADA_MAX = 12 * 1024 * 1024;

export type Colado = { tipo: "ref"; ref: ReferenciaMaestro } | { tipo: "link"; link: LinkFluxo } | { tipo: "texto"; texto: string } | { tipo: "nada" };

/** Parece um endereço só (sem espaço no meio, com domínio ou protocolo)? */
const ehEndereco = (t: string) => !/\s/.test(t) && (/^https?:\/\//i.test(t) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t));

export function oQueColar(bruto: string, origens: readonly string[]): Colado {
  const t = String(bruto ?? "").trim();
  if (!t) return { tipo: "nada" };
  if (ehEndereco(t)) {
    const ref = referenciaDoMaestro(t, origens);
    if (ref) return { tipo: "ref", ref };
    const l = lerLink(t);
    if (l.ok) return { tipo: "link", link: l.link };
  }
  return { tipo: "texto", texto: t };
}

export const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp"] as const;

/** A imagem pode subir? (o tipo do arquivo e o tamanho; os bytes o servidor confere). */
export function conferirImagem(a: { type: string; size: number }): { ok: true } | { ok: false; mensagem: string } {
  if (!TIPOS_IMAGEM.includes(a.type as (typeof TIPOS_IMAGEM)[number])) return { ok: false, mensagem: "Use PNG, JPEG ou WebP." };
  if (a.size > IMAGEM_ENTRADA_MAX) return { ok: false, mensagem: "Imagem grande demais (até 12 MB)." };
  if (a.size <= 0) return { ok: false, mensagem: "Cole ou escolha uma imagem." };
  return { ok: true };
}

/** O tamanho do nó de imagem: 240 de largura (a foto em pé, 200), a altura pela proporção, mais a legenda. */
export function tamanhoDaImagem(largura: number, altura: number): { w: number; h: number } {
  const p = TAMANHO_PADRAO.imagem;
  if (!(largura > 0 && altura > 0)) return p;
  const w = altura > largura ? 200 : p.w;
  const foto = Math.round(Math.min(Math.max((w * altura) / largura, 80), 360));
  return { w, h: foto + LEGENDA_PX };
}

/** A faixa da legenda embaixo da imagem (px no mundo). */
export const LEGENDA_PX = 34;

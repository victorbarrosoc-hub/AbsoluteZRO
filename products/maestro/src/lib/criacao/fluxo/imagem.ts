/**
 * Imagem colada no Fluxo (plano da Criação §6.3), no molde do logo da marca (`src/lib/marca/logo.ts`, de onde vem a
 * conferência pelos bytes): só PNG, JPEG ou WebP conferidos pelos primeiros bytes (SVG nunca; HEIC e GIF não: o
 * Safari do iPhone já entrega JPEG ao colar ou escolher foto). O sharp decodifica, gira pela orientação, tira TODOS os
 * metadados (EXIF, GPS, XMP; o perfil de cor vira sRGB) e reencoda em WebP: até 2048 px e 400 KB, mais a miniatura
 * de até 320 px e 40 KB. O que vai ao banco é sempre essa versão limpa.
 * Sem "server-only": os testes chamam direto.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { tipoPelosBytes } from "@/lib/marca/logo";

export const IMAGEM_ENTRADA_MAX = 12 * 1024 * 1024;
export const IMAGEM_SAIDA_MAX = 400 * 1024;
export const MINI_SAIDA_MAX = 40 * 1024;
export const IMAGEM_LADO_MAX = 2048;
export const MINI_LADO = 320;
const PIXELS_MAX = 50_000_000;

/** Degraus (lado, qualidade) até caber; a primeira que couber vale. */
const DEGRAUS: readonly (readonly [number, number])[] = [
  [IMAGEM_LADO_MAX, 82],
  [IMAGEM_LADO_MAX, 70],
  [1600, 70],
  [1280, 68],
  [1024, 65],
  [800, 60],
];
const DEGRAUS_MINI: readonly (readonly [number, number])[] = [
  [MINI_LADO, 62],
  [MINI_LADO, 45],
  [240, 45],
  [160, 40],
];

export type ImagemPronta = {
  webp: Buffer;
  sha256: string;
  largura: number;
  altura: number;
  mini: Buffer;
  miniLargura: number;
  miniAltura: number;
};
export type ErroImagem = "vazio" | "grande" | "tipo" | "invalido";
export type ResultadoImagem = ({ ok: true } & ImagemPronta) | { ok: false; erro: ErroImagem; mensagem: string };

async function caber(bytes: Buffer, degraus: readonly (readonly [number, number])[], max: number) {
  for (const [lado, qualidade] of degraus) {
    const { data, info } = await sharp(bytes, { limitInputPixels: PIXELS_MAX, failOn: "error", pages: 1 })
      .rotate()
      .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
      .webp({ quality: qualidade, alphaQuality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= max) return { data, largura: info.width, altura: info.height };
  }
  return null;
}

export async function prepararImagem(entrada: Uint8Array | ArrayBuffer): Promise<ResultadoImagem> {
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  if (!bytes.length) return { ok: false, erro: "vazio", mensagem: "Cole ou escolha uma imagem." };
  if (bytes.length > IMAGEM_ENTRADA_MAX) return { ok: false, erro: "grande", mensagem: "Imagem grande demais (até 12 MB)." };
  const tipo = tipoPelosBytes(bytes);
  if (!tipo) return { ok: false, erro: "tipo", mensagem: "Use PNG, JPEG ou WebP." };
  const buf = Buffer.from(bytes);
  try {
    const meta = await sharp(buf, { limitInputPixels: PIXELS_MAX, failOn: "error", pages: 1 }).metadata();
    if (meta.format !== tipo) return { ok: false, erro: "invalido", mensagem: "Não consegui ler essa imagem." };
    const grande = await caber(buf, DEGRAUS, IMAGEM_SAIDA_MAX);
    if (!grande) return { ok: false, erro: "grande", mensagem: "Imagem pesada demais mesmo reduzida." };
    const mini = await caber(grande.data, DEGRAUS_MINI, MINI_SAIDA_MAX);
    if (!mini) return { ok: false, erro: "grande", mensagem: "Imagem pesada demais mesmo reduzida." };
    return {
      ok: true,
      webp: grande.data,
      sha256: createHash("sha256").update(grande.data).digest("hex"),
      largura: grande.largura,
      altura: grande.altura,
      mini: mini.data,
      miniLargura: mini.largura,
      miniAltura: mini.altura,
    };
  } catch {
    return { ok: false, erro: "invalido", mensagem: "Não consegui ler essa imagem." };
  }
}

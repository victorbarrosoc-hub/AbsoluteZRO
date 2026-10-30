/**
 * A capa do card (drizzle/0035), no molde da imagem do Fluxo (`src/lib/criacao/fluxo/imagem.ts`) e do logo: só PNG,
 * JPEG ou WebP conferidos pelos primeiros bytes (SVG nunca). O sharp decodifica, gira pela orientação, tira TODOS os
 * metadados (EXIF, GPS, XMP) e reencoda em WebP de até 960 px e 160 KB: o card mostra a capa a no máximo ~360 px de
 * largura (o dobro na tela retina). O que vai ao banco é sempre essa versão limpa. Vídeo vira quadro no navegador
 * (`components/quadro/capa.tsx`): o servidor só recebe a imagem.
 * Sem "server-only": os testes chamam direto.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { tipoPelosBytes } from "@/lib/marca/logo";
import { CAPA_ENTRADA_MAX } from "./capa-regras";

export { CAPA_ENTRADA_MAX, COTA_CAPAS } from "./capa-regras";
export const CAPA_LADO = 960;
export const CAPA_SAIDA_MAX = 160 * 1024;
const PIXELS_MAX = 50_000_000;
const DEGRAUS: readonly (readonly [number, number])[] = [
  [CAPA_LADO, 78],
  [CAPA_LADO, 66],
  [800, 62],
  [640, 58],
  [480, 52],
];

export type CapaPronta = { webp: Buffer; sha256: string; largura: number; altura: number };
export type ResultadoCapa = ({ ok: true } & CapaPronta) | { ok: false; erro: "vazio" | "grande" | "tipo" | "invalido"; mensagem: string };

export async function prepararCapa(entrada: Uint8Array | ArrayBuffer): Promise<ResultadoCapa> {
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  if (!bytes.length) return { ok: false, erro: "vazio", mensagem: "Escolha uma imagem." };
  if (bytes.length > CAPA_ENTRADA_MAX) return { ok: false, erro: "grande", mensagem: "Imagem grande demais (até 12 MB)." };
  const tipo = tipoPelosBytes(bytes);
  if (!tipo) return { ok: false, erro: "tipo", mensagem: "Use PNG, JPEG ou WebP." };
  const buf = Buffer.from(bytes);
  try {
    const meta = await sharp(buf, { limitInputPixels: PIXELS_MAX, failOn: "error", pages: 1 }).metadata();
    if (meta.format !== tipo) return { ok: false, erro: "invalido", mensagem: "Não consegui ler essa imagem." };
    for (const [lado, qualidade] of DEGRAUS) {
      const { data, info } = await sharp(buf, { limitInputPixels: PIXELS_MAX, failOn: "error", pages: 1 })
        .rotate()
        .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
        .webp({ quality: qualidade, alphaQuality: 90, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= CAPA_SAIDA_MAX)
        return { ok: true, webp: data, sha256: createHash("sha256").update(data).digest("hex"), largura: info.width, altura: info.height };
    }
    return { ok: false, erro: "grande", mensagem: "Imagem pesada demais mesmo reduzida." };
  } catch {
    return { ok: false, erro: "invalido", mensagem: "Não consegui ler essa imagem." };
  }
}

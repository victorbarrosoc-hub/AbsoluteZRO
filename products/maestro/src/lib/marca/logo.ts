/**
 * O logo da produtora (plano v2 §8): só PNG, JPEG ou WebP, conferidos pelos bytes (a extensão e o tipo que o navegador
 * diz não valem). SVG nunca (é código). O servidor decodifica com o sharp, gira pela orientação, tira metadados,
 * cabe em 1024 px e reencoda em WebP; o que vai ao banco é sempre essa versão limpa, até 512 KB.
 * Sem "server-only": os testes chamam direto.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";

export const LOGO_ENTRADA_MAX = 4 * 1024 * 1024;
export const LOGO_SAIDA_MAX = 512 * 1024;
const LADO_MAX = 1024;
const PIXELS_MAX = 40_000_000;

export type TipoImagem = "png" | "jpeg" | "webp";

/** O tipo pelos primeiros bytes; null para todo o resto (SVG, GIF, HEIC, PDF, texto…). */
export function tipoPelosBytes(b: Uint8Array): TipoImagem | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") return "webp";
  return null;
}

export type LogoPronto = { bytes: Buffer; mime: "image/webp"; sha256: string; largura: number; altura: number };
export type ResultadoLogo = ({ ok: true } & LogoPronto) | { ok: false; erro: "vazio" | "grande" | "tipo" | "invalido"; mensagem: string };

export async function prepararLogo(entrada: Uint8Array | ArrayBuffer): Promise<ResultadoLogo> {
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  if (!bytes.length) return { ok: false, erro: "vazio", mensagem: "Escolha a imagem do logo." };
  if (bytes.length > LOGO_ENTRADA_MAX) return { ok: false, erro: "grande", mensagem: "Imagem grande demais (até 4 MB)." };
  const tipo = tipoPelosBytes(bytes);
  if (!tipo) return { ok: false, erro: "tipo", mensagem: "Use PNG, JPEG ou WebP. SVG não entra." };
  try {
    const base = sharp(Buffer.from(bytes), { limitInputPixels: PIXELS_MAX, failOn: "error", pages: 1 });
    const meta = await base.metadata();
    if (meta.format !== tipo) return { ok: false, erro: "invalido", mensagem: "Não consegui ler essa imagem." };
    for (const [lado, qualidade] of [
      [LADO_MAX, 90],
      [640, 82],
      [320, 75],
    ] as const) {
      const { data, info } = await sharp(Buffer.from(bytes), { limitInputPixels: PIXELS_MAX, failOn: "error", pages: 1 })
        .rotate()
        .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
        .webp({ quality: qualidade, alphaQuality: 100, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= LOGO_SAIDA_MAX)
        return {
          ok: true,
          bytes: data,
          mime: "image/webp",
          sha256: createHash("sha256").update(data).digest("hex"),
          largura: info.width,
          altura: info.height,
        };
    }
    return { ok: false, erro: "grande", mensagem: "Imagem pesada demais mesmo reduzida. Tente um PNG mais simples." };
  } catch {
    return { ok: false, erro: "invalido", mensagem: "Não consegui ler essa imagem." };
  }
}

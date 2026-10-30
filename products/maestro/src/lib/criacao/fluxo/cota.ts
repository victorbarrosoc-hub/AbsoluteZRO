/**
 * Cota das imagens coladas no Fluxo (decisão do titular, 29/10/2026: imagens no banco do Maestro, em WebP, com cota
 * por produtora). O banco confere de verdade no insert (`maestro.fluxo_imagens_guarda`, com trava por organização);
 * estas contas são as mesmas, para a tela dizer antes e a mensagem de erro ser clara. Os números batem com
 * `maestro.fluxo_cota()` em drizzle/0031_fluxos.sql (o teste confere): mudou lá, mude aqui.
 * Puro: roda na tela, no servidor e nos testes.
 */

export const COTA = {
  /** Bytes de imagem por produtora (WebP + miniatura). Revisar conforme o plano do Supabase `AbsoluteZRO`. */
  bytesPorOrganizacao: 200 * 1024 * 1024,
  /** Imagens por fluxo. */
  imagensPorFluxo: 300,
} as const;

export type Uso = { usado: number; limite: number; imagens: number; imagensPorFluxo: number };

/** "1,5 MB", "820 KB", "12 B" (base 1024, uma casa, vírgula). */
export function formatarBytes(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 1024) return `${v} B`;
  const un = ["KB", "MB", "GB"] as const;
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < un.length - 1) {
    x /= 1024;
    i++;
  }
  const casas = x >= 100 || Number.isInteger(x) ? 0 : 1;
  return `${x.toFixed(casas).replace(".", ",")} ${un[i]}`;
}

/** Quanto da cota já foi (0 a 1, arredondado para baixo em 1%). */
export function fracaoUsada(uso: Pick<Uso, "usado" | "limite">): number {
  if (uso.limite <= 0) return 1;
  return Math.min(1, Math.floor((uso.usado / uso.limite) * 100) / 100);
}

export type Conferencia = { ok: true; sobra: number } | { ok: false; erro: "cota" | "cota_fluxo"; mensagem: string };

/**
 * Cabe mais uma imagem de `novo` bytes? `noFluxo` = quantas o fluxo já tem. Mesma regra do banco: passa quando
 * usado + novo ≤ limite e o fluxo tem menos que o máximo.
 */
export function cabeNaCota(e: { usado: number; novo: number; limite?: number; noFluxo: number; porFluxo?: number }): Conferencia {
  const limite = e.limite ?? COTA.bytesPorOrganizacao;
  const porFluxo = e.porFluxo ?? COTA.imagensPorFluxo;
  if (e.usado + e.novo > limite)
    return {
      ok: false,
      erro: "cota",
      mensagem: `As imagens da produtora chegaram ao limite (${formatarBytes(e.usado)} de ${formatarBytes(limite)}). Apague imagens de fluxos que não usa mais.`,
    };
  if (e.noFluxo >= porFluxo) return { ok: false, erro: "cota_fluxo", mensagem: `Este fluxo já tem ${porFluxo} imagens, o máximo.` };
  return { ok: true, sobra: limite - e.usado - e.novo };
}

/** A mensagem do erro do banco (`detail` = "usado/limite" ou "n/max"). */
export function mensagemDaCota(erro: "cota" | "cota_fluxo", detalhe: string | null | undefined): string {
  const [a, b] = String(detalhe ?? "")
    .split("/")
    .map((x) => Number.parseInt(x, 10));
  if (erro === "cota_fluxo") {
    const max = Number.isFinite(b) ? b : COTA.imagensPorFluxo;
    return `Este fluxo já tem ${max} imagens, o máximo.`;
  }
  const limite = Number.isFinite(b) ? b : COTA.bytesPorOrganizacao;
  const usado = Number.isFinite(a) ? a : limite;
  return `As imagens da produtora chegaram ao limite (${formatarBytes(usado)} de ${formatarBytes(limite)}). Apague imagens de fluxos que não usa mais.`;
}

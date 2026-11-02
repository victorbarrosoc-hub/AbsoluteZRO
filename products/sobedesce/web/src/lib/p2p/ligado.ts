/**
 * Chave do "enviar entre aparelhos pelo Wi-Fi" (titular, 02/11/2026: desligado até a fase 3, por custo da Vercel).
 * Desligado (padrão), /api/p2p/espera, /aparelhos e /sinal respondem na hora, sem sessão nem banco, com 503 e
 * `Retry-After`: os apps antigos recuam (computador até 60 s, celular até 30 s, pelo próprio recuo de falha) e os
 * novos leem `erro: "wifi_desligado"`, escondem o Wi-Fi e param. Religar: P2P_WIFI_LIGADO=1 no projeto da Vercel.
 */
import { json } from "@/lib/http";

export const ERRO_WIFI_DESLIGADO = "wifi_desligado";
export const PROXIMA_DESLIGADO_MS = 120_000;

export function p2pWifiLigado(env: Record<string, string | undefined> = process.env): boolean {
  return ["1", "true", "on", "sim", "ligado"].includes((env.P2P_WIFI_LIGADO ?? "").trim().toLowerCase());
}

export function respostaWifiDesligado(): Response {
  return json(
    { erro: ERRO_WIFI_DESLIGADO, mensagem: "O envio entre aparelhos pelo Wi-Fi está desligado por enquanto.", proxima_em: PROXIMA_DESLIGADO_MS },
    503,
    { "Retry-After": String(PROXIMA_DESLIGADO_MS / 1000) },
  );
}

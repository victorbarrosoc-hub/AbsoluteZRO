/**
 * O Wi-Fi celular ↔ computador/celular foi descontinuado (titular, 02/11/2026: cancelado por custo da Vercel). Fica só
 * "Entre computadores" (/api/lan/*). As rotas /api/p2p/* continuam existindo só para os apps antigos: respondem na
 * hora, sem sessão nem banco, com 503 e `Retry-After`. O app antigo trata como falha e recua pelo próprio recuo
 * (celular até 30 s, computador até 60 s), sem laço apertado e sem sair da conta. As tabelas p2p_aparelhos e
 * p2p_sinais ficam no banco, sem uso.
 */
import { json } from "@/lib/http";

export const ERRO_P2P = "p2p_descontinuado";
export const PROXIMA_P2P_MS = 120_000;

export function respostaP2pDescontinuado(): Response {
  return json(
    { erro: ERRO_P2P, mensagem: "O envio entre celular e computador pelo Wi-Fi foi descontinuado.", proxima_em: PROXIMA_P2P_MS },
    503,
    { "Retry-After": String(PROXIMA_P2P_MS / 1000) },
  );
}

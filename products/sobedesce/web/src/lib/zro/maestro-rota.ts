/**
 * O caminho comum das ações do Maestro (lib/zro/drive-do-maestro.ts): o mesmo pedido do HUB que a Z usa
 * (lib/zro/pedido-rota.ts: aud, jti de uso único, ação certa, SOBEDESCE liberado), com limite próprio por pessoa e
 * uma linha em `auditoria_zro` por pedido atendido (a ação, o alvo, o resultado e o jti; nunca nome de arquivo ou token).
 */
import { db, schema } from "@/lib/db";
import { REGRAS } from "@/lib/auth/limite";
import { erro } from "@/lib/http";
import { atenderPedidoZro, respostaDaFalha } from "./pedido-rota";
import type { FalhaDrive } from "./drive-da-z";

const MENSAGENS: Record<string, [number, string]> = {
  nao_achou: [404, "Não achei isso no Drive (ou a conta conectada não tem acesso)."],
  sem_miniatura: [404, "O Google não tem miniatura deste arquivo."],
  conta_desconhecida: [404, "Essa conta Google não está conectada no SOBEDESCE."],
  sem_permissao: [409, "A conta Google conectada não pode compartilhar este arquivo."],
  nao_e_publico: [400, "Essa permissão não é a de “qualquer pessoa com o link”; nada foi mudado."],
};

/** Falha do Drive ou da ação → resposta `{ erro, mensagem }`. */
export function respostaDoMaestro(f: FalhaDrive | { ok: false; erro: string }): Response {
  if (f.erro === "sem_drive" || f.erro === "reconectar_drive" || f.erro === "drive_indisponivel") return respostaDaFalha(f as FalhaDrive);
  const [status, mensagem] = MENSAGENS[f.erro] ?? [502, "O Google Drive não respondeu. Tente de novo em instantes."];
  return erro(status, f.erro, mensagem);
}

export async function atenderPedidoDoMaestro(
  req: Request,
  acao: string,
  fazer: (usuarioId: string, corpo: Record<string, unknown>) => Promise<{ resposta: Response; alvo?: string | null }>,
  opcoes: { token?: boolean; exigirProduto?: boolean } = {},
): Promise<Response> {
  return atenderPedidoZro(
    req,
    acao,
    async (usuarioId, corpo, pedido) => {
      const { resposta, alvo } = await fazer(usuarioId, corpo);
      await db
        .insert(schema.auditoriaZro)
        .values({ usuarioId, zroSub: pedido.sub, acao, alvo: alvo ?? null, resultado: String(resposta.status), jti: pedido.jti })
        .catch(() => undefined); // auditoria que falha não desfaz o que o Drive já fez
      return resposta;
    },
    {
      limite: opcoes.token ? { prefixo: "drive-token-maestro", regra: REGRAS.driveTokenMaestro } : { prefixo: "drive-maestro", regra: REGRAS.driveMaestro },
      exigirProduto: opcoes.exigirProduto,
    },
  );
}

const ID = /^[A-Za-z0-9_-]{1,200}$/;
/** Id do Drive do corpo, ou null. */
export const idDoCorpo = (v: unknown): string | null => (typeof v === "string" && ID.test(v) ? v : null);

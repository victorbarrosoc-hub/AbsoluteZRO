import { semAcesso, usuarioDaRequisicao, SEM_SESSAO } from "@/lib/auth/requisicao";
import { listarContas } from "@/lib/google/contas";
import { json } from "@/lib/http";

/** Drives da conta (sem token nenhum). */
export async function GET(req: Request) {
  const atual = await usuarioDaRequisicao(req);
  if (!atual) return SEM_SESSAO();
  const bloqueio = semAcesso(atual);
  if (bloqueio) return bloqueio;
  return json({ contas: await listarContas(atual.usuario.id) });
}

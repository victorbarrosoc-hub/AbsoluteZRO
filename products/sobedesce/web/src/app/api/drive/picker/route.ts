import { semAcesso, usuarioDaRequisicao, SEM_SESSAO } from "@/lib/auth/requisicao";
import { configDoPicker } from "@/lib/google/config";
import { json } from "@/lib/http";

/**
 * O que o "Escolher do Drive" (Google Picker) do celular precisa: o client ID, a chave do Picker e o App ID (número do
 * projeto Google SOBEDESCE). Tudo público por natureza (a chave é restrita por referenciador), mas só sai para quem
 * está na conta. Sem as variáveis: `{ pronto: false }` e o botão avisa.
 */
export async function GET(req: Request) {
  const atual = await usuarioDaRequisicao(req);
  if (!atual) return SEM_SESSAO();
  const bloqueio = semAcesso(atual);
  if (bloqueio) return bloqueio;
  const c = configDoPicker();
  return json(c ? { pronto: true, ...c } : { pronto: false });
}

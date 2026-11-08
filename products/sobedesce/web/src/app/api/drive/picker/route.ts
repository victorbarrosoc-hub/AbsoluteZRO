import { semAcesso, usuarioDaRequisicao, SEM_SESSAO } from "@/lib/auth/requisicao";
import { diagnosticoPicker } from "@/lib/google/config";
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
  const d = diagnosticoPicker();
  // Sem valor nenhum no log nem na resposta: só qual variável falhou (aparece também no /admin).
  if (d.problemas.length) console.warn(`[picker] configuração: ${d.problemas.join(", ")}${d.appIdDoClientId ? " (App ID tirado do client ID)" : ""}`);
  return json(d.config ? { pronto: true, ...d.config } : { pronto: false, problemas: d.problemas });
}

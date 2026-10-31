import { MENSAGENS } from "@/lib/api/mensagens";
import { exigirNaApi } from "@/lib/auth/requisicao";
import { ErroConta, modoDaConta, tokenDeAcesso } from "@/lib/google/contas";
import { erro, json, lerJson } from "@/lib/http";

const STATUS: Record<ErroConta["codigo"], number> = { nao_encontrada: 404, reconectar: 409, google: 502, sem_config: 503 };

/**
 * O app de computador (até a versão de hoje) não sabe do modo Arquivos escolhidos: com um token só de `drive.file`, o
 * Comparar, o Backup e a navegação dele veriam pastas pela metade e diriam "falta subir" do que só está invisível.
 * Enquanto ele não aprende (precisa de versão nova do desktop), o servidor não entrega esse token a ele.
 */
const COMPUTADOR_SO_COM_ACESSO_TOTAL = true;

/**
 * Access token de uma conta Google da pessoa: `{ conta, renovar? }` → `{ accessToken, expiraEm, email, modo }`.
 * `modo`: "total" (Drive inteiro) ou "arquivos" (só o que passou pelo SOBEDESCE e o escolhido no Picker).
 * Nunca devolve o refresh token.
 */
export async function POST(req: Request) {
  const atual = await exigirNaApi(req, { mutacao: true });
  if (atual instanceof Response) return atual;
  const corpo = await lerJson(req);
  const conta = corpo?.conta;
  if (typeof conta !== "string" || !conta || conta.length > 64) return erro(400, "entrada", MENSAGENS.entrada);
  try {
    const modo = await modoDaConta(atual.usuario.id, conta);
    if (!modo) throw new ErroConta("nao_encontrada");
    if (modo === "arquivos" && atual.sessao.tipo === "dispositivo" && COMPUTADOR_SO_COM_ACESSO_TOTAL) {
      return erro(403, "precisa_acesso_total", MENSAGENS.precisa_acesso_total);
    }
    const t = await tokenDeAcesso(atual.usuario.id, conta, { renovar: corpo?.renovar === true });
    return json({ accessToken: t.accessToken, expiraEm: t.expiraEm, email: t.email, modo });
  } catch (e) {
    if (e instanceof ErroConta) return erro(STATUS[e.codigo], e.codigo, MENSAGENS[e.codigo]);
    throw e;
  }
}

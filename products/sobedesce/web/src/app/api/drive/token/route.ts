import { MENSAGENS } from "@/lib/api/mensagens";
import { exigirNaApi } from "@/lib/auth/requisicao";
import { CAPACIDADE_MODO_DRIVE, lerCapacidades } from "@/lib/auth/sessao";
import { ErroConta, modoDaConta, tokenDeAcesso } from "@/lib/google/contas";
import { erro, json, lerJson } from "@/lib/http";

const STATUS: Record<ErroConta["codigo"], number> = { nao_encontrada: 404, reconectar: 409, google: 502, sem_config: 503 };

/**
 * O app de computador até a 0.2.0 não sabe do modo Arquivos escolhidos: com um token só de `drive.file`, o Comparar, o
 * tamanho das pastas e a navegação dele veriam pastas pela metade e diriam "falta subir" do que só está invisível. A
 * 0.3.0 diz em todo pedido que entende (x-sobedesce-capacidades: drive-arquivos, src/config.js do app) e aplica as
 * mesmas regras do celular (src/google/modo-drive.js). Sem a capacidade, o servidor não entrega esse token ao
 * computador. Vale o cabeçalho deste pedido (não o número do build nem o que a sessão disse antes): o app que voltar
 * para uma versão antiga deixa de receber na hora. Mentir não abre nada a mais: é o mesmo token que o celular recebe.
 */
function computadorEntendeModo(req: Request): boolean {
  return lerCapacidades(req.headers.get("x-sobedesce-capacidades")).includes(CAPACIDADE_MODO_DRIVE);
}

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
    if (modo === "arquivos" && atual.sessao.tipo === "dispositivo" && !computadorEntendeModo(req)) {
      return erro(403, "precisa_acesso_total", MENSAGENS.precisa_acesso_total);
    }
    const t = await tokenDeAcesso(atual.usuario.id, conta, { renovar: corpo?.renovar === true });
    return json({ accessToken: t.accessToken, expiraEm: t.expiraEm, email: t.email, modo });
  } catch (e) {
    if (e instanceof ErroConta) return erro(STATUS[e.codigo], e.codigo, MENSAGENS[e.codigo]);
    throw e;
  }
}

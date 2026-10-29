import { exigirAcesso } from "@/lib/auth/requisicao";
import { erro, json, lerJson, origemConfere } from "@/lib/http";
import { origensDoSite } from "@/lib/site";
import { tokenParaAba } from "@/lib/sobedesce/arquivos";

/**
 * POST /api/arquivos/token `{ conta? }`: o token curto do Google Drive da própria pessoa, pelo SOBEDESCE (ponte do HUB,
 * `drive.token`), para a aba Arquivos e o player da revisão buscarem direto no Google. Vai só para a aba que pediu:
 * nada é guardado, nada vai para log. Sem sessão 401; sem acesso ao Maestro ou sem o SOBEDESCE no plano 403.
 */
export async function POST(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem recusado.");
  const corpo = (await lerJson(req, 1024)) ?? {};
  const r = await tokenParaAba(s, typeof corpo.conta === "string" ? corpo.conta : null);
  if (!r.ok) return erro(r.status, r.erro, r.mensagem);
  return json(r.dados, 200, { "Referrer-Policy": "no-referrer" });
}

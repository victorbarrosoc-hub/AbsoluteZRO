/**
 * O caminho comum das rotas que a Absolute ZRO chama em nome de uma pessoa (/api/zro/drive/*): confere o JWT do HUB
 * (lib/zro/pedido.ts), lê o corpo, acha a conta pelo vínculo contas_zro, exige o SOBEDESCE liberado e aplica o
 * limite por pessoa. Erros saem no formato do site ({ erro, mensagem }), com código que o HUB entende.
 */
import { eq } from "drizzle-orm";
import { dentroDoLimite, MENSAGEM_LIMITE, REGRAS, registrarTentativa } from "@/lib/auth/limite";
import { db, schema } from "@/lib/db";
import { erro, lerJson } from "@/lib/http";
import { siteUrl } from "@/lib/site";
import { liberadoPelaZro, MENSAGEM_SEM_ACESSO } from "./acesso";
import { zroConfigurado } from "./config";
import type { FalhaDrive } from "./drive-da-z";
import { conferirPedidoZro, PedidoRecusado } from "./pedido";

export async function atenderPedidoZro(
  req: Request,
  acao: string,
  fazer: (usuarioId: string, corpo: Record<string, unknown>) => Promise<Response>,
): Promise<Response> {
  if (!zroConfigurado()) return erro(503, "sem_config", "A Absolute ZRO não está configurada neste SOBEDESCE.");
  let sub: string;
  try {
    sub = (await conferirPedidoZro(req.headers.get("authorization"), acao)).sub;
  } catch (e) {
    if (e instanceof PedidoRecusado) return erro(401, "nao_autorizado", "Pedido sem autorização válida da Absolute ZRO.", { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    return erro(502, "zro_indisponivel", "Não deu para conferir o pedido com a Absolute ZRO agora.");
  }
  const corpo = (await lerJson(req, 4 * 1024)) ?? {};
  const vinculo = await db.query.contasZro.findFirst({ where: eq(schema.contasZro.zroSub, sub) });
  if (!vinculo) return erro(404, "sem_vinculo", `Esta conta Absolute ZRO ainda não entrou no SOBEDESCE. Entre em ${siteUrl()} para ligar.`);
  if (!liberadoPelaZro(vinculo.produtos)) return erro(403, "sem_acesso_zro", MENSAGEM_SEM_ACESSO);
  const chave = `drive-busca-zro:${sub}`;
  if (!(await dentroDoLimite(chave, REGRAS.driveBuscaZro))) return erro(429, "devagar", MENSAGEM_LIMITE, { "Retry-After": "120" });
  await registrarTentativa(chave);
  return fazer(vinculo.usuarioId, corpo);
}

/** A falha do Drive como resposta (409 quando a pessoa resolve no SOBEDESCE, 502 quando é o Google). */
export function respostaDaFalha(f: FalhaDrive): Response {
  const conta = `${siteUrl()}/conta`;
  if (f.erro === "sem_drive") return erro(409, "sem_drive", `Nenhum Google Drive conectado. Conecte em ${conta}`);
  if (f.erro === "reconectar_drive") return erro(409, "reconectar_drive", `O Google pediu para reconectar o Drive. Reconecte em ${conta}`);
  return erro(502, "drive_indisponivel", "O Google Drive não respondeu. Tente de novo em instantes.");
}

/** Texto do corpo, com espaços juntados; null se vazio ou longo demais. */
export function textoDoCorpo(v: unknown, max: number): string | null {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return t && t.length <= max ? t : null;
}

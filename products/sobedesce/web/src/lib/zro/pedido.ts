/**
 * Pedido servidor-a-servidor da Absolute ZRO (27/10/2026): a Z, que roda no HUB, pede ao SOBEDESCE uma ação em nome
 * de uma pessoa (hoje só buscar no Drive dela). Nada de segredo compartilhado: o HUB assina um JWT curto com a mesma
 * chave do login único (ES256, publicada no JWKS) e o SOBEDESCE confere aqui.
 *
 * Confere: typ `zro-pedido+jwt` (um id_token ou access token não serve), alg ES256, assinatura pela JWKS da Absolute
 * ZRO, `iss` = o emissor configurado, `aud` = o client_id do SOBEDESCE, vida de no máximo 60 s (exp − iat), não
 * vencido, `zro_pedido` = a ação pedida e `jti` de uso único (reapresentado dentro da validade é recusado).
 */
import { createPublicKey, verify } from "node:crypto";
import { dentroDoLimite, registrarTentativa } from "@/lib/auth/limite";
import { credenciaisZro, emissor } from "./config";
import { chavePublica } from "./oidc";

export const TIPO_PEDIDO = "zro-pedido+jwt";
export const VIDA_MAX_S = 60;
/** Folga de relógio entre os dois servidores. */
const FOLGA_S = 30;

export type PedidoZro = { sub: string; jti: string };

export class PedidoRecusado extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = "PedidoRecusado";
  }
}

/** Lê o `Authorization: Bearer …` e confere o pedido para a `acao`. Lança PedidoRecusado (o motivo não vai à resposta). */
export async function conferirPedidoZro(autorizacao: string | null, acao: string, agora = Date.now()): Promise<PedidoZro> {
  const token = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(autorizacao ?? "")?.[1];
  if (!token) throw new PedidoRecusado("sem token");
  const [c, d, a] = token.split(".");
  let cabecalho: Record<string, unknown>;
  let dados: Record<string, unknown>;
  try {
    cabecalho = JSON.parse(Buffer.from(c, "base64url").toString("utf8"));
    dados = JSON.parse(Buffer.from(d, "base64url").toString("utf8"));
  } catch {
    throw new PedidoRecusado("json");
  }
  if (cabecalho.alg !== "ES256" || cabecalho.typ !== TIPO_PEDIDO || typeof cabecalho.kid !== "string") throw new PedidoRecusado("cabeçalho");
  const jwk = await chavePublica(cabecalho.kid);
  if (!jwk) throw new PedidoRecusado("chave desconhecida");
  const ok = verify("sha256", Buffer.from(`${c}.${d}`), { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(a, "base64url"));
  if (!ok) throw new PedidoRecusado("assinatura");
  const s = Math.floor(agora / 1000);
  if (dados.iss !== emissor()) throw new PedidoRecusado("emissor");
  if (dados.aud !== credenciaisZro().clientId) throw new PedidoRecusado("público");
  if (typeof dados.exp !== "number" || typeof dados.iat !== "number") throw new PedidoRecusado("sem datas");
  if (dados.exp - dados.iat > VIDA_MAX_S || dados.iat > s + FOLGA_S) throw new PedidoRecusado("vida");
  if (dados.exp <= s - FOLGA_S) throw new PedidoRecusado("vencido");
  if (dados.zro_pedido !== acao) throw new PedidoRecusado("ação");
  if (typeof dados.sub !== "string" || !dados.sub || typeof dados.jti !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(dados.jti)) throw new PedidoRecusado("sub ou jti");
  // Uso único: o jti fica na tabela de tentativas pela validade (e a folga) do pedido.
  const chave = `pedido-zro:${dados.jti}`;
  if (!(await dentroDoLimite(chave, { max: 1, janelaMs: (VIDA_MAX_S + 2 * FOLGA_S) * 1000 }))) throw new PedidoRecusado("reapresentado");
  await registrarTentativa(chave);
  return { sub: dados.sub, jti: dados.jti };
}

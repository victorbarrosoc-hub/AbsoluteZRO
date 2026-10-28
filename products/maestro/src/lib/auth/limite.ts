/**
 * Limite de tentativas (tabela maestro.rate_limit_attempts, só pela porta de sistema): conta linhas da chave numa
 * janela de tempo. Chaves: "entrar:<ip>" (idas ao login), "pedido-zro:<jti>" (uso único dos pedidos do HUB, etapa 3),
 * "link-*:<hash do token ou do ip>" (links do cliente, src/lib/revisao/link.ts), "pedido-*" e "orcamento-*" (links públicos,
 * src/lib/publico), "espera:<hash do ip>" e "espera" (lista de espera). Limpeza preguiçosa do que tem mais de um dia.
 */
import { and, count, eq, gte, lt } from "drizzle-orm";
import { getBanco, schema } from "@/lib/db/client";

const { rateLimitAttempts } = schema;

export type Regra = { max: number; janelaMs: number };

export const REGRAS = {
  /** Idas ao login por IP: segura laço de redirecionamento e abuso, sem atrapalhar uma equipe atrás do mesmo IP. */
  entrarIp: { max: 60, janelaMs: 15 * 60_000 },
  /** Releitura do perfil na Absolute ZRO por sessão. */
  perfilSessao: { max: 30, janelaMs: 10 * 60_000 },
  /** Lista de espera da página inicial: 5 envios por hora por IP (decisão do plano v2 §10). */
  esperaIp: { max: 5, janelaMs: 60 * 60_000 },
  /** Teto geral da lista de espera (IPs trocados não enchem a tabela). */
  esperaGeral: { max: 300, janelaMs: 60 * 60_000 },
  /** Link do cliente (plano v2 §4.4): abrir 120/h por link; qualquer link 300/h por IP (tentar tokens não compensa). */
  linkAbrir: { max: 120, janelaMs: 60 * 60_000 },
  linkIp: { max: 300, janelaMs: 60 * 60_000 },
  /** Link que não existe: 30/h por IP, depois nem link bom abre por um tempo. */
  linkMortoIp: { max: 30, janelaMs: 60 * 60_000 },
  /** PIN: 5 tentativas a cada 15 min por link e IP; 20 por link no total. */
  linkPinIp: { max: 5, janelaMs: 15 * 60_000 },
  linkPin: { max: 20, janelaMs: 15 * 60_000 },
  /** Comentar 60/h por link; enviar decisões 20/h por link (a decisão em si vale uma vez por peça e volta). */
  linkComentar: { max: 60, janelaMs: 60 * 60_000 },
  linkEnviar: { max: 20, janelaMs: 60 * 60_000 },
  /** Pedido público (plano v2 §4.4): 5/h por IP e 30 a cada 10 min por link (o link de pedido é um por organização). */
  pedidoIp: { max: 5, janelaMs: 60 * 60_000 },
  pedidoLink: { max: 30, janelaMs: 10 * 60_000 },
  /** Orçamento público: abrir 120/h por link; aceitar ou pedir ajuste 20/h por link (o aceite vale uma vez). */
  orcamentoAbrir: { max: 120, janelaMs: 60 * 60_000 },
  orcamentoDecidir: { max: 20, janelaMs: 60 * 60_000 },
} satisfies Record<string, Regra>;

/** true = ainda pode tentar. */
export async function dentroDoLimite(chave: string, regra: Regra): Promise<boolean> {
  const desde = new Date(Date.now() - regra.janelaMs);
  return getBanco().asSystem("limite", async (tx) => {
    const [linha] = await tx
      .select({ n: count() })
      .from(rateLimitAttempts)
      .where(and(eq(rateLimitAttempts.key, chave), gte(rateLimitAttempts.at, desde)));
    return (linha?.n ?? 0) < regra.max;
  });
}

export async function registrarTentativa(...chaves: string[]): Promise<void> {
  if (chaves.length === 0) return;
  await getBanco().asSystem("limite", async (tx) => {
    await tx.insert(rateLimitAttempts).values(chaves.map((key) => ({ key })));
    if (Math.random() < 0.02) await tx.delete(rateLimitAttempts).where(lt(rateLimitAttempts.at, new Date(Date.now() - 24 * 60 * 60_000)));
  });
}

export const MENSAGEM_LIMITE = "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";

/**
 * Limite de tentativas (tabela maestro.rate_limit_attempts, só pela porta de sistema): conta linhas da chave numa
 * janela de tempo. Chaves: "entrar:<ip>" (idas ao login), "pedido-zro:<jti>" (uso único dos pedidos do HUB, etapa 3),
 * "link:<ip>" e "link-token:<hash>" (links do cliente, etapa 2), "espera:<hash do ip>" e "espera" (lista de espera). Limpeza preguiçosa do que tem mais de um dia.
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

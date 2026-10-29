/**
 * A porta estreita dos links públicos (`/p` pedido e `/o` orçamento, plano v2 §4.4), no mesmo desenho do link de
 * aprovação (`src/lib/revisao/link.ts`): a transação assume `maestro_app` SEM organização na sessão, então o RLS esconde
 * todas as tabelas e só as funções security definer da 0012 respondem, e só sobre o link do token. Os limites por IP
 * são os mesmos do link de aprovação (um teto só para quem tenta tokens). Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Tx } from "@/lib/db/client";
import { PAPEL_APP } from "@/lib/db/config";
import { dentroDoLimite, registrarTentativa, REGRAS } from "@/lib/auth/limite";
import { ipHashDoDia } from "@/lib/revisao/link";

export { ipHashDoDia };

export function comoPublico<T>(motivo: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getBanco().asSystem(`${motivo} (porta estreita)`, async (tx) => {
    await tx.execute(sql.raw(`set local role ${PAPEL_APP}`));
    return fn(tx);
  });
}

/** Chama uma função da porta (`select maestro.x(...) as r`) e devolve o jsonb. */
export async function chamarPorta(motivo: string, consulta: ReturnType<typeof sql>): Promise<unknown> {
  return comoPublico(motivo, async (tx) => {
    const linhas = (await tx.execute(consulta)) as unknown as { r: unknown }[];
    return linhas[0]?.r ?? null;
  });
}

/** O teto por IP (qualquer link) e o castigo de quem erra token. true = pode seguir. */
export async function ipDentroDoLimite(ipHash: string): Promise<boolean> {
  const [ip, mortos] = await Promise.all([dentroDoLimite(`link-ip:${ipHash}`, REGRAS.linkIp), dentroDoLimite(`link-morto:${ipHash}`, REGRAS.linkMortoIp)]);
  return ip && mortos;
}

export const marcarMorto = (ipHash: string) => registrarTentativa(`link-ip:${ipHash}`, `link-morto:${ipHash}`);

/** wa.me da produtora com o texto pronto (só o número do Ajustes → Marca; sem API). */
export function whatsappDaProdutora(telefone: string | null | undefined, texto: string): string | null {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

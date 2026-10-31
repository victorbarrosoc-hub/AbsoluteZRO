/**
 * Quem está abrindo um convite de freela (drizzle/0036). O freela não é da produtora nem precisa ter o Maestro: o login
 * único volta do convite SEM criar sessão nem organização no Maestro (src/lib/zro/rotas.ts) e deixa só a identidade
 * conferida no id_token (sub, @, nome, foto) num cookie cifrado de 30 minutos (`mae_conv`). Quem já tem sessão no
 * Maestro usa a dela. O corpo do pedido nunca diz quem é.
 */
import { sql } from "drizzle-orm";
import { abrirCookie, selarCookie } from "@/lib/auth/cripto";
import { autenticar, COOKIE_SESSAO } from "@/lib/auth/sessao";
import { getBanco } from "@/lib/db/client";
import { serializarCookie } from "@/lib/http";

export const COOKIE_CONVIDADO = "mae_conv";
export const DURACAO_CONVIDADO_S = 30 * 60;
const CONTEXTO = "cookie:mae_conv";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARROBA = /^[a-z0-9._]{3,30}$/;

export type Identidade = { sub: string; arroba: string | null; nome: string | null; foto: string | null };

export function selarIdentidade(i: Identidade, agora = Date.now()): string {
  return selarCookie(JSON.stringify({ ...i, expira: agora + DURACAO_CONVIDADO_S * 1000 }), CONTEXTO);
}

export function abrirIdentidade(valor: string | undefined, agora = Date.now()): Identidade | null {
  if (!valor || valor.length > 2048) return null;
  try {
    const e = JSON.parse(abrirCookie(valor, CONTEXTO)) as Identidade & { expira: number };
    if (typeof e.sub !== "string" || !UUID.test(e.sub) || typeof e.expira !== "number" || e.expira < agora) return null;
    return {
      sub: e.sub.toLowerCase(),
      arroba: typeof e.arroba === "string" && ARROBA.test(e.arroba) ? e.arroba : null,
      nome: typeof e.nome === "string" ? e.nome.slice(0, 120) : null,
      foto: typeof e.foto === "string" && /^https?:\/\//.test(e.foto) ? e.foto : null,
    };
  } catch {
    return null;
  }
}

export const cookieDaIdentidade = (valor: string, seguro: boolean) =>
  serializarCookie(COOKIE_CONVIDADO, valor, { maxAge: valor ? DURACAO_CONVIDADO_S : 0, path: "/", httpOnly: true, secure: seguro, sameSite: "Lax" });

/** A identidade do cookie do convite; sem ele, a da sessão do Maestro (com o @ guardado no membro). */
export async function identidadeDosCookies(ler: (nome: string) => string | undefined): Promise<Identidade | null> {
  const doConvite = abrirIdentidade(ler(COOKIE_CONVIDADO));
  if (doConvite) return doConvite;
  const s = await autenticar(ler(COOKIE_SESSAO)).catch(() => null);
  if (!s) return null;
  const [m] = (await getBanco().asSystem("convite de freela: o @ da sessão", (tx) =>
    tx.execute(sql`select zro_arroba from maestro.members where org_id = ${s.orgId} and zro_sub = ${s.sub}`),
  )) as unknown as { zro_arroba: string | null }[];
  return { sub: s.sub, arroba: m?.zro_arroba ?? null, nome: s.nome, foto: s.foto };
}

/**
 * Cookie da ida para a Absolute ZRO: state + verificador PKCE + nonce + modo + volta, cifrado e autenticado
 * (lib/auth/cripto.ts, chave derivada "cookie"), só em /api/zro, 10 minutos.
 */
import { abrirCookie, selarCookie } from "@/lib/auth/cripto";

export const COOKIE_ZRO = "mae_zro";
export const DURACAO_ZRO_S = 600;
const CONTEXTO = "cookie:mae_zro";

/** `criar`: a pessoa veio de "Criar conta" (prompt=create na Absolute ZRO); a volta é a mesma. */
export type ModoZro = "entrar" | "criar";
export type EstadoZro = { state: string; verificador: string; nonce: string; modo: ModoZro; volta: string; basico?: boolean; expira: number };

export function selarEstadoZro(e: Omit<EstadoZro, "expira">): string {
  return selarCookie(JSON.stringify({ ...e, expira: Date.now() + DURACAO_ZRO_S * 1000 }), CONTEXTO);
}

export function abrirEstadoZro(valor: string | undefined): EstadoZro | null {
  if (!valor) return null;
  try {
    const e = JSON.parse(abrirCookie(valor, CONTEXTO)) as EstadoZro;
    if (typeof e.state !== "string" || typeof e.verificador !== "string" || typeof e.nonce !== "string" || typeof e.volta !== "string") return null;
    if (e.modo !== "entrar" && e.modo !== "criar") return null;
    if (typeof e.expira !== "number" || e.expira < Date.now()) return null;
    return e;
  } catch {
    return null;
  }
}

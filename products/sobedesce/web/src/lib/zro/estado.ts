/**
 * Cookie da ida para a Absolute ZRO: state + verificador PKCE + nonce + modo + volta, cifrado e autenticado
 * (mesma cripto do cookie do Google), só em /api/zro, 10 minutos.
 */
import { abrirCookie, selarCookie } from "@/lib/google/cripto";

export const COOKIE_ZRO = "sd_zro";
export const DURACAO_ZRO_S = 600;
const CONTEXTO = "cookie:sd_zro";

export type ModoZro = "entrar" | "vincular";
export type EstadoZro = { state: string; verificador: string; nonce: string; modo: ModoZro; usuarioId: string | null; volta: string; basico?: boolean; semSet?: boolean; expira: number };

export function selarEstadoZro(e: Omit<EstadoZro, "expira">): string {
  return selarCookie(JSON.stringify({ ...e, expira: Date.now() + DURACAO_ZRO_S * 1000 }), CONTEXTO);
}

export function abrirEstadoZro(valor: string | undefined): EstadoZro | null {
  if (!valor) return null;
  try {
    const e = JSON.parse(abrirCookie(valor, CONTEXTO)) as EstadoZro;
    if (typeof e.state !== "string" || typeof e.verificador !== "string" || typeof e.nonce !== "string" || typeof e.volta !== "string") return null;
    if (e.modo !== "entrar" && e.modo !== "vincular") return null;
    if (typeof e.expira !== "number" || e.expira < Date.now()) return null;
    return e;
  } catch {
    return null;
  }
}

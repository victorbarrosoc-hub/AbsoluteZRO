/** Peças comuns de clientes e projetos: resultado, erros do banco em português, textos e datas da forma. */
import { codigoPg, PG } from "@/lib/db/client";

export type Erros = Record<string, string>;
export type Falha = { ok: false; erro: string; mensagem: string; erros?: Erros };
export type Res<T extends object = object> = ({ ok: true } & T) | Falha;

export const falha = (erro: string, mensagem: string, erros?: Erros): Falha => ({ ok: false, erro, mensagem, erros });

/** Erro do banco que o domínio entende; o resto sobe. */
export function traduzirPg(e: unknown): Falha {
  const c = codigoPg(e);
  if (c === PG.semPrivilegio) return falha("sem_permissao", "Seu papel nesta organização só lê.");
  if (c === PG.checagem) return falha("formato", "Algum campo veio num formato que não cabe.");
  if (c === PG.chaveEstrangeira) return falha("vinculo", "Um dos vínculos não existe mais.");
  throw e;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Texto opcional: aparado, vazio vira null; maior que o limite = erro. */
export function textoOpcional(v: unknown, limite: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  return t.length <= limite ? t : undefined;
}

/** Data AAAA-MM-DD opcional (vazio = null; inválida = undefined). */
export function dataOpcional(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

/** Busca sem diferença de maiúsculas, com % e _ escapados para o ilike. */
export const padraoBusca = (q: string) => `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

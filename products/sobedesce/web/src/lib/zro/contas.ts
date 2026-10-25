/**
 * Conta Absolute ZRO ligada a uma conta SOBEDESCE (tabela contas_zro).
 * - Entrar: a pessoa da Absolute ZRO (zroSub) que já está ligada entra na conta dela.
 * - Primeira vez, sem conta SOBEDESCE com o e-mail: cria a conta (como o "Continuar com Google").
 * - E-mail que já tem conta SOBEDESCE: nunca liga sozinho (não toma conta pelo e-mail). A pessoa entra como sempre
 *   e liga a Absolute ZRO em Sua conta.
 * O Drive não muda: continua em contas_google, conectado em Sua conta.
 */
import { eq } from "drizzle-orm";
import { dentroDoLimite, REGRAS, registrarTentativa } from "@/lib/auth/limite";
import { novoId } from "@/lib/auth/tokens";
import { db, schema } from "@/lib/db";
import { emSegundoPlano, type Depois } from "@/lib/depois";
import { avisarAdminContaNova } from "@/lib/email/admin";
import type { PerfilZro } from "./oidc";

const { contasZro, usuarios } = schema;

/** Marca de conta criada pela Absolute ZRO: não é hash, nenhuma senha confere até a pessoa criar uma. */
export const SEM_SENHA_ZRO = "zro";

const camposDoPerfil = (p: PerfilZro) => ({ email: p.email, produtos: p.produtos.join(" "), organizacao: p.organizacao, ultimoLoginEm: new Date() });

export async function donoDaContaZro(p: PerfilZro): Promise<string | null> {
  const l = await db.query.contasZro.findFirst({ where: eq(contasZro.zroSub, p.sub) });
  if (!l) return null;
  await db.update(contasZro).set(camposDoPerfil(p)).where(eq(contasZro.usuarioId, l.usuarioId));
  await db.update(usuarios).set({ ultimoLoginEm: new Date() }).where(eq(usuarios.id, l.usuarioId));
  return l.usuarioId;
}

export type ResultadoVinculoZro = { ok: true } | { ok: false; erro: "zro_outra_conta" | "zro_ja_ligada" };

/** Liga a Absolute ZRO à conta de quem está logado (em Sua conta). */
export async function vincularZro(usuarioId: string, p: PerfilZro): Promise<ResultadoVinculoZro> {
  const dono = await db.query.contasZro.findFirst({ where: eq(contasZro.zroSub, p.sub) });
  if (dono && dono.usuarioId !== usuarioId) return { ok: false, erro: "zro_outra_conta" };
  const atual = await db.query.contasZro.findFirst({ where: eq(contasZro.usuarioId, usuarioId) });
  if (atual && atual.zroSub !== p.sub) return { ok: false, erro: "zro_ja_ligada" };
  if (atual) await db.update(contasZro).set(camposDoPerfil(p)).where(eq(contasZro.usuarioId, usuarioId));
  else await db.insert(contasZro).values({ usuarioId, zroSub: p.sub, ...camposDoPerfil(p) });
  return { ok: true };
}

export type ResultadoCriacaoZro = { ok: true; usuarioId: string } | { ok: false; erro: "zro_email_em_uso" | "zro_email_nao_verificado" | "zro_devagar" };

export async function criarContaComZro(p: PerfilZro, ip: string, depois: Depois = emSegundoPlano): Promise<ResultadoCriacaoZro> {
  // Conta nova só com e-mail confirmado pela Absolute ZRO: ninguém cria conta SOBEDESCE no e-mail de outra pessoa.
  if (!p.emailVerificado) return { ok: false, erro: "zro_email_nao_verificado" };
  const chave = `criar:${ip}`;
  if (!(await dentroDoLimite(chave, REGRAS.criarConta))) return { ok: false, erro: "zro_devagar" };
  await registrarTentativa(chave);
  const usuarioId = novoId();
  const nome = (p.nome || p.email.split("@")[0]).slice(0, 80);
  const criado = await db
    .insert(usuarios)
    .values({ id: usuarioId, email: p.email, nome, senhaHash: SEM_SENHA_ZRO, ultimoLoginEm: new Date() })
    .onConflictDoNothing({ target: usuarios.email })
    .returning({ id: usuarios.id });
  if (criado.length === 0) return { ok: false, erro: "zro_email_em_uso" };
  const v = await vincularZro(usuarioId, p);
  if (!v.ok) {
    await db.delete(usuarios).where(eq(usuarios.id, usuarioId));
    return { ok: false, erro: "zro_email_em_uso" };
  }
  depois(() => avisarAdminContaNova({ id: usuarioId, nome, email: p.email }, false));
  return { ok: true, usuarioId };
}

export type ContaZroPublica = { email: string; organizacao: string | null; produtos: string[]; ultimoLoginEm: Date | null };

export async function contaZroDe(usuarioId: string): Promise<ContaZroPublica | null> {
  const l = await db.query.contasZro.findFirst({ where: eq(contasZro.usuarioId, usuarioId) });
  return l ? { email: l.email, organizacao: l.organizacao, produtos: l.produtos.split(" ").filter(Boolean), ultimoLoginEm: l.ultimoLoginEm } : null;
}

/** Desliga a Absolute ZRO. Conta sem senha (criada pela Absolute ZRO) não pode desligar: ficaria sem como entrar. */
export async function desligarZro(usuarioId: string): Promise<{ ok: true } | { ok: false; erro: "zro_unico_login" }> {
  const u = await db.query.usuarios.findFirst({ where: eq(usuarios.id, usuarioId) });
  if (u && !u.senhaHash.startsWith("scrypt$")) {
    const google = await db.query.contasGoogle.findFirst({ where: (g, { and, eq: igual }) => and(igual(g.usuarioId, usuarioId), igual(g.loginPermitido, true)) });
    if (!google) return { ok: false, erro: "zro_unico_login" };
  }
  await db.delete(contasZro).where(eq(contasZro.usuarioId, usuarioId));
  return { ok: true };
}

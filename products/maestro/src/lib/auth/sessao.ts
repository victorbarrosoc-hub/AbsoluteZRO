/**
 * Sessão própria do Maestro. O token vai para o cookie `mae_sessao` (HttpOnly, SameSite=Lax, 30 dias deslizantes);
 * o banco guarda só o sha256. Os tokens da Absolute ZRO (access + refresh) ficam cifrados na linha da sessão
 * (lib/auth/cripto.ts) e nunca vão ao navegador. Tudo pela porta de sistema: maestro_app não lê sessões.
 * Sem next/headers aqui: as rotas e os testes passam o cookie direto.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { getBanco, schema } from "@/lib/db/client";
import type { Papel } from "@/lib/papeis";
import type { PerfilZro, TokensZro } from "@/lib/zro/oidc";
import { abrir, hashToken, novoToken, selar } from "./cripto";

const { sessions, members, organizations } = schema;

export const COOKIE_SESSAO = "mae_sessao";
const DIA = 24 * 60 * 60_000;
export const DURACAO_MS = 30 * DIA;
/** Só regrava last_used_at/expires_at se a última gravação tem mais que isso (evita uma escrita por pedido). */
const INTERVALO_DESLIZE = 10 * 60_000;
const contexto = (id: string) => `sessions.zro:${id}`;

export type Sessao = {
  id: string;
  orgId: string;
  orgNome: string;
  zroOrgId: string;
  sub: string;
  nome: string | null;
  email: string | null;
  foto: string | null;
  hubRole: string | null;
  papel: Papel;
  /** zro_products do último login ou releitura: o que temAcesso() confere. */
  produtos: string[];
  /** zro_release do último login ou releitura (gate de lançamento). null = sessão sem a claim (fechado). */
  release: Record<string, string> | null;
  expiraEm: Date;
  perfilLidoEm: Date | null;
  temTokens: boolean;
};

export function opcoesCookieSessao(seguro: boolean) {
  return { maxAge: Math.floor(DURACAO_MS / 1000), path: "/", httpOnly: true, secure: seguro, sameSite: "Lax" as const };
}

export async function criarSessao(o: {
  orgId: string;
  sub: string;
  produtos: string[];
  release: Record<string, string> | null;
  tokens: TokensZro | null;
  userAgent?: string | null;
}): Promise<{ token: string; id: string }> {
  const token = novoToken();
  const id = await getBanco().asSystem("sessão: criar", async (tx) => {
    const [l] = await tx
      .insert(sessions)
      .values({
        orgId: o.orgId,
        zroSub: o.sub,
        tokenHash: hashToken(token),
        produtos: o.produtos,
        zroRelease: o.release,
        userAgent: o.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + DURACAO_MS),
        perfilLidoEm: new Date(),
      })
      .returning({ id: sessions.id });
    if (o.tokens)
      await tx
        .update(sessions)
        .set({ zroTokensEnc: selar(JSON.stringify(o.tokens), contexto(l.id)) })
        .where(eq(sessions.id, l.id));
    return l.id;
  });
  return { token, id };
}

/** A sessão do cookie, se existe, não foi encerrada nem venceu e a pessoa segue membro ativo. */
export async function autenticar(cookie: string | undefined, agora = new Date()): Promise<Sessao | null> {
  if (!cookie || cookie.length > 200) return null;
  const hash = hashToken(cookie);
  return getBanco().asSystem("sessão: ler", async (tx) => {
    const [l] = await tx
      .select({
        id: sessions.id,
        orgId: sessions.orgId,
        sub: sessions.zroSub,
        produtos: sessions.produtos,
        release: sessions.zroRelease,
        expiraEm: sessions.expiresAt,
        ultimoUso: sessions.lastUsedAt,
        perfilLidoEm: sessions.perfilLidoEm,
        tokens: sessions.zroTokensEnc,
        orgNome: organizations.name,
        zroOrgId: organizations.zroOrgId,
        nome: members.displayName,
        email: members.email,
        foto: members.pictureUrl,
        hubRole: members.hubRole,
        papel: members.role,
        status: members.status,
      })
      .from(sessions)
      .innerJoin(organizations, eq(organizations.id, sessions.orgId))
      .innerJoin(members, and(eq(members.orgId, sessions.orgId), eq(members.zroSub, sessions.zroSub)))
      .where(and(eq(sessions.tokenHash, hash), isNull(sessions.revokedAt), gt(sessions.expiresAt, agora)));
    if (!l || l.status !== "active") return null;
    if (agora.getTime() - l.ultimoUso.getTime() > INTERVALO_DESLIZE) {
      await tx
        .update(sessions)
        .set({ lastUsedAt: agora, expiresAt: new Date(agora.getTime() + DURACAO_MS) })
        .where(eq(sessions.id, l.id));
    }
    return {
      id: l.id,
      orgId: l.orgId,
      orgNome: l.orgNome,
      zroOrgId: l.zroOrgId,
      sub: l.sub,
      nome: l.nome,
      email: l.email,
      foto: l.foto,
      hubRole: l.hubRole,
      papel: l.papel,
      produtos: l.produtos,
      release: l.release ?? null,
      expiraEm: l.expiraEm,
      perfilLidoEm: l.perfilLidoEm,
      temTokens: !!l.tokens,
    };
  });
}

function lerTokens(id: string, selado: string | null): TokensZro | null {
  if (!selado) return null;
  try {
    const t = JSON.parse(abrir(selado, contexto(id))) as TokensZro;
    return typeof t.at === "string" && typeof t.rt === "string" && typeof t.atExp === "number" ? t : null;
  } catch {
    return null;
  }
}

/** Encerra a sessão e devolve os tokens (para revogar na Absolute ZRO). Repetir não faz nada. */
export async function encerrarSessao(id: string): Promise<TokensZro | null> {
  return getBanco().asSystem("sessão: encerrar", async (tx) => {
    const [l] = await tx
      .select({ tokens: sessions.zroTokensEnc })
      .from(sessions)
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
      .for("update");
    if (!l) return null;
    await tx.update(sessions).set({ revokedAt: new Date(), zroTokensEnc: null }).where(eq(sessions.id, id));
    return lerTokens(id, l.tokens);
  });
}

/**
 * Lê (e, quando precisa, troca) os tokens da Absolute ZRO desta sessão, com a linha travada: dois pedidos ao mesmo
 * tempo esperam um pelo outro e o segundo já usa o access token novo. `renovar` recebe o refresh token e devolve
 * os tokens novos, null se a Absolute ZRO recusou (a sessão perde os tokens) ou lança por rede.
 */
export async function comTokensDaSessao<T>(
  id: string,
  usar: (tokens: TokensZro | null, guardar: (novos: TokensZro | null) => Promise<void>) => Promise<T>,
): Promise<T> {
  return getBanco().asSystem("sessão: tokens", async (tx) => {
    const [l] = await tx.select({ tokens: sessions.zroTokensEnc }).from(sessions).where(eq(sessions.id, id)).for("update");
    const guardar = async (novos: TokensZro | null) => {
      await tx
        .update(sessions)
        .set({ zroTokensEnc: novos ? selar(JSON.stringify(novos), contexto(id)) : null })
        .where(eq(sessions.id, id));
    };
    return usar(l ? lerTokens(id, l.tokens) : null, guardar);
  });
}

/** Releitura do perfil (userinfo): atualiza pessoa, organização, produtos e zro_release; marca a hora na sessão. */
export async function aplicarPerfilNaSessao(s: Sessao, perfil: PerfilZro, agora = new Date()): Promise<void> {
  await getBanco().asSystem("sessão: perfil", async (tx) => {
    await tx
      .update(members)
      .set({ displayName: perfil.nome, email: perfil.email, pictureUrl: perfil.foto })
      .where(and(eq(members.orgId, s.orgId), eq(members.zroSub, s.sub)));
    if (perfil.org && perfil.org.id === s.zroOrgId) {
      await tx.update(organizations).set({ name: perfil.org.name, zroProducts: perfil.produtos }).where(eq(organizations.id, s.orgId));
    }
    await tx.update(sessions).set({ produtos: perfil.produtos, zroRelease: perfil.release, perfilLidoEm: agora }).where(eq(sessions.id, s.id));
  });
}

/** Só marca que tentou reler agora (Absolute ZRO fora do ar: vale a última cópia, sem bater toda hora). */
export async function marcarPerfilLido(id: string, agora = new Date()): Promise<void> {
  await getBanco().asSystem("sessão: perfil", (tx) => tx.update(sessions).set({ perfilLidoEm: agora }).where(eq(sessions.id, id)));
}

/**
 * Console da Absolute ZRO › Apps › SOBEDESCE · Acesso ao Drive (titular, 31/10/2026): o "Acesso total" ao Drive é
 * decidido lá, não mais no /admin daqui. O HUB só assina estes pedidos (lib/zro/pedido.ts, typ zro-pedido+jwt, 60 s,
 * uso único) depois de conferir o papel no console (apps/hub-web/lib/sobedesce-console.ts): ler para admin e suporte,
 * mudar só para admin. Aqui vale a assinatura com a ação certa; `sub` é quem pediu no console (vai para a auditoria).
 * A regra das vagas continua em lib/google/vagas.ts (90, vaga usada não volta).
 */
import { inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { erro, json, lerJson } from "@/lib/http";
import { listarPessoas } from "@/lib/admin";
import { revogarRefresh } from "@/lib/google/contas";
import { resumoVagas, trocarAcessoTotal, type ResumoVagas } from "@/lib/google/vagas";
import type { ModoDrive } from "@/lib/google/config";
import { zroConfigurado } from "./config";
import { conferirPedidoZro, PedidoRecusado } from "./pedido";

export const ACAO_LER = "console.drive.ler";
export const ACAO_MUDAR = "console.drive.acesso";

export type PessoaConsole = {
  id: string;
  nome: string;
  email: string;
  /** Conta Absolute ZRO ligada (contas_zro), ou null para conta antiga sem vínculo. */
  zroSub: string | null;
  acessoTotal: boolean;
  /** Já recebeu o `drive` inteiro numa conta Google (gastou vaga). */
  usouVaga: boolean;
  drives: { email: string; modo: ModoDrive; estado: "ok" | "reconectar" }[];
};

export async function painelDoConsole(): Promise<{ vagas: ResumoVagas; pessoas: PessoaConsole[] }> {
  const [{ pessoas }, vagas] = await Promise.all([listarPessoas(), resumoVagas()]);
  const ids = pessoas.map((p) => p.id);
  const [vinculos, usadas] = ids.length
    ? await Promise.all([
        db.select({ usuarioId: schema.contasZro.usuarioId, sub: schema.contasZro.zroSub }).from(schema.contasZro).where(inArray(schema.contasZro.usuarioId, ids)),
        db
          .select({ usuarioId: schema.vagasDrive.usuarioId, n: sql<number>`count(*)::int` })
          .from(schema.vagasDrive)
          .where(inArray(schema.vagasDrive.usuarioId, ids))
          .groupBy(schema.vagasDrive.usuarioId),
      ])
    : [[], []];
  const sub = new Map(vinculos.map((v) => [v.usuarioId, v.sub]));
  const usou = new Set(usadas.filter((u) => Number(u.n) > 0).map((u) => u.usuarioId));
  return {
    vagas,
    pessoas: pessoas.map((p) => ({
      id: p.id,
      nome: p.nome,
      email: p.email,
      zroSub: sub.get(p.id) ?? null,
      acessoTotal: p.acessoTotal,
      usouVaga: usou.has(p.id as string),
      drives: p.drives.map((d) => ({ email: d.email, modo: d.modo, estado: d.estado })),
    })),
  };
}

/** Confere o pedido do console; devolve o `sub`/`jti` ou a resposta de recusa. */
async function conferir(req: Request, acao: string): Promise<{ sub: string; jti: string } | Response> {
  if (!zroConfigurado()) return erro(503, "sem_config", "A Absolute ZRO não está configurada neste SOBEDESCE.");
  try {
    return await conferirPedidoZro(req.headers.get("authorization"), acao);
  } catch (e) {
    if (e instanceof PedidoRecusado) return erro(401, "nao_autorizado", "Pedido sem autorização válida da Absolute ZRO.", { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    return erro(502, "zro_indisponivel", "Não deu para conferir o pedido com a Absolute ZRO agora.");
  }
}

/** POST /api/zro/console/drive: as vagas e as pessoas com o modo de cada Drive. */
export async function rotaLer(req: Request): Promise<Response> {
  const p = await conferir(req, ACAO_LER);
  if (p instanceof Response) return p;
  return json(await painelDoConsole());
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** POST /api/zro/console/drive/acesso `{ usuarioId, ligar }`: liga ou desliga o Acesso total (regra das vagas). */
export async function rotaMudar(req: Request, revogar = revogarRefresh): Promise<Response> {
  const p = await conferir(req, ACAO_MUDAR);
  if (p instanceof Response) return p;
  const corpo = (await lerJson(req, 1024)) ?? {};
  const usuarioId = typeof corpo.usuarioId === "string" && ID.test(corpo.usuarioId) ? corpo.usuarioId : null;
  if (!usuarioId || typeof corpo.ligar !== "boolean") return erro(400, "entrada", "Mande usuarioId e ligar (true ou false).");
  const r = await trocarAcessoTotal(usuarioId, corpo.ligar, { revogar });
  const resultado = r.ok ? (corpo.ligar ? "ligado" : "desligado") : r.erro;
  await db
    .insert(schema.auditoriaZro)
    .values({ usuarioId: r.ok || r.erro === "sem_vaga" ? usuarioId : null, zroSub: p.sub, acao: ACAO_MUDAR, alvo: usuarioId, resultado, jti: p.jti })
    .catch(() => undefined); // auditoria que falha não desfaz a troca
  if (!r.ok) {
    if (r.erro === "sem_vaga") return erro(409, "sem_vaga", `As ${r.resumo.limite} vagas já estão ocupadas.`);
    return erro(404, "nao_encontrada", "Esta conta não existe mais no SOBEDESCE.");
  }
  return json({ ok: true, acessoTotal: corpo.ligar, vagas: r.resumo });
}

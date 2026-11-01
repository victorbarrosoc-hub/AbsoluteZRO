/**
 * Drive híbrido (titular, 31/10/2026). O escopo `drive` é restrito: sem a auditoria paga, o Google deixa no máximo 100
 * contas usarem o projeto SOBEDESCE com ele, na vida do projeto (vaga usada não volta, contas de teste contam).
 *
 * - "Acesso total" (`usuarios.drive_acesso_total`) só o admin liga, na ficha da pessoa. Ninguém ganha sozinho.
 * - Quem tem: Conectar Drive pede `openid email profile drive`. Os outros: `openid email profile drive.file`
 *   ("Arquivos escolhidos": o que passou pelo SOBEDESCE e o que a pessoa escolher no Picker).
 * - Vaga usada = conta Google que já recebeu `drive` (tabela vagas_drive, nunca sai). Liberada sem uso = pessoa com
 *   acesso total que ainda não conectou um Drive com `drive`. Usadas + liberadas sem uso nunca passam do LIMITE.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DRIVE_SCOPE, escoposDoModo, type ModoDrive } from "./config";
import { acessoDoEscopo } from "./oauth";

const { usuarios, vagasDrive, contasGoogle } = schema;

/** Folga sob os 100 do Google (contas de teste, erros, a conta do próprio titular). */
export const LIMITE_VAGAS_DRIVE = 90;

export type ResumoVagas = {
  limite: number;
  /** Contas Google que já receberam `drive` (não volta). */
  usadas: number;
  /** Pessoas com acesso total que ainda não usaram a vaga. */
  liberadasSemUso: number;
  /** Quantas ainda dá para liberar. */
  livres: number;
};

type Executor = Pick<typeof db, "select">;

export async function resumoVagas(t: Executor = db, limite = LIMITE_VAGAS_DRIVE): Promise<ResumoVagas> {
  const [{ usadas }] = await t.select({ usadas: sql<number>`count(*)::int` }).from(vagasDrive);
  const [{ semUso }] = await t
    .select({ semUso: sql<number>`count(*)::int` })
    .from(usuarios)
    .leftJoin(vagasDrive, eq(vagasDrive.usuarioId, usuarios.id))
    .where(and(eq(usuarios.driveAcessoTotal, true), isNull(vagasDrive.googleSub)));
  const usadasN = Number(usadas);
  const semUsoN = Number(semUso);
  return { limite, usadas: usadasN, liberadasSemUso: semUsoN, livres: Math.max(0, limite - usadasN - semUsoN) };
}

/** Conta Google que recebeu `drive`: gasta a vaga dela (uma vez só, para sempre). */
export async function registrarVaga(googleSub: string, email: string, usuarioId: string | null, t: Pick<typeof db, "insert"> = db): Promise<void> {
  await t.insert(vagasDrive).values({ googleSub, email, usuarioId }).onConflictDoNothing({ target: vagasDrive.googleSub });
}

/** Grava a vaga se este escopo recebido tem o `drive` inteiro. */
export async function registrarSeTotal(escopo: string, googleSub: string, email: string, usuarioId: string | null, t: Pick<typeof db, "insert"> = db): Promise<void> {
  if (acessoDoEscopo(escopo) === "total") await registrarVaga(googleSub, email, usuarioId, t);
}

export type ResultadoLiberar = { ok: true; resumo: ResumoVagas } | { ok: false; erro: "sem_vaga" | "nao_encontrada"; resumo: ResumoVagas };

/**
 * Admin liga ou desliga o acesso total. Ligar ocupa uma vaga (se a pessoa ainda não tem uma usada) e é recusado no
 * limite. Desligar não devolve vaga nenhuma: revoga (melhor esforço) os Drives com `drive` da pessoa, que voltam a
 * conectar com `drive.file`.
 */
export async function trocarAcessoTotal(
  usuarioId: string,
  ligar: boolean,
  o: { limite?: number; revogar?: (refreshEnc: string, contaId: string) => Promise<void> } = {},
): Promise<ResultadoLiberar> {
  const limite = o.limite ?? LIMITE_VAGAS_DRIVE;
  const r = await db.transaction(async (t) => {
    // Duas liberações ao mesmo tempo não passam juntas do limite.
    await t.execute(sql`select pg_advisory_xact_lock(hashtext('sobedesce:vagas_drive'))`);
    const [u] = await t.select({ id: usuarios.id, ligado: usuarios.driveAcessoTotal }).from(usuarios).where(eq(usuarios.id, usuarioId));
    if (!u) return { ok: false as const, erro: "nao_encontrada" as const };
    if (u.ligado === ligar) return { ok: true as const, desligou: false };
    if (ligar) {
      const resumo = await resumoVagas(t, limite);
      const [jaUsou] = await t.select({ sub: vagasDrive.googleSub }).from(vagasDrive).where(eq(vagasDrive.usuarioId, usuarioId)).limit(1);
      if (!jaUsou && resumo.livres <= 0) return { ok: false as const, erro: "sem_vaga" as const };
    }
    await t.update(usuarios).set({ driveAcessoTotal: ligar, driveAcessoTotalEm: new Date() }).where(eq(usuarios.id, usuarioId));
    return { ok: true as const, desligou: !ligar };
  });
  if (r.ok && r.desligou) await recolherDriveInteiro(usuarioId, o.revogar);
  const resumo = await resumoVagas(db, limite);
  return r.ok ? { ok: true, resumo } : { ok: false, erro: r.erro, resumo };
}

/** Desligou: os Drives da pessoa com o `drive` inteiro deixam de valer até reconectar (agora com drive.file). */
async function recolherDriveInteiro(usuarioId: string, revogar?: (refreshEnc: string, contaId: string) => Promise<void>) {
  const linhas = await db
    .select({ id: contasGoogle.id, escopos: contasGoogle.escopos, refreshTokenEnc: contasGoogle.refreshTokenEnc })
    .from(contasGoogle)
    .where(eq(contasGoogle.usuarioId, usuarioId));
  for (const l of linhas) {
    if (!l.escopos.split(/\s+/).includes(DRIVE_SCOPE)) continue;
    if (revogar) await revogar(l.refreshTokenEnc, l.id).catch(() => {});
    await db.update(contasGoogle).set({ estado: "reconectar", accessTokenEnc: null, accessExpiraEm: null, atualizadoEm: new Date() }).where(eq(contasGoogle.id, l.id));
  }
}

export type PedidoDrive = { modo: ModoDrive; escopo: string; somarConcedidos: boolean };

/**
 * O escopo do "Conectar Google Drive", decidido antes de ir ao Google. Sem acesso total: drive.file, sem somar o que
 * já foi concedido. Com acesso total e a vaga ainda sem uso: `drive`. Vaga já usada (uma por pessoa, revisão M1):
 * drive.file somando os concedidos, então o Drive que usou a vaga volta com o inteiro e uma conta Google nova não gasta
 * outra vaga sem nova liberação do admin.
 */
export async function pedidoParaConectar(usuarioId: string): Promise<PedidoDrive> {
  const [u] = await db.select({ ligado: usuarios.driveAcessoTotal }).from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u?.ligado) return { modo: "arquivos", escopo: escoposDoModo("arquivos"), somarConcedidos: false };
  if ((await vagasUsadasPor(usuarioId)) > 0) return { modo: "arquivos", escopo: escoposDoModo("arquivos"), somarConcedidos: true };
  return { modo: "total", escopo: escoposDoModo("total"), somarConcedidos: true };
}

/**
 * O `drive` que voltou do Google vale (revisão M2)? Só com o acesso total ligado e numa destas: a conta Google é a que
 * já usou a vaga desta pessoa, ou o pedido foi o inteiro e a vaga ainda não tinha uso. Escopo trocado na URL do Google
 * ou conta Google nova depois da vaga usada: não vale.
 */
export async function driveInteiroPermitido(usuarioId: string, googleSub: string, pedido: ModoDrive | undefined): Promise<boolean> {
  const [u] = await db.select({ ligado: usuarios.driveAcessoTotal }).from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u?.ligado) return false;
  const minhas = await db.select({ sub: vagasDrive.googleSub }).from(vagasDrive).where(eq(vagasDrive.usuarioId, usuarioId));
  if (minhas.some((v) => v.sub === googleSub)) return true;
  return pedido === "total" && minhas.length === 0;
}

/**
 * Recusa um `drive` que não vale. O Google já contou a vaga quando deu o escopo: ela entra no contador sem dono (a
 * pessoa não ganha acesso total, e a conta daqui nunca passa dos 100 do Google). A concessão volta para o Google, menos
 * quando a conta Google é o Drive de outra pessoa daqui (revogar derrubaria o dela). Devolve o erro para a tela.
 */
export async function recusarDriveInteiro(
  usuarioId: string,
  googleSub: string,
  email: string,
  token: string,
  revogar: (token: string) => Promise<void>,
): Promise<"google_erro" | "google_outra_conta"> {
  await registrarVaga(googleSub, email, null);
  const [dono] = await db.select({ usuarioId: contasGoogle.usuarioId }).from(contasGoogle).where(eq(contasGoogle.googleSub, googleSub)).limit(1);
  if (dono && dono.usuarioId !== usuarioId) return "google_outra_conta";
  await revogar(token);
  return "google_erro";
}

/** O modo que vale para um Drive: acesso total ligado E o `drive` recebido. Qualquer outra coisa é Arquivos escolhidos. */
export function modoEfetivo(acessoTotal: boolean, escopos: string): ModoDrive {
  return acessoTotal && acessoDoEscopo(escopos) === "total" ? "total" : "arquivos";
}

/** Contas Google desta pessoa que já gastaram vaga. */
export async function vagasUsadasPor(usuarioId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(vagasDrive).where(eq(vagasDrive.usuarioId, usuarioId));
  return Number(n);
}

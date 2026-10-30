/**
 * A conta Absolute ZRO do freela (drizzle/0036): ligar pelo @ (o perfil relido no HUB), convidar o avulso (link de 7
 * dias, um aberto por freela, idempotente), revogar, desligar e, do lado de quem recebe, abrir e aceitar o convite pela
 * porta estreita (`maestro.freela_convite_*`, maestro_app sem organização, como /a e /f). O token só existe no link: o
 * banco guarda o sha256 e a cópia cifrada (`selar`, para copiar de novo). Quem aceita vem do login único (sessão ou o
 * cookie `mae_conv`, src/lib/zro/identidade.ts), nunca do corpo do pedido. Sem "server-only": os testes chamam direto.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { abrir, hashToken, novoToken, selar } from "@/lib/auth/cripto";
import { dentroDoLimite, registrarTentativa, REGRAS } from "@/lib/auth/limite";
import { codigoPg, getBanco, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { comoLink, ipHashDoDia } from "@/lib/revisao/link";
import type { PessoaZro } from "@/lib/zro/pessoas";
import type { Identidade } from "@/lib/zro/identidade";
import { enderecoDoConvite, ehTokenConvite, type ContaDoFreela } from "./convite";

const contextoToken = (id: string) => `freela_convites.token:${id}`;
const ISO = (c: string) => sql.raw(`to_char(${c} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

type Aberto = { id: string; token_enc: string; expira: string };

async function conviteAberto(tx: Tx, freelaId: string): Promise<Aberto | null> {
  const [c] = (await tx.execute(sql`
    select id, token_enc, ${ISO("expira_em")} as expira from maestro.freela_convites
     where freela_id = ${freelaId} and aceito_em is null and revogado_em is null and expira_em > now()
     order by criado_em desc limit 1`)) as unknown as Aberto[];
  return c ?? null;
}

function urlDe(c: Aberto, origem: string): string | null {
  try {
    return enderecoDoConvite(origem, abrir(c.token_enc, contextoToken(c.id)));
  } catch {
    return null;
  }
}

/** O estado da conta na ficha. `comLink` = quem escreve freelas (o link é a chave; leitura vê só o estado). */
export async function contaDoFreela(ctx: Contexto, freelaId: string, origem: string, comLink: boolean): Promise<ContaDoFreela | null> {
  if (!ehUuid(freelaId)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [f] = (await tx.execute(sql`select zro_sub, zro_arroba from maestro.freelas where id = ${freelaId}`)) as unknown as {
      zro_sub: string | null;
      zro_arroba: string | null;
    }[];
    if (!f) return null;
    if (f.zro_sub) return { estado: "conectado" as const, arroba: f.zro_arroba };
    const c = await conviteAberto(tx, freelaId);
    if (!c) return { estado: "sem_conta" as const };
    return { estado: "convidado" as const, expira: c.expira, url: comLink ? urlDe(c, origem) : null };
  });
}

/**
 * "Convidar para o Absolute ZRO": devolve o convite aberto do freela ou cria um (7 dias). Duas vezes = o mesmo link;
 * dois pedidos juntos = o índice de um aberto por freela segura e o segundo lê o do primeiro.
 */
export async function convidarFreela(ctx: Contexto, freelaId: string, origem: string): Promise<Res<{ url: string; expira: string; novo: boolean }>> {
  if (!ehUuid(freelaId)) return falha("nao_existe", "Esse freela não existe.");
  const tentar = () =>
    getBanco().asUser(ctx, async (tx): Promise<Res<{ url: string; expira: string; novo: boolean }>> => {
      const [f] = (await tx.execute(sql`select zro_sub from maestro.freelas where id = ${freelaId}`)) as unknown as { zro_sub: string | null }[];
      if (!f) return falha("nao_existe", "Esse freela não existe.");
      if (f.zro_sub) return falha("ja_ligado", "Esse freela já tem conta ligada.");
      const ja = await conviteAberto(tx, freelaId);
      if (ja) {
        const url = urlDe(ja, origem);
        if (url) return { ok: true, url, expira: ja.expira, novo: false };
        // a chave mudou e o link antigo não abre mais: revoga e faz outro
        await tx.execute(sql`update maestro.freela_convites set revogado_em = now() where id = ${ja.id}`);
      }
      const id = randomUUID();
      const token = novoToken();
      const [c] = (await tx.execute(sql`
        insert into maestro.freela_convites (id, org_id, freela_id, token_hash, token_enc, expira_em)
        values (${id}, ${ctx.orgId}, ${freelaId}, ${hashToken(token)}, ${selar(token, contextoToken(id))}, now() + interval '7 days')
        returning ${ISO("expira_em")} as expira`)) as unknown as { expira: string }[];
      return { ok: true, url: enderecoDoConvite(origem, token), expira: c.expira, novo: true };
    });
  try {
    return await tentar();
  } catch (e) {
    if (codigoPg(e) === PG.unicidade) {
      try {
        return await tentar();
      } catch (e2) {
        return traduzir(e2);
      }
    }
    return traduzir(e);
  }
}

function traduzir(e: unknown) {
  const msg = e instanceof Error ? `${e.message} ${String((e as { cause?: { message?: string } }).cause?.message ?? "")}` : "";
  if (msg.includes("freela_convite:ja_ligado")) return falha("ja_ligado", "Esse freela já tem conta ligada.");
  if (msg.includes("freela_convite:nao_existe")) return falha("nao_existe", "Esse freela não existe.");
  return traduzirPg(e);
}

/** Revoga o convite aberto (para sempre: o link vira a tela neutra). */
export async function revogarConvite(ctx: Contexto, freelaId: string): Promise<Res> {
  if (!ehUuid(freelaId)) return falha("nao_existe", "Esse freela não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.freela_convites set revogado_em = now()
         where freela_id = ${freelaId} and aceito_em is null and revogado_em is null returning id`);
      return r.length ? { ok: true as const } : falha("nao_existe", "Não há convite aberto.");
    });
  } catch (e) {
    return traduzir(e);
  }
}

/** Desliga a conta do freela (ex.: aceitou quem não devia). O cadastro fica; pode convidar de novo. */
export async function desligarConta(ctx: Contexto, freelaId: string): Promise<Res> {
  if (!ehUuid(freelaId)) return falha("nao_existe", "Esse freela não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = (await tx.execute(sql`
        update maestro.freelas set zro_sub = null, zro_arroba = null where id = ${freelaId} and zro_sub is not null returning id`)) as unknown as {
        id: string;
      }[];
      if (!r.length) return falha("nao_existe", "Esse freela não tem conta ligada.");
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id) values (${ctx.orgId}, ${ctx.sub}, 'freela.conta_desligada', 'freela', ${freelaId})`);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzir(e);
  }
}

/**
 * Liga o freela à pessoa achada pelo @ (o perfil foi relido no HUB pelo servidor; a tela só manda o @). Dentro da
 * transação do salvar. A mesma conta em outro freela da produtora: recusa, dizendo qual. Convite aberto sai (revogado).
 */
export async function ligarNaTx(tx: Tx, ctx: Contexto, freelaId: string, p: PessoaZro): Promise<Res> {
  const [outro] = (await tx.execute(sql`
    select id, nome from maestro.freelas where zro_sub = ${p.id}::uuid and id <> ${freelaId}`)) as unknown as { id: string; nome: string }[];
  if (outro) return falha("conta_em_outro", `@${p.arroba} já está no banco como ${outro.nome}.`);
  const r = (await tx.execute(sql`
    update maestro.freelas set zro_sub = ${p.id}::uuid, zro_arroba = ${p.arroba}
     where id = ${freelaId} and zro_sub is distinct from ${p.id}::uuid returning id`)) as unknown as { id: string }[];
  if (r.length) {
    await tx.execute(sql`update maestro.freela_convites set revogado_em = now() where freela_id = ${freelaId} and aceito_em is null and revogado_em is null`);
    await tx.execute(sql`
      insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (${ctx.orgId}, ${ctx.sub}, 'freela.da_zro', 'freela', ${freelaId}, ${JSON.stringify({ arroba: p.arroba })}::jsonb)`);
  } else {
    await tx.execute(sql`update maestro.freelas set zro_arroba = ${p.arroba} where id = ${freelaId}`);
  }
  return { ok: true };
}

export async function desligarNaTx(tx: Tx, ctx: Contexto, freelaId: string): Promise<void> {
  const r = await tx.execute(sql`update maestro.freelas set zro_sub = null, zro_arroba = null where id = ${freelaId} and zro_sub is not null returning id`);
  if (r.length)
    await tx.execute(sql`
      insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id) values (${ctx.orgId}, ${ctx.sub}, 'freela.conta_desligada', 'freela', ${freelaId})`);
}

// ───────────── quem recebeu o convite (porta estreita) ─────────────

export type ConviteVisto = {
  estado: "aberto" | "aceito";
  /** Só o primeiro nome do cadastro. */
  nome: string;
  expira: string;
  aceitoSub: string | null;
  aceitoArroba: string | null;
  marca: { nome: string; cor: string | null; logo: string | null; propria: boolean };
};
export type AberturaConvite = { estado: "ok"; convite: ConviteVisto } | { estado: "morto" | "limite" };

async function limitesDeIp(ipHash: string) {
  const [ip, mortos] = await Promise.all([
    dentroDoLimite(`convite-ip:${ipHash}`, REGRAS.linkIp),
    dentroDoLimite(`convite-morto:${ipHash}`, REGRAS.linkMortoIp),
  ]);
  return ip && mortos;
}

async function naPorta<T>(consulta: ReturnType<typeof sql>): Promise<T | null> {
  return comoLink(async (tx) => ((await tx.execute(consulta)) as unknown as { r: T | null }[])[0]?.r ?? null);
}

export async function abrirConvite(token: string, ip: string): Promise<AberturaConvite> {
  const ipHash = ipHashDoDia(ip);
  if (!(await limitesDeIp(ipHash))) return { estado: "limite" };
  const c = ehTokenConvite(token) ? await naPorta<ConviteVisto>(sql`select maestro.freela_convite_abrir(${hashToken(token)}) as r`) : null;
  if (!c) {
    await registrarTentativa(`convite-ip:${ipHash}`, `convite-morto:${ipHash}`);
    return { estado: "morto" };
  }
  await registrarTentativa(`convite-ip:${ipHash}`);
  return { estado: "ok", convite: c };
}

export type Aceite =
  | { ok: true; arroba: string | null }
  | { ok: false; erro: "morto" | "limite" | "sem_conta" | "conta_em_outro" | "ja_ligado"; mensagem: string; status: number };

export async function aceitarConvite(token: string, quem: Identidade | null, ip: string): Promise<Aceite> {
  const ipHash = ipHashDoDia(ip);
  if (!(await limitesDeIp(ipHash))) return { ok: false, erro: "limite", mensagem: "Muitas tentativas. Espere alguns minutos.", status: 429 };
  if (!quem) return { ok: false, erro: "sem_conta", mensagem: "Entre com a Absolute ZRO primeiro.", status: 401 };
  const r = ehTokenConvite(token)
    ? await naPorta<{ estado: string; arroba?: string | null }>(
        sql`select maestro.freela_convite_aceitar(${hashToken(token)}, ${quem.sub}::uuid, ${quem.arroba}) as r`,
      )
    : null;
  if (!r) {
    await registrarTentativa(`convite-ip:${ipHash}`, `convite-morto:${ipHash}`);
    return { ok: false, erro: "morto", mensagem: "Este convite não está mais ativo.", status: 404 };
  }
  await registrarTentativa(`convite-ip:${ipHash}`);
  if (r.estado === "ok") return { ok: true, arroba: r.arroba ?? null };
  if (r.estado === "conta_em_outro")
    return { ok: false, erro: "conta_em_outro", mensagem: "Sua conta já está no banco de freelas desta produtora.", status: 409 };
  return { ok: false, erro: "ja_ligado", mensagem: "Este convite já foi usado por outra conta.", status: 409 };
}

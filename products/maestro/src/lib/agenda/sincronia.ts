/**
 * Sincronia com o Google Agenda pelo HUB (drizzle/0021, ADR 0026 do HUB). Caixa de saída por pessoa:
 *
 * 1. Gatilhos no banco enfileiram a ref (`evento-<id>`, `card-<id>`) para cada pessoa com a sincronia ligada, na mesma
 *    transação do salvar. Nada aqui roda dentro do salvar.
 * 2. Depois do commit (`after()` nas ações e rotas), `esvaziarFila` pega a vez da pessoa da sessão (até 20 refs, com uma
 *    reserva de 2 min para dois pedidos não fazerem o mesmo), lê cada item COMO A PESSOA (RLS e acesso por cliente) e
 *    decide: ligado + tipo escolhido + visível = PUT (só se o conteúdo mudou, pelo hash); senão, se já foi, DELETE.
 * 3. Falhou: fica na fila com tentativas e espera crescente; o que depende da pessoa (sem conexão, app desligado,
 *    entrar de novo) para a rodada e vira o estado mostrado em Ajustes → Agenda. Nunca desfaz nem trava o salvar.
 * Demonstração não vai (gatilhos e leitura ignoram `demo`/`demo-`). Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { hojeBr, somarDias } from "@/lib/dinheiro";
import { siteUrl } from "@/lib/site";
import { acessoIa } from "@/lib/zro/ia";
import { ESCOPO_AGENDA } from "@/lib/zro/config";
import {
  APP_NO_HUB,
  ehTipoGoogle,
  eventoDoMaestro,
  hashDoCorpo,
  horaLocal,
  naAgendaDoHub,
  prazoDoCard,
  TIPOS_PADRAO,
  type EstadoGoogle,
  type ItemGoogle,
  type TipoGoogle,
} from "./google";

export const LOTE_SINCRONIA = 20;
const RESERVA_MS = 2 * 60_000;
const PAUSA_DA_PESSOA_MS = 15 * 60_000;
/** Espera depois da n-ésima falha: 1, 2, 4… minutos, até 6 h. */
export const esperaDaFalha = (n: number) => Math.min(60_000 * 2 ** Math.max(0, n - 1), 6 * 3600_000);

export type PrefsGoogle = {
  ligado: boolean;
  tipos: TipoGoogle[];
  estado: EstadoGoogle | null;
  estadoEm: string | null;
  enviadoEm: string | null;
  pendentes: number;
};

type Linha = Record<string, unknown>;
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute(q)) as unknown as Linha[];

export async function lerPrefs(ctx: Contexto): Promise<PrefsGoogle> {
  return getBanco().asUser(ctx, async (tx) => {
    const [g] = await linhas(tx, sql`select ligado, tipos, estado, estado_em, enviado_em from maestro.agenda_google where zro_sub = ${ctx.sub}`);
    const [f] = await linhas(tx, sql`select count(*)::int as n from maestro.agenda_google_fila where zro_sub = ${ctx.sub}`);
    return {
      ligado: !!g?.ligado,
      tipos: ((g?.tipos as string[] | undefined) ?? TIPOS_PADRAO).filter(ehTipoGoogle),
      estado: (g?.estado as EstadoGoogle | null) ?? null,
      estadoEm: g?.estado_em ? new Date(g.estado_em as string).toISOString() : null,
      enviadoEm: g?.enviado_em ? new Date(g.enviado_em as string).toISOString() : null,
      pendentes: Number(f?.n ?? 0),
    };
  });
}

/**
 * Liga/desliga e escolhe os tipos. Ligar (ou mudar os tipos) põe na fila tudo o que a pessoa vê de 30 dias atrás a um
 * ano à frente, mais o que já foi (para sair o que não vale mais); desligar põe na fila o que já foi (sai do Google).
 */
export async function salvarPrefs(ctx: Contexto, p: { ligado: boolean; tipos: string[] }, hoje = hojeBr()): Promise<Res> {
  const tipos = [...new Set(p.tipos.filter(ehTipoGoogle))];
  if (p.ligado && !tipos.length) return falha("tipos", "Escolha ao menos um tipo.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await tx.execute(sql`
        insert into maestro.agenda_google (org_id, zro_sub, ligado, tipos) values (${ctx.orgId}, ${ctx.sub}, ${p.ligado}, ${`{${(tipos.length ? tipos : TIPOS_PADRAO).join(",")}}`}::text[])
        on conflict (org_id, zro_sub) do update set ligado = excluded.ligado, tipos = excluded.tipos, atualizado_em = now()`);
      await enfileirarTudo(tx, ctx, p.ligado, hoje);
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id)
        values (${ctx.orgId}, ${ctx.sub}, ${p.ligado ? "agenda_google.ligar" : "agenda_google.desligar"}, 'membro', ${ctx.sub})`);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

async function enfileirarTudo(tx: Tx, ctx: Contexto, ligado: boolean, hoje: string): Promise<void> {
  const de = somarDias(hoje, -30);
  const ate = somarDias(hoje, 365);
  if (ligado) {
    await tx.execute(sql`
      insert into maestro.agenda_google_fila (org_id, zro_sub, ref)
      select ${ctx.orgId}::uuid, ${ctx.sub}::uuid, 'evento-' || e.id from maestro.eventos e
       where not e.demo and coalesce(e.data_fim, e.data) >= ${de}::date and e.data <= ${ate}::date
      union
      select ${ctx.orgId}::uuid, ${ctx.sub}::uuid, 'card-' || k.id from maestro.cards k
       where k.id !~ '^demo-' and k.apagado_em is null and k.prazo is not null and k.coluna <> 'entregue' and left(k.prazo, 10) between ${de} and ${ate}
      on conflict (org_id, zro_sub, ref) do update set tentativas = 0, proxima_em = now(), erro = null`);
  }
  await tx.execute(sql`
    insert into maestro.agenda_google_fila (org_id, zro_sub, ref)
    select org_id, zro_sub, ref from maestro.agenda_google_enviados where zro_sub = ${ctx.sub}
    on conflict (org_id, zro_sub, ref) do update set tentativas = 0, proxima_em = now(), erro = null`);
}

/** "Sincronizar agora": tudo de novo para a fila (o que não mudou não chama o HUB). */
export async function sincronizarTudo(ctx: Contexto, hoje = hojeBr()): Promise<void> {
  await getBanco().asUser(ctx, async (tx) => {
    const [g] = await linhas(tx, sql`select ligado from maestro.agenda_google where zro_sub = ${ctx.sub}`);
    await enfileirarTudo(tx, ctx, !!g?.ligado, hoje);
  });
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** O item da ref como a pessoa vê agora (null = não existe, não vê, é demonstração ou não vai para a agenda). */
export async function itemDaRef(tx: Tx, ref: string, base = siteUrl()): Promise<ItemGoogle | null> {
  const [tipo, ...resto] = ref.split("-");
  const id = resto.join("-");
  if (tipo === "evento") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [e] = await linhas(
      tx,
      sql`
      select e.id, e.tipo, e.titulo, e.data::text as data, e.data_fim::text as "dataFim", to_char(e.hora_ini, 'HH24:MI') as "horaIni",
             to_char(e.hora_fim, 'HH24:MI') as "horaFim", e.local, p.title as projeto
        from maestro.eventos e left join maestro.projects p on p.org_id = e.org_id and p.id = e.projeto_id
       where e.id = ${id} and not e.demo`,
    );
    if (!e) return null;
    const equipe = (await linhas(
      tx,
      sql`
      select f.nome, s.funcao from maestro.escalas s join maestro.freelas f on f.org_id = s.org_id and f.id = s.freela_id
       where s.evento_id = ${id} order by f.nome limit 30`,
    )) as { nome: string; funcao: string }[];
    return eventoDoMaestro(
      {
        id: e.id as string,
        tipo: e.tipo as string,
        titulo: e.titulo as string,
        data: e.data as string,
        dataFim: (e.dataFim as string) ?? null,
        horaIni: (e.horaIni as string) ?? null,
        horaFim: (e.horaFim as string) ?? null,
        local: (e.local as string) ?? null,
        projeto: (e.projeto as string) ?? null,
        equipe,
      },
      base,
    );
  }
  if (tipo === "card") {
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id) || id.startsWith("demo-")) return null;
    const [k] = await linhas(
      tx,
      sql`
      select k.id, coalesce(k.dados ->> 'tema', k.id) as tema, left(k.prazo, 10) as prazo, c.name as cliente
        from maestro.cards k left join maestro.clients c on c.org_id = k.org_id and c.id::text = k.cliente
       where k.id = ${id} and k.apagado_em is null and k.prazo is not null and k.coluna <> 'entregue'`,
    );
    if (!k || !DATA.test(String(k.prazo))) return null;
    return prazoDoCard({ id: k.id as string, tema: String(k.tema), prazo: String(k.prazo), cliente: (k.cliente as string) ?? null }, base);
  }
  return null;
}

export type Rodada = { enviados: number; apagados: number; iguais: number; falhas: number; parou: EstadoGoogle | null };

/** A sessão que esvazia a fila: id (para o token da Absolute ZRO), pessoa e organização. */
export type SessaoDaFila = { id: string; sub: string; orgId: string };

/** Esvazia (um lote d)a fila da pessoa da sessão. Nunca lança: falha vira estado e espera. */
export async function esvaziarFila(s: SessaoDaFila, o: { limite?: number; agora?: number; base?: string } = {}): Promise<Rodada> {
  const ctx: Contexto = { sub: s.sub, orgId: s.orgId };
  const agora = o.agora ?? Date.now();
  const r: Rodada = { enviados: 0, apagados: 0, iguais: 0, falhas: 0, parou: null };
  const banco = getBanco();
  let vez: string[] = [];
  try {
    vez = await banco.asUser(ctx, async (tx) => {
      const l = await linhas(
        tx,
        sql`
        select ref from maestro.agenda_google_fila where zro_sub = ${s.sub} and proxima_em <= ${new Date(agora).toISOString()}::timestamptz
         order by proxima_em, criado_em limit ${o.limite ?? LOTE_SINCRONIA} for update skip locked`,
      );
      const refs = l.map((x) => x.ref as string);
      if (refs.length)
        await tx.execute(sql`
          update maestro.agenda_google_fila set proxima_em = ${new Date(agora + RESERVA_MS).toISOString()}::timestamptz
           where zro_sub = ${s.sub} and ref = any (${`{${refs.join(",")}}`}::text[])`);
      return refs;
    });
  } catch {
    return { ...r, parou: "erro" };
  }
  if (!vez.length) return r;

  const marcarEstado = (estado: EstadoGoogle, enviou: boolean) =>
    banco
      .asUser(ctx, (tx) =>
        tx.execute(sql`
          update maestro.agenda_google set estado = ${estado}, estado_em = now() ${enviou ? sql`, enviado_em = now()` : sql``} where zro_sub = ${s.sub}`),
      )
      .catch(() => undefined);
  const adiar = (refs: string[], ms: number, erro: string, contar: boolean) =>
    banco
      .asUser(ctx, (tx) =>
        tx.execute(sql`
          update maestro.agenda_google_fila
             set proxima_em = ${new Date(agora + ms).toISOString()}::timestamptz, erro = ${erro.slice(0, 60)}
                 ${contar ? sql`, tentativas = tentativas + 1` : sql``}
           where zro_sub = ${s.sub} and ref = any (${`{${refs.join(",")}}`}::text[])`),
      )
      .catch(() => undefined);

  const acesso = await acessoIa(s.id, agora, ESCOPO_AGENDA).catch(() => ({ erro: "rede" as const }));
  if ("erro" in acesso) {
    const estado: EstadoGoogle = acesso.erro === "reconectar" ? "reconectar_zro" : "erro";
    await adiar(vez, acesso.erro === "reconectar" ? PAUSA_DA_PESSOA_MS : esperaDaFalha(1), estado, false);
    await marcarEstado(estado, false);
    return { ...r, parou: estado };
  }

  let prefs: PrefsGoogle;
  try {
    prefs = await lerPrefs(ctx);
  } catch {
    await adiar(vez, esperaDaFalha(1), "erro", false);
    return { ...r, parou: "erro" };
  }

  for (let i = 0; i < vez.length; i++) {
    const ref = vez[i]!;
    try {
      const { item, enviado } = await banco.asUser(ctx, async (tx) => ({
        item: await itemDaRef(tx, ref, o.base),
        enviado:
          ((await linhas(tx, sql`select hash from maestro.agenda_google_enviados where zro_sub = ${s.sub} and ref = ${ref}`))[0]?.hash as string) ?? null,
      }));
      const quer = prefs.ligado && item && prefs.tipos.includes(item.tipo) ? item : null;
      let resp: Awaited<ReturnType<typeof naAgendaDoHub>> | null = null;
      if (quer) {
        const hash = hashDoCorpo(quer.corpo);
        if (hash === enviado) r.iguais++;
        else {
          resp = await naAgendaDoHub(s.id, "PUT", `eventos/${APP_NO_HUB}/${encodeURIComponent(ref)}`, quer.corpo, { token: acesso.at, agora });
          if (resp.ok) {
            r.enviados++;
            await banco.asUser(ctx, (tx) =>
              tx.execute(sql`
                insert into maestro.agenda_google_enviados (org_id, zro_sub, ref, hash) values (${s.orgId}, ${s.sub}, ${ref}, ${hash})
                on conflict (org_id, zro_sub, ref) do update set hash = excluded.hash, enviado_em = now()`),
            );
          }
        }
      } else if (enviado) {
        resp = await naAgendaDoHub(s.id, "DELETE", `eventos/${APP_NO_HUB}/${encodeURIComponent(ref)}`, undefined, { token: acesso.at, agora });
        if (resp.ok) {
          r.apagados++;
          await banco.asUser(ctx, (tx) => tx.execute(sql`delete from maestro.agenda_google_enviados where zro_sub = ${s.sub} and ref = ${ref}`));
        }
      }
      if (resp && !resp.ok) {
        // O que depende da pessoa para a rodada inteira; o resto espera e tenta de novo.
        if (resp.estado !== "erro") {
          await adiar(vez.slice(i), PAUSA_DA_PESSOA_MS, resp.erro, false);
          await marcarEstado(resp.estado, r.enviados + r.apagados > 0);
          return { ...r, parou: resp.estado };
        }
        r.falhas++;
        const [t] = await banco.asUser(ctx, (tx) =>
          linhas(tx, sql`select tentativas from maestro.agenda_google_fila where zro_sub = ${s.sub} and ref = ${ref}`),
        );
        await adiar([ref], esperaDaFalha(Number(t?.tentativas ?? 0) + 1), resp.erro, true);
        continue;
      }
      await banco.asUser(ctx, (tx) => tx.execute(sql`delete from maestro.agenda_google_fila where zro_sub = ${s.sub} and ref = ${ref}`));
    } catch {
      r.falhas++;
      await adiar([ref], esperaDaFalha(2), "erro", true);
    }
  }
  await marcarEstado(r.falhas ? "erro" : "ok", r.enviados + r.apagados > 0);
  return r;
}

export type Ocupado = { inicio: string; fim: string };
export type RespostaOcupado = { estado: EstadoGoogle; ocupado: Ocupado[]; conectar: string };

/** "Ocupado no Google" entre dois dias (inclusive), em Brasília. Sem conexão: o estado, sem lista. */
export async function ocupadoNoGoogle(sessaoId: string, de: string, ate: string): Promise<RespostaOcupado> {
  const ini = horaLocal(de, "00:00");
  const fim = horaLocal(somarDias(ate, 1), "00:00");
  const r = await naAgendaDoHub<{ ocupado: Ocupado[] }>(sessaoId, "GET", `livre-ocupado?${new URLSearchParams({ de: ini, ate: fim })}`);
  if (!r.ok) return { estado: r.estado, ocupado: [], conectar: r.conectar };
  const ocupado = Array.isArray(r.dados.ocupado)
    ? r.dados.ocupado.filter((x) => typeof x?.inicio === "string" && typeof x?.fim === "string").slice(0, 200)
    : [];
  return { estado: "ok", ocupado, conectar: "" };
}

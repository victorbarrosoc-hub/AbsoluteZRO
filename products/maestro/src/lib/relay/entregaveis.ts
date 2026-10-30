/**
 * Entregáveis: "Gerar versões com o Relay" a partir de uma versão do card que está no Drive (contrato "Maestro → Relay"
 * em docs/integration-contracts/relay.md; ADR 0030). O Maestro só pede e acompanha; quem converte é o computador da
 * conta com o SOBEDESCE aberto, que sobe o arquivo novo no Drive e confere o MD5.
 *
 * - Pede pela mesma ponte do Drive (`noSobedesce`: token da pessoa → HUB assina `zro-pedido+jwt` → POST no
 *   SOBEDESCE): `relay.converter` `{ arquivoId, presets, pastaId?, ref: <id da versão>, conta? }`, `relay.pedido`
 *   `{ ids }` e `relay.cancelar` `{ id }`. Idempotente do lado de lá por `ref:preset`; do lado de cá, uma linha por
 *   (versão, preset) em `maestro.entregaveis` (drizzle/0024), gravada como a pessoa (asUser, RLS e acesso por cliente).
 * - Pasta de destino: "05 Entregas" do projeto (a estrutura `Maestro/<Cliente>/<Projeto>/0x…` do `drive.pasta.criar`;
 *   criada se o projeto ainda não tem pasta). Projeto ligado a uma pasta sem "Entregas": a própria pasta do projeto.
 *   Sem projeto, ou se a pessoa escolher: ao lado do original.
 * - "pronto" só quando o SOBEDESCE diz pronto e manda o resultado com o MD5 (o banco também exige).
 * - Sem o SOBEDESCE ou sem o Relay no plano, a folha mostra o porquê e o link; nada é pedido.
 */
import { sql } from "drizzle-orm";
import { temProduto } from "@/lib/auth/acesso";
import type { Sessao } from "@/lib/auth/sessao";
import { getBanco, type Tx } from "@/lib/db/client";
import { podeEscrever } from "@/lib/papeis";
import { HUB_URL } from "@/lib/site";
import { criarEstrutura } from "@/lib/sobedesce/arquivos";
import { noSobedesce, PRODUTO_RELAY, PRODUTO_SOBEDESCE, type Resultado } from "@/lib/sobedesce/ponte";
import { normalizarPresets, ORDEM } from "./escolha";
import { preset as acharPreset } from "./presets.js";

export const STATUS = ["pendente", "convertendo", "pronto", "erro", "cancelado"] as const;
export type StatusEntregavel = (typeof STATUS)[number];
const EM_ANDAMENTO: StatusEntregavel[] = ["pendente", "convertendo"];

export type Entregavel = {
  id: string;
  versao: string;
  preset: string;
  /** O nome do preset ("YouTube 1080p"). */
  nome: string;
  status: StatusEntregavel;
  /** 0–1 enquanto converte. */
  frac: number | null;
  pasta: { id: string; nome: string | null } | null;
  arquivo: { id: string; nome: string | null; tamanho: number | null; md5: string; abrir: string } | null;
  erro: string | null;
  em: string;
};

export type Computador = { aberto_agora: boolean; usado_ha_pouco: boolean };

export type Disponibilidade =
  { ok: true } | { ok: false; erro: "sem_sobedesce" | "sem_relay"; titulo: string; mensagem: string; link: { rotulo: string; href: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_CARD = /^[A-Za-z0-9_-]{4,64}$/;
const ID_DRIVE = /^[A-Za-z0-9_-]{1,200}$/;
const ID_PEDIDO = /^[A-Za-z0-9_.:-]{1,120}$/;

type Falha = { ok: false; status: number; erro: string; mensagem: string };
const falha = (status: number, erro: string, mensagem: string): Falha => ({ ok: false, status, erro, mensagem });

/** O link para abrir o arquivo no Drive (só o formato do Google; o id já foi conferido). */
export const linkDoDrive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/** Quem pode pedir: SOBEDESCE (fila, Drive e ffmpeg) e o Relay no plano. Sem um deles, o porquê e o caminho. */
export function disponibilidade(sessao: Sessao): Disponibilidade {
  if (!temProduto(sessao, PRODUTO_SOBEDESCE))
    return {
      ok: false,
      erro: "sem_sobedesce",
      titulo: "Gerar versões usa o SOBEDESCE",
      mensagem: "O computador com o SOBEDESCE converte e sobe no Drive. Ele não está no plano desta organização.",
      link: { rotulo: "Ver planos", href: `${HUB_URL}/planos` },
    };
  if (!temProduto(sessao, PRODUTO_RELAY))
    return {
      ok: false,
      erro: "sem_relay",
      titulo: "O Relay ainda não está liberado",
      mensagem: "As versões de entrega são do Relay, grátis em todo plano quando abrir para a sua conta.",
      link: { rotulo: "Conhecer o Relay", href: "https://relay.absolutezro.com" },
    };
  return { ok: true };
}

// ───────────── leitura ─────────────

type Linha = {
  id: string;
  versao: string;
  preset: string;
  pedido_id: string | null;
  status: StatusEntregavel;
  frac: string | number | null;
  pasta_id: string | null;
  pasta_nome: string | null;
  arquivo_id: string | null;
  arquivo_nome: string | null;
  tamanho: string | number | null;
  md5: string | null;
  erro: string | null;
  em: Date | string;
};

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));

function paraTela(l: Linha): Entregavel {
  return {
    id: l.id,
    versao: l.versao,
    preset: l.preset,
    nome: acharPreset(l.preset)?.nome ?? l.preset,
    status: l.status,
    frac: l.frac === null ? null : Number(l.frac),
    pasta: l.pasta_id ? { id: l.pasta_id, nome: l.pasta_nome } : null,
    arquivo:
      l.status === "pronto" && l.arquivo_id && l.md5
        ? { id: l.arquivo_id, nome: l.arquivo_nome, tamanho: l.tamanho === null ? null : Number(l.tamanho), md5: l.md5, abrir: linkDoDrive(l.arquivo_id) }
        : null,
    erro: l.erro,
    em: iso(l.em),
  };
}

const SELECT = sql`select e.id, e.versao_id as versao, e.preset, e.pedido_id, e.status, e.frac, e.pasta_id, e.pasta_nome, e.arquivo_id,
       e.arquivo_nome, e.tamanho, e.md5, e.erro, e.criado_em as em from maestro.entregaveis e`;

/** Os entregáveis do card, na ordem da folha (o primeiro pedido de cada versão define a vez dela). */
async function linhasDoCard(tx: Tx, cardId: string): Promise<Linha[]> {
  const linhas = [...((await tx.execute(sql`${SELECT} where e.card_id = ${cardId} order by e.criado_em`)) as unknown as Linha[])];
  const ordem = ORDEM();
  const pos = (p: string) => ordem.indexOf(p) + 1 || 999;
  const vez = new Map<string, number>();
  linhas.forEach((l, i) => vez.has(l.versao) || vez.set(l.versao, i));
  return linhas.sort((a, b) => vez.get(a.versao)! - vez.get(b.versao)! || pos(a.preset) - pos(b.preset));
}

// ───────────── o que a SOBEDESCE devolve ─────────────

type PedidoRelay = {
  id: string;
  preset: string;
  ref?: string;
  status: StatusEntregavel;
  frac?: number | null;
  resultado?: { arquivoId?: string; nome?: string; tamanho?: number; md5?: string; pastaId?: string } | null;
  erro?: string | null;
};

/** Confere um pedido vindo do SOBEDESCE; o que não bate vira null (nunca grava forma estranha). */
export function pedidoConferido(p: unknown): PedidoRelay | null {
  const o = p as Record<string, unknown> | null;
  if (!o || typeof o.id !== "string" || !ID_PEDIDO.test(o.id) || typeof o.preset !== "string") return null;
  if (!STATUS.includes(o.status as StatusEntregavel)) return null;
  const frac = typeof o.frac === "number" && Number.isFinite(o.frac) ? Math.min(1, Math.max(0, o.frac)) : null;
  const r = o.resultado as Record<string, unknown> | null | undefined;
  const resultado =
    r && typeof r.arquivoId === "string" && ID_DRIVE.test(r.arquivoId) && typeof r.md5 === "string" && /^[0-9a-f]{32}$/i.test(r.md5)
      ? {
          arquivoId: r.arquivoId,
          md5: r.md5.toLowerCase(),
          nome: typeof r.nome === "string" ? r.nome.slice(0, 300) : undefined,
          tamanho: typeof r.tamanho === "number" && r.tamanho >= 0 ? Math.round(r.tamanho) : undefined,
          pastaId: typeof r.pastaId === "string" && ID_DRIVE.test(r.pastaId) ? r.pastaId : undefined,
        }
      : null;
  let status = o.status as StatusEntregavel;
  // "pronto" sem o resultado conferido não é pronto: segue convertendo até o SOBEDESCE mandar o arquivo e o MD5.
  if (status === "pronto" && !resultado) status = "convertendo";
  const erro = typeof o.erro === "string" && o.erro.trim() ? o.erro.trim().slice(0, 300) : null;
  return { id: o.id, preset: o.preset, ref: typeof o.ref === "string" ? o.ref : undefined, status, frac, resultado, erro };
}

async function gravarPedido(tx: Tx, entregavelId: string, p: PedidoRelay) {
  const r = p.resultado;
  await tx.execute(sql`
    update maestro.entregaveis set
      pedido_id = ${p.id}, status = ${p.status},
      frac = ${p.status === "convertendo" ? p.frac : p.status === "pronto" ? 1 : null},
      arquivo_id = ${r?.arquivoId ?? null}, arquivo_nome = ${r?.nome ?? null}, tamanho = ${r?.tamanho ?? null}, md5 = ${r?.md5 ?? null},
      resultado_pasta_id = ${r?.pastaId ?? null},
      erro = ${p.status === "erro" ? (p.erro ?? "A conversão falhou no computador.") : null},
      atualizado_em = now()
    where id = ${entregavelId}::uuid`);
}

// ───────────── a versão ─────────────

export type VersaoRelay = {
  id: string;
  card: string;
  n: number;
  titulo: string | null;
  driveId: string;
  aprovada: boolean;
  projeto: { id: string; codigo: string; titulo: string; cliente: string; pasta: { id: string; nome: string } | null } | null;
};

/** A versão do Drive, como a pessoa vê (RLS e acesso por cliente). Outra fonte ou apagada: null. */
async function versaoDoDrive(tx: Tx, versaoId: string): Promise<VersaoRelay | null> {
  const [v] = (await tx.execute(sql`
    select v.id, v.card_id as card, v.n, v.titulo, v.drive_file_id as "driveId",
           (exists (select 1 from maestro.approvals a where a.org_id = v.org_id and a.card_id = v.card_id and a.decision = 'aprovado' and a.versao_id = v.id)
            or (k.coluna in ('aprovado', 'agendado', 'entregue')
                and v.n = (select max(v2.n) from maestro.versoes v2 where v2.org_id = v.org_id and v2.card_id = v.card_id and v2.apagado_em is null))) as aprovada,
           case when p.id is null then null else jsonb_build_object(
             'id', p.id, 'codigo', p.code, 'titulo', p.title, 'cliente', coalesce(c.name, 'Sem cliente'),
             'pasta', case when p.drive_folder_id is null then null else jsonb_build_object('id', p.drive_folder_id, 'nome', coalesce(p.drive_folder_nome, 'Pasta do projeto')) end
           ) end as projeto
      from maestro.versoes v
      join maestro.cards k on k.org_id = v.org_id and k.id = v.card_id and k.apagado_em is null
      left join maestro.projects p on p.org_id = v.org_id and p.id::text = k.dados ->> 'projeto' and p.deleted_at is null
      left join maestro.clients c on c.org_id = p.org_id and c.id = p.client_id
     where v.id = ${versaoId}::uuid and v.apagado_em is null and v.fonte = 'drive' and v.drive_file_id is not null`)) as unknown as VersaoRelay[];
  return v ?? null;
}

// ───────────── a pasta de destino ─────────────

export type Destino =
  /** "05 Entregas" já existe (`id`) ou vai ser criada com a estrutura do projeto (`id` null). */
  | { tipo: "entregas"; id: string | null; nome: string; caminho: string }
  /** O projeto está ligado a uma pasta sem "Entregas": vai para ela. */
  | { tipo: "projeto"; id: string; nome: string; caminho: string }
  /** Sem projeto: só ao lado do original. */
  | { tipo: "original"; id: null; nome: string; caminho: string };

const ENTREGAS = /^(0?5\s*[-·.]?\s*)?entregas$/i;

type ItemLista = { id: string; nome: string; pasta: boolean };

/** Acha a pasta de entrega da versão (lista a pasta do projeto pela ponte; nada é criado aqui). */
async function destinoDaVersao(sessao: Sessao, v: VersaoRelay): Promise<Resultado<Destino>> {
  const p = v.projeto;
  if (!p) return { ok: true, dados: { tipo: "original", id: null, nome: "Ao lado do original", caminho: "A pasta do arquivo no Drive" } };
  const caminho = `Maestro/${p.cliente}/${p.codigo} ${p.titulo}`;
  if (!p.pasta) return { ok: true, dados: { tipo: "entregas", id: null, nome: "05 Entregas", caminho } };
  const r = await noSobedesce<{ itens?: ItemLista[] }>(sessao, "drive.listar", { pasta: p.pasta.id });
  if (!r.ok) return r;
  const achou = (r.dados.itens ?? []).find((i) => i?.pasta && typeof i.id === "string" && ID_DRIVE.test(i.id) && ENTREGAS.test(String(i.nome).trim()));
  return {
    ok: true,
    dados: achou
      ? { tipo: "entregas", id: achou.id, nome: String(achou.nome).slice(0, 200), caminho: p.pasta.nome }
      : { tipo: "projeto", id: p.pasta.id, nome: p.pasta.nome, caminho: "Pasta do projeto" },
  };
}

// ───────────── a folha ─────────────

export type Preparo = {
  versao: VersaoRelay;
  disponivel: Disponibilidade;
  podeGerar: boolean;
  destino: Destino | null;
  /** O Drive não respondeu ao achar a pasta: a folha diz e oferece "ao lado do original". */
  avisoDestino: string | null;
  entregaveis: Entregavel[];
};

/** O que a folha "Gerar versões" precisa: a versão, se dá para pedir, a pasta de entrega e o que já foi pedido. */
export async function prepararRelay(sessao: Sessao, versaoId: string): Promise<Resultado<Preparo>> {
  if (!UUID.test(versaoId)) return falha(400, "formato", "Versão inválida.");
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const lido = await getBanco().asUser(ctx, async (tx) => {
    const v = await versaoDoDrive(tx, versaoId);
    return v ? { v, linhas: (await linhasDoCard(tx, v.card)).filter((l) => l.versao === v.id) } : null;
  });
  if (!lido) return falha(404, "nao_existe", "Esta versão não está no Drive (ou não existe mais).");
  const disponivel = disponibilidade(sessao);
  const podeGerar = disponivel.ok && podeEscrever(sessao.papel);
  let destino: Destino | null = null;
  let avisoDestino: string | null = null;
  if (podeGerar) {
    const d = await destinoDaVersao(sessao, lido.v);
    if (d.ok) destino = d.dados;
    else avisoDestino = d.mensagem;
  }
  return { ok: true, dados: { versao: lido.v, disponivel, podeGerar, destino, avisoDestino, entregaveis: lido.linhas.map(paraTela) } };
}

/** "05 Entregas" na hora de pedir: a que existe, a pasta do projeto, ou cria a estrutura (projeto sem pasta). */
async function pastaParaPedir(sessao: Sessao, v: VersaoRelay, conta: string | null): Promise<Resultado<{ id: string; nome: string } | null>> {
  const d = await destinoDaVersao(sessao, v);
  if (!d.ok) return d;
  if (d.dados.tipo === "original") return { ok: true, dados: null };
  if (d.dados.id) return { ok: true, dados: { id: d.dados.id, nome: d.dados.nome } };
  const e = await criarEstrutura(sessao, v.projeto!.id, conta);
  if (!e.ok) return e;
  const sub = e.dados.subpastas.find((s) => ENTREGAS.test(s.nome.trim()));
  return { ok: true, dados: sub ? { id: sub.id, nome: sub.nome } : { id: e.dados.pasta.id, nome: e.dados.pasta.nome } };
}

export type Pedir = { versaoId: string; presets: unknown; destino: "entregas" | "original"; conta?: string | null };

/** "Gerar N versões": pede ao SOBEDESCE e grava uma linha por preset (a mesma linha se já havia: idempotente). */
export async function gerarVersoes(sessao: Sessao, e: Pedir): Promise<Resultado<{ entregaveis: Entregavel[]; computador: Computador | null }>> {
  const disp = disponibilidade(sessao);
  if (!disp.ok) return falha(403, disp.erro, disp.mensagem);
  if (!podeEscrever(sessao.papel)) return falha(403, "sem_permissao", "Seu papel nesta organização só lê.");
  if (!UUID.test(e.versaoId)) return falha(400, "formato", "Versão inválida.");
  const presets = normalizarPresets(e.presets);
  if (!presets) return falha(400, "presets", "Escolha de 1 a 8 destinos da lista.");
  const conta = typeof e.conta === "string" && /^[A-Za-z0-9_.@-]{1,64}$/.test(e.conta) ? e.conta : null;
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const v = await getBanco().asUser(ctx, (tx) => versaoDoDrive(tx, e.versaoId));
  if (!v) return falha(404, "nao_existe", "Esta versão não está no Drive (ou não existe mais).");

  const pasta = e.destino === "original" ? ({ ok: true, dados: null } as const) : await pastaParaPedir(sessao, v, conta);
  if (!pasta.ok) return pasta;

  const r = await noSobedesce<{ pedidos?: unknown[] }>(sessao, "relay.converter", {
    arquivoId: v.driveId,
    presets,
    ...(pasta.dados ? { pastaId: pasta.dados.id } : {}),
    ref: v.id,
    ...(conta ? { conta } : {}),
  });
  if (!r.ok) return r;
  const vindos = (r.dados.pedidos ?? []).map(pedidoConferido).filter((p): p is PedidoRelay => !!p && presets.includes(p.preset));
  if (!vindos.length) return falha(502, "sobedesce", "O SOBEDESCE não confirmou os pedidos. Tente de novo.");

  // O estado completo (resultado e MD5 de um pedido que já estava pronto) vem do relay.pedido; sem ele, o da criação.
  const lidos = await noSobedesce<{ pedidos?: unknown[]; computador?: Computador }>(sessao, "relay.pedido", { ids: vindos.map((p) => p.id) });
  const porId = new Map(vindos.map((p) => [p.id, p]));
  if (lidos.ok) for (const p of (lidos.dados.pedidos ?? []).map(pedidoConferido)) if (p && porId.has(p.id)) porId.set(p.id, p);

  const linhas = await getBanco().asUser(ctx, async (tx) => {
    for (const p of porId.values()) {
      const [l] = (await tx.execute(sql`
        insert into maestro.entregaveis (org_id, card_id, versao_id, preset, pasta_id, pasta_nome, criado_por)
        values (${sessao.orgId}::uuid, ${v.card}, ${v.id}::uuid, ${p.preset}, ${pasta.dados?.id ?? null}, ${pasta.dados?.nome ?? null}, ${sessao.sub}::uuid)
        on conflict (org_id, versao_id, preset) do update
          set pasta_id = excluded.pasta_id, pasta_nome = excluded.pasta_nome, atualizado_em = now()
        returning id`)) as unknown as { id: string }[];
      await gravarPedido(tx, l.id, p);
    }
    await tx.execute(
      sql`insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata) values (${sessao.orgId}, ${sessao.sub}, 'relay.converter', 'versao', ${v.id}, ${JSON.stringify({ presets, pasta: pasta.dados?.id ?? null })}::jsonb)`,
    );
    return (await linhasDoCard(tx, v.card)).filter((l) => l.versao === v.id);
  });
  return { ok: true, dados: { entregaveis: linhas.map(paraTela), computador: lidos.ok ? computadorConferido(lidos.dados.computador) : null } };
}

const computadorConferido = (c: unknown): Computador | null => {
  const o = c as Record<string, unknown> | null | undefined;
  return o && typeof o.aberto_agora === "boolean" ? { aberto_agora: o.aberto_agora, usado_ha_pouco: o.usado_ha_pouco === true } : null;
};

export type Andamento = { entregaveis: Entregavel[]; computador: Computador | null; aviso: string | null };

/**
 * Os entregáveis de um card e, com `acompanhar` (a ficha ou o lote abertos e à vista), o andamento dos que ainda não
 * terminaram, lido no SOBEDESCE e guardado. Quem só lê vê o que foi guardado (não grava).
 */
export async function entregaveisDoCard(sessao: Sessao, cardId: string, acompanhar = false): Promise<Andamento> {
  if (!ID_CARD.test(cardId)) return { entregaveis: [], computador: null, aviso: null };
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const linhas = await getBanco().asUser(ctx, (tx) => linhasDoCard(tx, cardId));
  const abertos = linhas.filter((l) => EM_ANDAMENTO.includes(l.status) && l.pedido_id);
  if (!acompanhar || !abertos.length || !disponibilidade(sessao).ok || !podeEscrever(sessao.papel))
    return { entregaveis: linhas.map(paraTela), computador: null, aviso: null };
  const r = await noSobedesce<{ pedidos?: unknown[]; computador?: Computador }>(sessao, "relay.pedido", { ids: abertos.slice(0, 50).map((l) => l.pedido_id!) });
  if (!r.ok) return { entregaveis: linhas.map(paraTela), computador: null, aviso: r.mensagem };
  const porPedido = new Map(abertos.map((l) => [l.pedido_id!, l]));
  const novas = await getBanco().asUser(ctx, async (tx) => {
    for (const p of (r.dados.pedidos ?? []).map(pedidoConferido)) {
      const l = p && porPedido.get(p.id);
      if (l && l.preset === p.preset) await gravarPedido(tx, l.id, p);
    }
    return linhasDoCard(tx, cardId);
  });
  return { entregaveis: novas.map(paraTela), computador: computadorConferido(r.dados.computador), aviso: null };
}

/** Cancelar um item que ainda não terminou. O que já terminou do outro lado fica com o estado de lá. */
export async function cancelarEntregavel(sessao: Sessao, entregavelId: string): Promise<Resultado<Entregavel>> {
  const disp = disponibilidade(sessao);
  if (!disp.ok) return falha(403, disp.erro, disp.mensagem);
  if (!podeEscrever(sessao.papel)) return falha(403, "sem_permissao", "Seu papel nesta organização só lê.");
  if (!UUID.test(entregavelId)) return falha(400, "formato", "Item inválido.");
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [l] = await getBanco().asUser(ctx, async (tx) => [...((await tx.execute(sql`${SELECT} where e.id = ${entregavelId}::uuid`)) as unknown as Linha[])]);
  if (!l) return falha(404, "nao_existe", "Este item não existe mais.");
  if (!EM_ANDAMENTO.includes(l.status) || !l.pedido_id) return { ok: true, dados: paraTela(l) };
  const r = await noSobedesce<{ cancelado?: boolean; ja_terminado?: boolean }>(sessao, "relay.cancelar", { id: l.pedido_id });
  if (!r.ok) return r;
  let p: PedidoRelay | null = null;
  if (r.dados.ja_terminado) {
    const lido = await noSobedesce<{ pedidos?: unknown[] }>(sessao, "relay.pedido", { ids: [l.pedido_id] });
    if (lido.ok) p = (lido.dados.pedidos ?? []).map(pedidoConferido).find((x) => x?.id === l.pedido_id) ?? null;
  } else p = { id: l.pedido_id, preset: l.preset, status: "cancelado" };
  const final = await getBanco().asUser(ctx, async (tx) => {
    if (p) await gravarPedido(tx, l.id, p);
    return [...((await tx.execute(sql`${SELECT} where e.id = ${entregavelId}::uuid`)) as unknown as Linha[])][0];
  });
  return { ok: true, dados: paraTela(final) };
}

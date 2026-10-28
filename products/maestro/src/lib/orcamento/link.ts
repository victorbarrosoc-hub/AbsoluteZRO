/**
 * O orçamento para o cliente (`/o/<token>`, plano v2 §6.3 e §4.4).
 *
 * Equipe (`asUser`, só admin e gestão pelo RLS de links_publicos): "Enviar link" combina as parcelas (1 a 3, as mesmas
 * regras do aprovar), marca o orçamento como enviado e gera o link, que vale até o fim da validade (um ativo por
 * orçamento; gerar de novo troca; links de outras versões do mesmo número caem).
 * Cliente (porta estreita, drizzle/0012): abrir (o timbrado, sem custo nem margem), aceitar (nome e aceite, uma vez:
 * projeto, cliente se novo e parcelas a receber) e pedir ajuste. Limites por IP e por link; link morto = tela neutra.
 * Sem "server-only": os testes chamam direto.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { abrir, hashToken, novoToken, selar } from "@/lib/auth/cripto";
import { dentroDoLimite, registrarTentativa, REGRAS } from "@/lib/auth/limite";
import { ehUuid, falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { hojeBr, somarDias } from "@/lib/dinheiro";
import { ehToken } from "@/lib/revisao/link";
import { contextoTokenPublico } from "@/lib/pedidos/equipe";
import type { MarcaPublica } from "@/lib/pedidos/formulario";
import { chamarPorta, ipDentroDoLimite, ipHashDoDia, marcarMorto, whatsappDaProdutora } from "@/lib/publico/porta";
import { codigoOrcamento, parcelasPadrao, statusEfetivo, totais, totalDaLinha, type Parcela, type StatusEfetivo } from "./motor";
import type { DocumentoOrcamento } from "./orcamentos";

/* ───────────── equipe ───────────── */

export type LinkDoOrcamento = { token: string | null; expira: string; usos: number; usadoEm: string | null };

export async function lerLinkDoOrcamento(ctx: Contexto, orcamentoId: string): Promise<LinkDoOrcamento | null> {
  if (!ehUuid(orcamentoId)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [l] = (await tx.execute(sql`
      select id, token_enc, expira_em, uses, last_used_at from maestro.links_publicos
       where tipo = 'orcamento' and orcamento_id = ${orcamentoId} and revogado_em is null and expira_em > now() limit 1`)) as unknown as Record<
      string,
      unknown
    >[];
    if (!l) return null;
    let token: string | null = null;
    try {
      token = l.token_enc ? abrir(l.token_enc as string, contextoTokenPublico(l.id as string)) : null;
    } catch {
      token = null;
    }
    return {
      token,
      expira: new Date(l.expira_em as string).toISOString(),
      usos: Number(l.uses),
      usadoEm: l.last_used_at ? new Date(l.last_used_at as string).toISOString() : null,
    };
  });
}

/** Gera (ou troca) o link do orçamento, com as parcelas combinadas. Rascunho vira enviado. */
export async function gerarLinkDoOrcamento(ctx: Contexto, orcamentoId: string, nParcelas: number, hoje = hojeBr()): Promise<Res<{ token: string }>> {
  if (!ehUuid(orcamentoId)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, (tx) => gerarLinkDoOrcamentoNaTx(tx, ctx, orcamentoId, nParcelas, hoje));
  } catch (e) {
    return traduzirPg(e);
  }
}

/** O mesmo, dentro de uma transação já aberta como a pessoa (a demonstração usa). */
export async function gerarLinkDoOrcamentoNaTx(
  tx: Tx,
  ctx: Contexto,
  orcamentoId: string,
  nParcelas: number,
  hoje = hojeBr(),
): Promise<Res<{ token: string }>> {
  const [q] = (await tx.execute(sql`
    select id, numero, versao, status, validade::text as validade, desconto_cents from maestro.orcamentos where id = ${orcamentoId} for update`)) as unknown as {
    id: string;
    numero: string;
    versao: number;
    status: string;
    validade: string | null;
    desconto_cents: string;
  }[];
  if (!q) return falha("nao_existe", "Esse orçamento não existe.");
  if (q.status !== "rascunho" && q.status !== "enviado") return falha("status", "Só rascunho ou enviado vão por link.");
  if (q.validade && q.validade < hoje) return falha("vencido", "A validade já passou. Mude a validade antes de enviar.");
  const [mais] = (await tx.execute(sql`select 1 from maestro.orcamentos where numero = ${q.numero} and versao > ${q.versao} limit 1`)) as unknown as unknown[];
  if (mais) return falha("versao", "Há uma versão mais nova deste orçamento. Envie a mais nova.");
  const itens = (await tx.execute(sql`select quantidade, preco_cents from maestro.orcamento_itens where orcamento_id = ${orcamentoId}`)) as unknown as {
    quantidade: string;
    preco_cents: string;
  }[];
  const t = totais(
    itens.map((i) => ({ quantidade: Number(i.quantidade), precoCents: Number(i.preco_cents) })),
    Number(q.desconto_cents),
  );
  if (t.total <= 0) return falha("sem_valor", "O orçamento está sem valor. Adicione os itens antes de enviar.");
  const n = Math.min(3, Math.max(1, Math.round(Number(nParcelas) || 1)));
  const parcelas = parcelasPadrao(t.total, n, hoje);
  const token = novoToken();
  const id = randomUUID();
  // Primeiro o link (só admin e gestão passam pelo RLS); um erro aqui desfaz tudo.
  await tx.execute(sql`
    update maestro.links_publicos set revogado_em = now(), revogado_por = ${ctx.sub}
     where tipo = 'orcamento' and revogado_em is null
       and orcamento_id in (select o.id from maestro.orcamentos o where o.numero = ${q.numero})`);
  await tx.execute(sql`
    insert into maestro.links_publicos (id, org_id, tipo, orcamento_id, token_hash, token_enc, expira_em, created_by)
    values (${id}, ${ctx.orgId}, 'orcamento', ${orcamentoId}, ${hashToken(token)}, ${selar(token, contextoTokenPublico(id))},
            greatest(${q.validade ? somarDias(q.validade, 1) : somarDias(hoje, 31)}::date::timestamptz, now() + interval '1 day'), ${ctx.sub})`);
  await tx.execute(sql`
    update maestro.orcamentos set status = 'enviado', enviado_em = coalesce(enviado_em, now()), parcelas = ${JSON.stringify(parcelas)}::jsonb, retorno = null
     where id = ${orcamentoId}`);
  await tx.execute(sql`
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (${ctx.orgId}, ${ctx.sub}, 'orcamento.link_criar', 'orcamento', ${orcamentoId}, ${JSON.stringify({ link: id, parcelas: n })}::jsonb)`);
  return { ok: true as const, token };
}

export async function revogarLinkDoOrcamento(ctx: Contexto, orcamentoId: string): Promise<Res> {
  if (!ehUuid(orcamentoId)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.links_publicos set revogado_em = now(), revogado_por = ${ctx.sub}
         where tipo = 'orcamento' and orcamento_id = ${orcamentoId} and revogado_em is null returning id`);
      if (!r.length) return falha("sem_link", "Esse orçamento não tem link ativo, ou seu papel não pode revogar.");
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'orcamento.link_revogar', 'orcamento', ${orcamentoId}, '{}'::jsonb)`);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/* ───────────── cliente ───────────── */

type Bruto = {
  marca: MarcaPublica;
  empresa: { razao: string | null; instagram: string | null; site: string | null; fechamento: string | null };
  orcamento: {
    numero: string;
    versao: number;
    titulo: string;
    status: "enviado" | "aprovado";
    emissao: string;
    validade: string | null;
    periodo: string | null;
    escopo: string | null;
    pagamento: string | null;
    condicoes: string | null;
    desconto: number;
    parcelas: Parcela[];
    aceite: { nome: string; em: string } | null;
    retorno: { tipo: "ajuste"; nome: string; texto: string; em: string } | null;
    hoje: string;
  };
  para: { nome: string; contato: string | null; cidade: string | null; documento: string | null } | null;
  pedido: { nome: string; contato: string | null } | null;
  itens: { descricao: string; detalhe: string | null; quantidade: number | string; unidade: string | null; preco: number | string }[];
};

export type OrcamentoDoCliente = {
  doc: DocumentoOrcamento;
  marca: MarcaPublica;
  status: StatusEfetivo;
  parcelas: Parcela[];
  aceite: { nome: string; em: string } | null;
  retorno: { nome: string; texto: string; em: string } | null;
  whatsapp: string | null;
};

export type AberturaOrcamento = { estado: "morto" } | { estado: "limite" } | { estado: "ok"; dados: OrcamentoDoCliente };

function paraTela(b: Bruto): OrcamentoDoCliente {
  const o = b.orcamento;
  const itens = b.itens.map((i) => ({
    descricao: i.descricao,
    detalhe: i.detalhe,
    quantidade: Number(i.quantidade),
    unidade: i.unidade,
    precoCents: Number(i.preco),
  }));
  const t = totais(itens, Number(o.desconto));
  const status = statusEfetivo({ status: o.status, validade: o.validade }, o.hoje);
  const para = b.para ?? (b.pedido ? { nome: b.pedido.nome, contato: b.pedido.contato, cidade: null, documento: null } : null);
  const codigo = codigoOrcamento(o.numero, o.versao);
  return {
    marca: b.marca,
    status,
    parcelas: o.parcelas ?? [],
    aceite: o.aceite,
    retorno: o.retorno ? { nome: o.retorno.nome, texto: o.retorno.texto, em: o.retorno.em } : null,
    whatsapp: whatsappDaProdutora(b.marca.telefone, `Olá! Sobre o orçamento ${codigo}.`),
    doc: {
      codigo,
      numero: o.numero,
      versao: o.versao,
      titulo: o.titulo,
      periodo: o.periodo,
      escopo: o.escopo,
      pagamento: o.pagamento,
      condicoes: o.condicoes,
      emissao: o.emissao,
      validade: o.validade,
      status,
      para,
      itens: itens.map((i) => ({ ...i, totalCents: totalDaLinha(i) })),
      subtotal: t.subtotal,
      desconto: t.desconto,
      total: t.total,
      empresa: {
        fantasia: b.marca.nome,
        razao: b.empresa.razao,
        cnpj: b.marca.cnpj ?? null,
        endereco: b.marca.endereco ?? null,
        email: b.marca.email,
        telefone: b.marca.telefone,
        instagram: b.empresa.instagram,
        site: b.empresa.site,
        cidade: null,
        uf: null,
        lat: null,
        lon: null,
        validadeDias: 15,
        condicoes: null,
        fechamento: b.empresa.fechamento,
        logo: b.marca.logo,
        cor: b.marca.cor,
        assinatura: b.marca.assinatura,
        nomeOrg: b.marca.nome,
      },
    },
  };
}

export async function abrirOrcamentoDoCliente(token: string, ip: string): Promise<AberturaOrcamento> {
  const ipHash = ipHashDoDia(ip);
  if (!(await ipDentroDoLimite(ipHash))) return { estado: "limite" };
  if (!ehToken(token)) {
    await marcarMorto(ipHash);
    return { estado: "morto" };
  }
  const th = hashToken(token);
  if (!(await dentroDoLimite(`orcamento-abrir:${th}`, REGRAS.orcamentoAbrir))) return { estado: "limite" };
  const b = (await chamarPorta("orçamento público", sql`select maestro.orcamento_link_abrir(${th}) as r`)) as Bruto | null;
  if (!b) {
    await marcarMorto(ipHash);
    return { estado: "morto" };
  }
  await registrarTentativa(`link-ip:${ipHash}`, `orcamento-abrir:${th}`);
  return { estado: "ok", dados: paraTela(b) };
}

export type ResultadoDecisao = { ok: true; repetido: boolean; nome: string } | { ok: false; status: number; erro: string; mensagem: string };

const MENSAGENS: Record<string, [number, string]> = {
  link: [404, "Este link não está mais ativo."],
  status: [409, "Este orçamento já foi decidido ou voltou para a produtora."],
  vencido: [409, "A validade deste orçamento passou. Peça uma versão nova."],
  versao_nova: [409, "Há uma versão mais nova deste orçamento. Peça o link novo."],
  nome: [400, "Escreva seu nome."],
  aceite: [400, "Marque o aceite para confirmar."],
  texto: [400, "Diga o que ajustar (até 2.000 caracteres)."],
  sem_valor: [409, "Este orçamento está sem valor. Fale com a produtora."],
  parcelas: [409, "As parcelas não fecham com o total. Fale com a produtora."],
};
const erroDe = (e: string) => {
  const [status, mensagem] = MENSAGENS[e] ?? [400, "Não deu certo."];
  return { ok: false as const, status, erro: e, mensagem };
};

async function preparar(token: string, ip: string): Promise<{ th: string; ipHash: string } | ResultadoDecisao> {
  const ipHash = ipHashDoDia(ip);
  if (!(await ipDentroDoLimite(ipHash))) return { ok: false, status: 429, erro: "limite", mensagem: "Muitas tentativas. Espere alguns minutos." };
  if (!ehToken(token)) {
    await marcarMorto(ipHash);
    return erroDe("link");
  }
  const th = hashToken(token);
  if (!(await dentroDoLimite(`orcamento-decidir:${th}`, REGRAS.orcamentoDecidir)))
    return { ok: false, status: 429, erro: "limite", mensagem: "Muitas tentativas. Espere alguns minutos." };
  await registrarTentativa(`orcamento-decidir:${th}`, `link-ip:${ipHash}`);
  return { th, ipHash };
}

/** "Aceitar": nome e aceite. Uma vez só; repetir devolve o mesmo resultado. */
export async function aceitarOrcamento(token: string, corpo: Record<string, unknown>, ip: string, userAgent: string | null): Promise<ResultadoDecisao> {
  const p = await preparar(token, ip);
  if ("ok" in p) return p;
  const dados = {
    nome: typeof corpo.nome === "string" ? corpo.nome.slice(0, 200) : "",
    aceite: corpo.aceite === true,
    ip: p.ipHash,
    ua: (userAgent ?? "").slice(0, 300),
  };
  const r = (await chamarPorta("aceite do orçamento", sql`select maestro.orcamento_link_aceitar(${p.th}, ${JSON.stringify(dados)}::jsonb) as r`)) as
    { ok: true; repetido: boolean; nome: string } | { erro: string };
  if ("erro" in r) {
    if (r.erro === "link") await marcarMorto(p.ipHash);
    return erroDe(r.erro);
  }
  return { ok: true, repetido: r.repetido, nome: r.nome };
}

export async function pedirAjusteDoOrcamento(token: string, corpo: Record<string, unknown>, ip: string): Promise<ResultadoDecisao> {
  const p = await preparar(token, ip);
  if ("ok" in p) return p;
  const dados = {
    nome: typeof corpo.nome === "string" ? corpo.nome.slice(0, 200) : "",
    texto: typeof corpo.texto === "string" ? corpo.texto.slice(0, 4000) : "",
  };
  const r = (await chamarPorta("ajuste do orçamento", sql`select maestro.orcamento_link_ajuste(${p.th}, ${JSON.stringify(dados)}::jsonb) as r`)) as
    { ok: true } | { erro: string };
  if ("erro" in r) return erroDe(r.erro);
  return { ok: true, repetido: false, nome: dados.nome };
}

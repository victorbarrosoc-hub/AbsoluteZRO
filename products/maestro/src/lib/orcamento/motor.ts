/**
 * Motor do orçamento (plano v2 §6.1 e §6.3). Contas e regras do orçamento do ZRO (src/lib/services/quotes.ts:
 * quoteTotals, marginHealth, defaultInstallments, validade, condições) com a tabela de preços nova: faixas por
 * quantidade, multiplicadores por nicho e modelos com fórmula estruturada (sem eval). Puro e determinístico: o editor
 * roda no navegador e chega no mesmo número que o servidor. Dinheiro sempre em centavos.
 */
import { diasEntre, somarDias } from "@/lib/dinheiro";

/* ───────────── vocabulário ───────────── */

export const GRUPOS = [
  { k: "pacote", nome: "Pacotes" },
  { k: "captacao", nome: "Captação" },
  { k: "pos", nome: "Pós-produção" },
  { k: "extra", nome: "Extras" },
  { k: "logistica", nome: "Logística" },
] as const;
export type Grupo = (typeof GRUPOS)[number]["k"];

export const UNIDADES = [
  { k: "pacote", nome: "pacote" },
  { k: "diaria", nome: "diária" },
  { k: "unidade", nome: "unidade" },
  { k: "video", nome: "vídeo" },
  { k: "trecho", nome: "trecho" },
  { k: "hora", nome: "hora" },
  { k: "km", nome: "km" },
  { k: "projeto", nome: "projeto" },
] as const;
export type Unidade = (typeof UNIDADES)[number]["k"];
export const nomeUnidade = (u: string | null | undefined) => UNIDADES.find((x) => x.k === u)?.nome ?? u ?? "";

export const STATUS_ORCAMENTO = [
  { k: "rascunho", nome: "Rascunho" },
  { k: "enviado", nome: "Enviado" },
  { k: "aprovado", nome: "Aprovado" },
  { k: "recusado", nome: "Recusado" },
  { k: "expirado", nome: "Expirado" },
] as const;
export type StatusOrcamento = "rascunho" | "enviado" | "aprovado" | "recusado";
export type StatusEfetivo = StatusOrcamento | "expirado";
export const nomeStatus = (s: string) => STATUS_ORCAMENTO.find((x) => x.k === s)?.nome ?? s;

/* ───────────── totais (iguais ao ZRO) ───────────── */

export type Linha = { quantidade: number; precoCents: number; custoCents?: number | null };

/** Valor de uma linha (quantidade × valor unitário), arredondado ao centavo. */
export const totalDaLinha = (l: Linha) => Math.round((Number(l.quantidade) || 0) * (l.precoCents || 0));
/** Custo interno de uma linha. */
export const custoDaLinha = (l: Linha) => Math.round((Number(l.quantidade) || 0) * (l.custoCents || 0));

export type Totais = {
  subtotal: number;
  /** Desconto aplicado (nunca maior que o subtotal). */
  desconto: number;
  /** O que o cliente paga. */
  total: number;
  /** Custo estimado (interno). */
  custo: number;
  /** Imposto estimado sobre o total (interno). */
  imposto: number;
  impostoPct: number;
  /** Total − custo − imposto (interno). */
  margem: number;
  /** Margem sobre o total, de 0 a 1 (null sem total). */
  margemPct: number | null;
};

/** Margem mínima saudável (abaixo disso, o editor avisa). */
export const MARGEM_MINIMA = 0.2;

export function totais(linhas: Linha[], desconto = 0, impostoPct = 0): Totais {
  const subtotal = linhas.reduce((s, l) => s + totalDaLinha(l), 0);
  const d = Math.min(Math.max(0, Math.round(desconto || 0)), Math.max(0, subtotal));
  const total = subtotal - d;
  const custo = linhas.reduce((s, l) => s + custoDaLinha(l), 0);
  const pct = Number.isFinite(impostoPct) ? Math.max(0, impostoPct) : 0;
  const imposto = Math.round((total * pct) / 100);
  const margem = total - custo - imposto;
  return { subtotal, desconto: d, total, custo, imposto, impostoPct: pct, margem, margemPct: total > 0 ? margem / total : null };
}

export type SaudeMargem = { tom: "ok" | "aviso" | "perigo" | "neutro"; rotulo: string; dica?: string };

/** Leitura da margem, sempre com texto (cor nunca é o único sinal). */
export function saudeDaMargem(t: Totais): SaudeMargem {
  if (t.total <= 0) return { tom: "neutro", rotulo: "Sem valor ainda" };
  const dica = t.custo === 0 ? "Sem custos lançados: a margem real vai ser menor." : undefined;
  if (t.margem < 0) return { tom: "perigo", rotulo: "Prejuízo", dica };
  if ((t.margemPct ?? 0) < MARGEM_MINIMA) return { tom: "aviso", rotulo: "Margem baixa", dica };
  return { tom: "ok", rotulo: "Margem saudável", dica };
}

/* ───────────── identificação, status e validade ───────────── */

/** "2026-012 v1" */
export const codigoOrcamento = (numero: string, versao: number) => `${numero} v${versao}`;

/** Próximo número do ano a partir dos que já existem: 2026-015. */
export function proximoNumero(ano: string | number, existentes: string[]): string {
  const prefixo = `${ano}-`;
  const max = existentes.reduce((m, n) => (n.startsWith(prefixo) ? Math.max(m, Number(n.slice(prefixo.length)) || 0) : m), 0);
  return `${prefixo}${String(max + 1).padStart(3, "0")}`;
}

/** "Enviado" com a validade vencida aparece como "Expirado". */
export function statusEfetivo(o: { status: string; validade: string | null }, hoje: string): StatusEfetivo {
  if (o.status === "enviado" && o.validade && o.validade < hoje) return "expirado";
  return o.status as StatusEfetivo;
}

export type Validade = { dias: number; tom: "aviso" | "perigo" | null; rotulo: string };

/** Aviso de validade (rascunho e enviado): vence em até 3 dias = aviso; venceu = alerta. */
export function avisoDeValidade(validade: string | null, hoje: string, status: string): Validade | null {
  if (!validade || (status !== "enviado" && status !== "rascunho")) return null;
  const dias = diasEntre(hoje, validade);
  if (dias < 0) {
    const n = Math.abs(dias);
    return { dias, tom: "perigo", rotulo: n === 1 ? "Venceu ontem" : `Venceu há ${n} dias` };
  }
  if (dias === 0) return { dias, tom: "aviso", rotulo: "Vence hoje" };
  if (dias === 1) return { dias, tom: "aviso", rotulo: "Vence amanhã" };
  if (dias <= 3) return { dias, tom: "aviso", rotulo: `Vence em ${dias} dias` };
  return { dias, tom: null, rotulo: `em ${dias} dias` };
}

/** Condições: uma por linha, sem marcadores repetidos. */
export function lerCondicoes(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*·]|\d{1,2}[.)-])\s*/, "").trim())
    .filter(Boolean);
}

/** 1.5 → "1,5" */
export const rotuloQuantidade = (q: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(q);

/** Unidade com plural simples: 1 diária, 2 diárias. */
export function unidadeComQuantidade(unidade: string | null | undefined, q: number): string {
  const nome = nomeUnidade(unidade);
  if (!nome) return "";
  return q === 1 || nome === "km" ? nome : `${nome}s`;
}

/** Fechamento padrão do timbrado (a organização troca em Ajustes). */
export const FECHAMENTO_PADRAO = "Para aprovar, é só responder a esta proposta. A partir daí, a gente marca a primeira conversa de produção.";

/* ───────────── parcelas ───────────── */

export type Parcela = { rotulo: string; valorCents: number; vencimento: string };

export function rotulosDasParcelas(n: number): string[] {
  if (n <= 1) return ["parcela única"];
  if (n === 2) return ["entrada", "saldo"];
  return Array.from({ length: n }, (_, i) => `parcela ${i + 1}`);
}

/** 1x hoje; 2x com 50% de entrada e o saldo em 30 dias; 3x iguais a cada 30 dias. A última absorve os centavos. */
export function parcelasPadrao(total: number, quantas: number, hoje: string): Parcela[] {
  const n = Math.min(3, Math.max(1, Math.round(quantas)));
  const rotulos = rotulosDasParcelas(n);
  const base = Math.floor(total / n);
  return rotulos.map((rotulo, i) => ({ rotulo, valorCents: i === n - 1 ? total - base * (n - 1) : base, vencimento: somarDias(hoje, i * 30) }));
}

/* ───────────── tabela de preços: faixas, variáveis e modelos ───────────── */

export type Faixa = { aPartirDe: number; precoCents: number };
export type ItemTabela = {
  id: string;
  grupo: Grupo;
  nome: string;
  descricao: string | null;
  unidade: string;
  precoCents: number;
  custoCents: number;
  ativo: boolean;
  faixas: Faixa[];
};
export type OpcaoVariavel = { valor: string; rotulo: string; mult?: number; grupos?: string[] };
export type Variavel = { chave: string; rotulo: string; tipo: "escolha" | "numero"; opcoes: OpcaoVariavel[] };
export type Quantidade = { fixo?: number; var?: string; mult?: number; soma?: number; min?: number; max?: number };
export type LinhaModelo = { itemId: string; qtd: Quantidade };
export type Modelo = { id: string; nome: string; nicho: string | null; linhas: LinhaModelo[]; respostas: Respostas };
export type Respostas = Record<string, string | number>;

/** Preço unitário pela quantidade: a maior faixa que a quantidade alcança; sem faixa, o preço do item. */
export function precoPorQuantidade(item: Pick<ItemTabela, "precoCents" | "faixas">, quantidade: number): number {
  let preco = item.precoCents;
  let melhor = 0;
  for (const f of item.faixas) if (quantidade >= f.aPartirDe && f.aPartirDe >= melhor) [melhor, preco] = [f.aPartirDe, f.precoCents];
  return preco;
}

/** Os multiplicadores que valem para o item (variáveis de escolha respondidas, no grupo certo), com o rótulo. */
export function multiplicadores(item: Pick<ItemTabela, "grupo">, variaveis: Variavel[], respostas: Respostas): { rotulo: string; mult: number }[] {
  const out: { rotulo: string; mult: number }[] = [];
  for (const v of variaveis) {
    if (v.tipo !== "escolha") continue;
    const o = v.opcoes.find((x) => x.valor === String(respostas[v.chave] ?? ""));
    if (!o || o.mult == null || !Number.isFinite(o.mult) || o.mult <= 0 || o.mult === 1) continue;
    if (o.grupos?.length && !o.grupos.includes(item.grupo)) continue;
    out.push({ rotulo: o.rotulo, mult: o.mult });
  }
  return out;
}

/** Quantidade de uma linha do modelo: (fixo ou a resposta da variável) × mult + soma, entre min e max, 2 casas. */
export function quantidadeDaFormula(q: Quantidade, respostas: Respostas): number {
  const base = q.fixo != null ? q.fixo : q.var ? Number(String(respostas[q.var] ?? "").replace(",", ".")) || 0 : 1;
  let v = base * (q.mult ?? 1) + (q.soma ?? 0);
  if (q.min != null) v = Math.max(q.min, v);
  if (q.max != null) v = Math.min(q.max, v);
  return Math.max(0, Math.round(v * 100) / 100);
}

export type LinhaGerada = {
  precoItemId: string;
  descricao: string;
  detalhe: string | null;
  quantidade: number;
  unidade: string;
  precoCents: number;
  custoCents: number;
};

/** Preço de um item da tabela para uma quantidade e respostas (faixa × multiplicadores), com o detalhe do porquê. */
export function precificar(item: ItemTabela, quantidade: number, variaveis: Variavel[], respostas: Respostas) {
  const base = precoPorQuantidade(item, quantidade);
  const ms = multiplicadores(item, variaveis, respostas);
  const fator = ms.reduce((f, m) => f * m.mult, 1);
  const detalhe = ms.map((m) => `${m.rotulo} ×${String(m.mult).replace(".", ",")}`).join(" · ") || null;
  return { precoCents: Math.round(base * fator), detalhe };
}

/** As linhas de um modelo para as respostas dadas. Item inativo ou fora da tabela e quantidade zero ficam de fora. */
export function aplicarModelo(modelo: Pick<Modelo, "linhas">, respostas: Respostas, tabela: ItemTabela[], variaveis: Variavel[]): LinhaGerada[] {
  const porId = new Map(tabela.map((i) => [i.id, i]));
  const out: LinhaGerada[] = [];
  for (const l of modelo.linhas) {
    const item = porId.get(l.itemId);
    if (!item || !item.ativo) continue;
    const quantidade = quantidadeDaFormula(l.qtd, respostas);
    if (!(quantidade > 0)) continue;
    const { precoCents, detalhe } = precificar(item, quantidade, variaveis, respostas);
    out.push({
      precoItemId: item.id,
      descricao: item.nome,
      detalhe: [item.descricao, detalhe].filter(Boolean).join(" · ") || null,
      quantidade,
      unidade: item.unidade,
      precoCents,
      custoCents: item.custoCents,
    });
  }
  return out;
}

/* ───────────── validação do que chega da tela ───────────── */

/** Forma da `opcoes` de uma variável (vem da tela de Ajustes). */
export function lerOpcoes(v: unknown): OpcaoVariavel[] | null {
  if (!Array.isArray(v) || v.length > 40) return null;
  const out: OpcaoVariavel[] = [];
  for (const o of v) {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    const valor = typeof r.valor === "string" ? r.valor.trim().slice(0, 40) : "";
    const rotulo = typeof r.rotulo === "string" ? r.rotulo.trim().slice(0, 60) : "";
    if (!valor || !rotulo) return null;
    const mult = r.mult == null || r.mult === "" ? undefined : Number(r.mult);
    if (mult !== undefined && !(mult > 0 && mult <= 10)) return null;
    const grupos = Array.isArray(r.grupos) ? r.grupos.filter((g): g is string => GRUPOS.some((x) => x.k === g)) : undefined;
    out.push({ valor, rotulo, ...(mult !== undefined ? { mult } : {}), ...(grupos?.length ? { grupos } : {}) });
  }
  return out;
}

/** Forma das linhas de um modelo. */
export function lerLinhasDoModelo(v: unknown): LinhaModelo[] | null {
  if (!Array.isArray(v) || v.length > 60) return null;
  const out: LinhaModelo[] = [];
  const num = (x: unknown) => (x == null || x === "" ? undefined : Number(x));
  for (const l of v) {
    if (!l || typeof l !== "object") return null;
    const r = l as Record<string, unknown>;
    if (typeof r.itemId !== "string" || !/^[0-9a-f-]{36}$/i.test(r.itemId)) return null;
    const q = (r.qtd && typeof r.qtd === "object" ? r.qtd : {}) as Record<string, unknown>;
    const qtd: Quantidade = {};
    for (const k of ["fixo", "mult", "soma", "min", "max"] as const) {
      const n = num(q[k]);
      if (n === undefined) continue;
      if (!Number.isFinite(n) || Math.abs(n) > 100000) return null;
      qtd[k] = n;
    }
    if (typeof q.var === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(q.var)) qtd.var = q.var;
    out.push({ itemId: r.itemId.toLowerCase(), qtd });
  }
  return out;
}

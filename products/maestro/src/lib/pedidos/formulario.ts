/**
 * O pedido de orçamento público (`/p/<token>`, plano v2 §6.2): as perguntas, a validação do que chega e a passagem do
 * pedido para o orçamento ("Gerar orçamento"). Puro: a tela, o servidor e os testes usam as mesmas regras.
 *
 * As perguntas saem da tabela de preços da produtora: o tipo de trabalho são os modelos ativos; o nicho é a variável
 * `nicho`; as entregas (vídeos, diárias…) são as variáveis de número; urgência e outras escolhas também entram. O
 * cliente nunca vê preço, multiplicador nem custo: só os rótulos.
 */
import { ehData } from "@/lib/dinheiro";
import type { Modelo, Respostas } from "@/lib/orcamento/motor";

export type OpcaoPublica = { valor: string; rotulo: string };
export type VariavelPublica = { chave: string; rotulo: string; tipo: "escolha" | "numero"; opcoes: OpcaoPublica[] };
export type ModeloPublico = { id: string; nome: string; descricao: string | null; nicho: string | null };
export type MarcaPublica = {
  nome: string;
  cor: string | null;
  logo: string | null;
  email: string | null;
  telefone: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  assinatura: string | null;
  /** "Maestro com a sua marca" (drizzle/0020): sem a marca do Maestro, só "Powered by Absolute ZRO". */
  propria?: boolean;
};
export type PerguntasPedido = { ideia: boolean; datas: boolean; local: boolean; investimento: boolean };
export type ConfigPedido = { perguntas: PerguntasPedido; boasVindas: string | null };
export type FormPedido = { marca: MarcaPublica; config: ConfigPedido; modelos: ModeloPublico[]; variaveis: VariavelPublica[] };

export const PERGUNTAS_PADRAO: PerguntasPedido = { ideia: true, datas: true, local: true, investimento: true };

export const FAIXAS_INVESTIMENTO: OpcaoPublica[] = [
  { valor: "ate-5k", rotulo: "Até R$ 5 mil" },
  { valor: "5-15k", rotulo: "R$ 5 a 15 mil" },
  { valor: "15-40k", rotulo: "R$ 15 a 40 mil" },
  { valor: "40k+", rotulo: "Acima de R$ 40 mil" },
  { valor: "nao-sei", rotulo: "Ainda não sei" },
];

export const STATUS_PEDIDO = [
  { k: "novo", nome: "Novo" },
  { k: "em_orcamento", nome: "Em orçamento" },
  { k: "virou_projeto", nome: "Virou projeto" },
  { k: "recusado", nome: "Recusado" },
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number]["k"];
/** O selo de cada status (as cores de `.selo[data-status]`). */
export const TOM_PEDIDO: Record<string, string> = { novo: "aviso", em_orcamento: "enviado", virou_projeto: "aprovado", recusado: "recusado" };
export const nomeStatusPedido = (s: string) => STATUS_PEDIDO.find((x) => x.k === s)?.nome ?? s;

export function lerConfig(v: unknown): ConfigPedido {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const p = (c.perguntas && typeof c.perguntas === "object" ? c.perguntas : {}) as Record<string, unknown>;
  const perguntas = Object.fromEntries(Object.keys(PERGUNTAS_PADRAO).map((k) => [k, p[k] !== false])) as PerguntasPedido;
  const bv = typeof c.boasVindas === "string" && c.boasVindas.trim() ? c.boasVindas.trim().slice(0, 280) : null;
  return { perguntas, boasVindas: bv };
}

/** A variável do nicho (se a tabela tiver) e as demais (as entregas e escolhas). */
export const variavelDoNicho = (vs: VariavelPublica[]) => vs.find((v) => v.chave === "nicho" && v.tipo === "escolha") ?? null;
export const variaveisDeEntrega = (vs: VariavelPublica[]) => vs.filter((v) => v.chave !== "nicho");

export type RespostasPedido = {
  modelo?: string;
  /** O nome do tipo escolhido (ou "Outro"), para a equipe ler sem abrir a tabela. */
  tipo?: string;
  nicho?: string;
  vars: Record<string, string | number>;
  inicio?: string;
  fim?: string;
  local?: string;
  investimento?: string;
  ideia?: string;
};

export type EnvioPedido = {
  nome: string;
  empresa: string | null;
  email: string | null;
  whatsapp: string | null;
  consentimento: true;
  respostas: RespostasPedido;
  idem: string;
};

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Só os dígitos do WhatsApp (com DDD; aceita o +55). */
export const soDigitos = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : "");

/** Confere o pedido contra o formulário daquele link. Erros por campo, em português curto. */
export function validarEnvio(corpo: unknown, form: FormPedido): { ok: true; envio: EnvioPedido } | { ok: false; erros: Record<string, string> } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const r = (c.respostas && typeof c.respostas === "object" ? c.respostas : {}) as Record<string, unknown>;
  const erros: Record<string, string> = {};

  const nome = texto(c.nome, 120);
  if (!nome || nome.length < 2) erros.nome = "Como a gente te chama?";
  const empresa = texto(c.empresa, 120);
  const email = texto(c.email, 254)?.toLowerCase() ?? null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erros.email = "Confira o e-mail.";
  const whats = soDigitos(c.whatsapp);
  if (whats && (whats.length < 10 || whats.length > 13)) erros.whatsapp = "Confira o número com DDD.";
  if (!email && !whats) erros.whatsapp = "Deixe um WhatsApp ou e-mail para a resposta.";
  if (c.consentimento !== true) erros.consentimento = "Precisamos do seu ok para guardar esses dados.";
  const idem = typeof c.idem === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(c.idem) ? c.idem : null;
  if (!idem) erros.idem = "Recarregue a página e tente de novo.";

  const resp: RespostasPedido = { vars: {} };
  if (typeof r.modelo === "string" && r.modelo) {
    const m = form.modelos.find((x) => x.id === r.modelo);
    if (!m) erros.modelo = "Escolha um tipo da lista.";
    else {
      resp.modelo = m.id;
      resp.tipo = m.nome;
    }
  } else if (r.modelo === "outro" || r.tipo === "Outro") resp.tipo = "Outro";

  const nicho = variavelDoNicho(form.variaveis);
  if (typeof r.nicho === "string" && r.nicho) {
    if (nicho && !nicho.opcoes.some((o) => o.valor === r.nicho)) erros.nicho = "Escolha um nicho da lista.";
    else resp.nicho = texto(r.nicho, 60) ?? undefined;
  }

  const vars = (r.vars && typeof r.vars === "object" ? r.vars : {}) as Record<string, unknown>;
  for (const v of variaveisDeEntrega(form.variaveis)) {
    const x = vars[v.chave];
    if (x === undefined || x === null || x === "") continue;
    if (v.tipo === "numero") {
      const n = Number(x);
      if (!Number.isInteger(n) || n < 0 || n > 999) erros[`var_${v.chave}`] = "Um número de 0 a 999.";
      else if (n > 0) resp.vars[v.chave] = n;
    } else if (typeof x === "string" && v.opcoes.some((o) => o.valor === x)) resp.vars[v.chave] = x;
    else erros[`var_${v.chave}`] = "Escolha uma opção da lista.";
  }

  const p = form.config.perguntas;
  if (p.datas) {
    const ini = r.inicio === "" || r.inicio == null ? null : r.inicio;
    const fim = r.fim === "" || r.fim == null ? null : r.fim;
    if (ini !== null && !ehData(ini)) erros.inicio = "Data inválida.";
    if (fim !== null && !ehData(fim)) erros.fim = "Data inválida.";
    if (ehData(ini) && ehData(fim) && fim < ini) erros.fim = "O fim vem depois do começo.";
    if (ehData(ini)) resp.inicio = ini;
    if (ehData(fim)) resp.fim = fim;
  }
  if (p.local) {
    const local = texto(r.local, 120);
    if (local) resp.local = local;
  }
  if (p.investimento && typeof r.investimento === "string" && r.investimento) {
    if (!FAIXAS_INVESTIMENTO.some((f) => f.valor === r.investimento)) erros.investimento = "Escolha uma faixa.";
    else resp.investimento = r.investimento;
  }
  if (p.ideia && typeof r.ideia === "string") {
    const ideia = r.ideia.replace(/\r\n?/g, "\n").trim();
    if (ideia.length > 2000) erros.ideia = "Até 2.000 caracteres.";
    else if (ideia) resp.ideia = ideia;
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    envio: { nome: nome!, empresa, email, whatsapp: whats || null, consentimento: true, respostas: resp, idem: idem! },
  };
}

/* ───────────── do pedido ao orçamento ───────────── */

export type PedidoParaOrcar = {
  protocolo: string;
  nome: string;
  empresa: string | null;
  respostas: RespostasPedido;
};

export type ModeloDaTabela = Pick<Modelo, "id" | "nome" | "nicho" | "respostas"> & { ativo: boolean };

export type RascunhoDoPedido = {
  modeloId: string | null;
  respostas: Respostas;
  titulo: string;
  escopo: string | null;
  periodo: string | null;
  notasInternas: string;
};

const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** O período em texto: "12/11/2026" ou "12/11/2026 a 14/11/2026". */
export function periodoDoPedido(r: RespostasPedido): string | null {
  if (r.inicio && r.fim && r.fim !== r.inicio) return `${dataBr(r.inicio)} a ${dataBr(r.fim)}`;
  if (r.inicio) return dataBr(r.inicio);
  if (r.fim) return `Até ${dataBr(r.fim)}`;
  return null;
}

/**
 * O rascunho do orçamento a partir do pedido: o modelo escolhido (ou o do nicho), as respostas do modelo cobertas pelas
 * do cliente (nicho, vídeos, diárias…), o título, o escopo e o período. O motor (aplicarModelo) faz as linhas e os
 * preços com essas respostas; a pessoa sempre revisa antes de mandar.
 */
export function rascunhoDoPedido(
  p: PedidoParaOrcar,
  modelos: ModeloDaTabela[],
  variaveis: Pick<VariavelPublica, "chave" | "rotulo" | "opcoes">[],
): RascunhoDoPedido {
  const r = p.respostas;
  const ativos = modelos.filter((m) => m.ativo);
  const modelo = (r.modelo && ativos.find((m) => m.id === r.modelo)) || (r.nicho && ativos.find((m) => m.nicho === r.nicho)) || null;
  const respostas: Respostas = { ...(modelo?.respostas ?? {}), ...(r.nicho ? { nicho: r.nicho } : {}), ...r.vars };
  const quem = p.empresa || p.nome;
  const titulo = `${modelo?.nome ?? (r.tipo && r.tipo !== "Outro" ? r.tipo : "Orçamento")} · ${quem}`.slice(0, 200);
  const entregas = Object.entries(r.vars)
    .map(([k, v]) => {
      const def = variaveis.find((x) => x.chave === k);
      if (!def) return null;
      const valor = typeof v === "number" ? String(v) : (def.opcoes.find((o) => o.valor === v)?.rotulo ?? String(v));
      return `${def.rotulo}: ${valor}`;
    })
    .filter(Boolean);
  const nichoRotulo = r.nicho ? (variaveis.find((x) => x.chave === "nicho")?.opcoes.find((o) => o.valor === r.nicho)?.rotulo ?? r.nicho) : null;
  const escopo = [
    r.ideia,
    entregas.length ? `Entregas: ${entregas.join(" · ")}` : null,
    nichoRotulo ? `Nicho: ${nichoRotulo}` : null,
    r.local ? `Local: ${r.local}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
  const faixa = r.investimento ? FAIXAS_INVESTIMENTO.find((f) => f.valor === r.investimento)?.rotulo : null;
  return {
    modeloId: modelo?.id ?? null,
    respostas,
    titulo,
    escopo: escopo || null,
    periodo: periodoDoPedido(r),
    notasInternas: [`Pedido ${p.protocolo}`, faixa ? `investimento previsto: ${faixa}` : null].filter(Boolean).join(" · "),
  };
}

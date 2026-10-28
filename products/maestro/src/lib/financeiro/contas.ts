/**
 * Contas do Financeiro (porte de src/lib/queries/finance.ts e src/lib/services/recurring.ts do ZRO, sem impostos:
 * o titular ainda não decidiu o DAS/ISS). Puro: status de cada lançamento, totais por tipo, fluxo de caixa por mês,
 * resultado por projeto e as regras da recorrência. Dinheiro em centavos; datas "AAAA-MM-DD".
 */
import { diaNoMes, limitesDoMes, somarMeses } from "@/lib/dinheiro";

export const CATEGORIAS = [
  { k: "cliente", nome: "Cliente", tipo: "entrada" },
  { k: "outra-receita", nome: "Outra receita", tipo: "entrada" },
  { k: "freela", nome: "Freela", tipo: "saida" },
  { k: "equipamento", nome: "Equipamento", tipo: "saida" },
  { k: "locacao", nome: "Locação", tipo: "saida" },
  { k: "deslocamento", nome: "Deslocamento", tipo: "saida" },
  { k: "alimentacao", nome: "Alimentação", tipo: "saida" },
  { k: "fixo", nome: "Custo fixo", tipo: "saida" },
  { k: "software", nome: "Software", tipo: "saida" },
  { k: "marketing", nome: "Marketing", tipo: "saida" },
  { k: "outra-despesa", nome: "Outra despesa", tipo: "saida" },
] as const;
export type Categoria = (typeof CATEGORIAS)[number]["k"];
export type Tipo = "entrada" | "saida";
export const nomeCategoria = (k: string) => CATEGORIAS.find((c) => c.k === k)?.nome ?? k;
export const categoriaDoTipo = (k: string, tipo: Tipo) => CATEGORIAS.some((c) => c.k === k && c.tipo === tipo);

export const FORMAS = [
  { k: "pix", nome: "Pix" },
  { k: "transferencia", nome: "Transferência" },
  { k: "boleto", nome: "Boleto" },
  { k: "cartao", nome: "Cartão" },
  { k: "dinheiro", nome: "Dinheiro" },
] as const;

export type Status = "pago" | "parcial" | "atrasado" | "pendente";
export const NOME_STATUS: Record<Status, string> = { pago: "Pago", parcial: "Parcial", atrasado: "Atrasado", pendente: "Pendente" };

type Basico = { tipo: string; valorCents: number; pagoCents: number; vencimento: string };

/** Pago (tudo baixado), atrasado (venceu com saldo), parcial (baixa em parte) ou pendente. */
export function statusDe(l: Pick<Basico, "valorCents" | "pagoCents" | "vencimento">, hoje: string): Status {
  if (l.pagoCents >= l.valorCents) return "pago";
  if (l.vencimento < hoje) return "atrasado";
  if (l.pagoCents > 0) return "parcial";
  return "pendente";
}

export const emAberto = (l: Pick<Basico, "valorCents" | "pagoCents">) => Math.max(0, l.valorCents - l.pagoCents);

export type TotaisTipo = { pago: number; aberto: number; atrasado: number; total: number; quantos: number };
const vazio = (): TotaisTipo => ({ pago: 0, aberto: 0, atrasado: 0, total: 0, quantos: 0 });

/** Recebido/pago, em aberto e atrasado por tipo, e os saldos realizado e previsto. */
export function resumir(lista: Basico[], hoje: string) {
  const por: Record<Tipo, TotaisTipo> = { entrada: vazio(), saida: vazio() };
  for (const l of lista) {
    const t = por[l.tipo as Tipo];
    if (!t) continue;
    const aberto = emAberto(l);
    t.quantos += 1;
    t.pago += Math.min(l.pagoCents, l.valorCents);
    t.aberto += aberto;
    if (aberto > 0 && l.vencimento < hoje) t.atrasado += aberto;
  }
  for (const t of Object.values(por)) t.total = t.pago + t.aberto;
  return { ...por, saldoRealizado: por.entrada.pago - por.saida.pago, saldoPrevisto: por.entrada.total - por.saida.total };
}
export type Resumo = ReturnType<typeof resumir>;

/** Os meses de `de` até `ate` (inclusive), "AAAA-MM". */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let m = de; m <= ate && out.length < 60; m = somarMeses(m, 1)) out.push(m);
  return out;
}

export type MesDoFluxo = {
  mes: string;
  /** Entradas e saídas pelo vencimento (o previsto do mês). */
  entradas: number;
  saidas: number;
  /** O que já foi baixado, dos lançamentos com vencimento no mês. */
  recebido: number;
  pago: number;
  saldo: number;
  /** Saldo acumulado desde o primeiro mês da janela. */
  acumulado: number;
};

/** Fluxo de caixa mês a mês, pelo vencimento: previsto, realizado, saldo e acumulado. */
export function fluxoPorMes(lista: Basico[], meses: string[]): MesDoFluxo[] {
  let acumulado = 0;
  return meses.map((mes) => {
    const { inicio, fim } = limitesDoMes(mes);
    const doMes = lista.filter((l) => l.vencimento >= inicio && l.vencimento <= fim);
    const soma = (tipo: Tipo, f: (l: Basico) => number) => doMes.filter((l) => l.tipo === tipo).reduce((s, l) => s + f(l), 0);
    const entradas = soma("entrada", (l) => l.valorCents);
    const saidas = soma("saida", (l) => l.valorCents);
    acumulado += entradas - saidas;
    return {
      mes,
      entradas,
      saidas,
      recebido: soma("entrada", (l) => Math.min(l.pagoCents, l.valorCents)),
      pago: soma("saida", (l) => Math.min(l.pagoCents, l.valorCents)),
      saldo: entradas - saidas,
      acumulado,
    };
  });
}

export type ResultadoProjeto = {
  id: string;
  codigo: string;
  titulo: string;
  cliente: string | null;
  /** Valor contratado (0 sem valor). */
  valor: number;
  /** Base do resultado: o contratado, ou as entradas lançadas quando não há valor. */
  receita: number;
  recebido: number;
  aReceber: number;
  /** Parte do contratado que ainda não virou lançamento de entrada. */
  semLancar: number;
  custos: number;
  custosAbertos: number;
  margem: number;
  margemPct: number | null;
  /** Margem que o orçamento aprovado previa (null sem orçamento). */
  margemOrcadaPct: number | null;
};

/** Receita − custos, projeto a projeto (sem imposto, que ainda não entrou). */
export function resultadoPorProjeto(
  projetos: { id: string; codigo: string; titulo: string; cliente: string | null; valor: number; margemOrcadaPct: number | null }[],
  lancamentos: (Basico & { projetoId: string | null })[],
): ResultadoProjeto[] {
  const out: ResultadoProjeto[] = [];
  for (const p of projetos) {
    const meus = lancamentos.filter((l) => l.projetoId === p.id);
    if (!meus.length && p.valor <= 0) continue;
    let recebido = 0;
    let aReceber = 0;
    let custosPagos = 0;
    let custosAbertos = 0;
    for (const l of meus) {
      const aberto = emAberto(l);
      if (l.tipo === "entrada") {
        recebido += Math.min(l.pagoCents, l.valorCents);
        aReceber += aberto;
      } else {
        custosPagos += Math.min(l.pagoCents, l.valorCents);
        custosAbertos += aberto;
      }
    }
    const lancado = recebido + aReceber;
    const receita = p.valor > 0 ? p.valor : lancado;
    const custos = custosPagos + custosAbertos;
    const margem = receita - custos;
    out.push({
      ...p,
      receita,
      recebido,
      aReceber,
      semLancar: Math.max(0, p.valor - lancado),
      custos,
      custosAbertos,
      margem,
      margemPct: receita > 0 ? margem / receita : null,
    });
  }
  return out;
}

/* ───────────── recorrência ───────────── */

export type Recorrencia = { inicioMes: string; fimMes: string | null; ativo: boolean; dia: number };

/** A recorrência vale neste mês? */
export const valeNoMes = (r: Recorrencia, mes: string) => r.ativo && r.inicioMes <= mes && (!r.fimMes || mes <= r.fimMes);

/** Vencimento no mês (dia 31 em fevereiro vira o último dia). */
export const vencimentoNoMes = (r: Pick<Recorrencia, "dia">, mes: string) => diaNoMes(mes, r.dia);

/** Os formatos da Pauta e como costumam ser escritos (sem acento, minúsculas), do ZRO. */
const FORMATOS: [string, string[]][] = [
  ["Post", ["post", "posts", "postagem", "postagens"]],
  ["Carrossel", ["carrossel", "carrosseis", "carrosel"]],
  ["Reels", ["reels", "reel"]],
  ["Story", ["story", "stories", "storys"]],
  ["Vídeo", ["video", "videos"]],
  ["Foto", ["foto", "fotos", "fotografia", "fotografias"]],
];
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "Reels" → só o formato; "Vídeo institucional" → o formato e o nome. */
export function formatoDe(titulo: string): { formato: string | null; soFormato: boolean } {
  const t = sem(titulo);
  const exato = FORMATOS.find(([, a]) => a.includes(t));
  if (exato) return { formato: exato[0], soFormato: true };
  const palavras = t.split(/[^a-z0-9]+/);
  const dentro = FORMATOS.find(([, a]) => a.some((x) => palavras.includes(x)));
  return { formato: dentro?.[0] ?? null, soFormato: false };
}

/** Os cards do mês para as entregas fixas: tema e id estável (recorrência + mês + posição), no máximo 60. */
export function cardsDoMes(recId: string, entregas: { titulo: string; qtd: number }[], mes: string, nomeMes: string) {
  const lista = entregas.flatMap((d) =>
    Array.from({ length: Math.max(0, Math.min(60, Math.round(d.qtd))) }, (_, i) => ({ titulo: d.titulo.trim(), i: i + 1, qtd: d.qtd })),
  );
  const base = `rec-${recId.replace(/-/g, "").slice(0, 16)}-${mes.replace("-", "")}`;
  return lista.slice(0, 60).map((e, n) => {
    const { formato } = formatoDe(e.titulo);
    const tema = [e.titulo, e.qtd > 1 ? `${e.i} de ${e.qtd}` : null, nomeMes].filter(Boolean).join(" · ");
    return { id: `${base}-${n + 1}`, tema, formato };
  });
}

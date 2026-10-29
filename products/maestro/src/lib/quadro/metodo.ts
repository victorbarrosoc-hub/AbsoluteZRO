/**
 * O método do Quadro: 8 colunas de sistema, um estado só por card (`dados.coluna`). Os nomes de fábrica são os do
 * proprietário (28/10/2026): "Com o cliente" virou "Em aprovação" e "Publicado" virou "Entregue".
 *
 * Desde a 0024 (colunas como no Trello, titular 29/10/2026) cada produtora renomeia, recolore, reordena e cria colunas
 * (`src/lib/quadro/colunas.ts`). O id de uma coluna de sistema É o papel dela (`pauta`, `revisao`…) e não muda com o
 * nome: tudo o que o produto automatiza por coluna (próximo passo, prazo, aprovação do cliente, Hoje, agenda, Z) olha
 * o id, nunca o nome. Coluna criada pela produtora tem id `x-…` e conta como "em produção".
 *
 * Porte do Quadro do Maestro antigo (via o porte do ZRO, `painel/quadro/metodo.ts`): o próximo passo de cada coluna,
 * a ordem entre vizinhos (mover não regrava a coluna inteira), os filtros e o rótulo do prazo. Puro: roda no
 * navegador, no servidor e nos testes.
 */
/** Os papéis das 8 colunas do método (= o id delas). */
export type PapelColuna = "pauta" | "afazer" | "fazendo" | "revisao" | "aprovacao" | "aprovado" | "agendado" | "entregue";
/** Id de qualquer coluna: um papel ou `x-<acaso>` (coluna da produtora). */
export type ColunaId = string;

/** As colunas de fábrica (nome, cor e ordem; o banco semeia as mesmas em `maestro.colunas_padrao_lista()`). */
export const COLUNAS: { k: PapelColuna; nome: string; desc: string; cor: string }[] = [
  { k: "pauta", nome: "Pauta", desc: "Ideias sem responsável. Escolha quem faz.", cor: "pedra" },
  { k: "afazer", nome: "A fazer", desc: "Tem dono e prazo. Ainda não começou.", cor: "lavanda" },
  { k: "fazendo", nome: "Fazendo", desc: "Em produção agora.", cor: "ambar" },
  { k: "revisao", nome: "Revisão", desc: "Alguém da casa confere antes do cliente.", cor: "laranja" },
  { k: "aprovacao", nome: "Em aprovação", desc: "Esperando a decisão do cliente.", cor: "latao" },
  { k: "aprovado", nome: "Aprovado", desc: "O cliente aprovou. Falta agendar.", cor: "verde" },
  { k: "agendado", nome: "Agendado", desc: "Programado para ir ao ar.", cor: "turquesa" },
  { k: "entregue", nome: "Entregue", desc: "No ar, entregue ao cliente.", cor: "oliva" },
];
export const COLUNA = Object.fromEntries(COLUNAS.map((c) => [c.k, c])) as Record<PapelColuna, (typeof COLUNAS)[number]>;
export const ehPapel = (v: unknown): v is PapelColuna => typeof v === "string" && Object.hasOwn(COLUNA, v);
/** Id de coluna da produtora (a 0024 gera `x-` + 12 hex). */
export const ID_COLUNA_DA_PRODUTORA = /^x-[a-z0-9]{4,32}$/;
/** Forma de um id de coluna (se a coluna existe e está viva, quem confere é o banco). */
export const ehColuna = (v: unknown): v is ColunaId => ehPapel(v) || (typeof v === "string" && ID_COLUNA_DA_PRODUTORA.test(v));
/** Colunas em que o card já não é trabalho da equipe. Fora delas (as 4 primeiras e as da produtora) o prazo vale. */
export const FORA_DO_TRABALHO: PapelColuna[] = ["aprovacao", "aprovado", "agendado", "entregue"];
/** O card ainda é trabalho da equipe? Coluna da produtora conta como "em produção". */
export const emTrabalho = (coluna: ColunaId | null | undefined): boolean => !!coluna && !(FORA_DO_TRABALHO as string[]).includes(coluna);

export type Prioridade = "baixa" | "normal" | "alta";
export const PRIORIDADES: { k: Prioridade; nome: string }[] = [
  { k: "baixa", nome: "Baixa" },
  { k: "normal", nome: "Normal" },
  { k: "alta", nome: "Alta" },
];

/** O documento do card (maestro.cards.dados). Ids de cliente, projeto e responsável são os do banco. */
export type DadosCard = {
  tema: string;
  coluna: ColunaId;
  ordem?: number;
  colunaEm?: number;
  cliente?: string;
  projeto?: string;
  resp?: string;
  prazo?: string;
  prioridade?: Prioridade;
  briefing?: string;
  criadoEm?: number;
  criadoPor?: string;
  apagadoEm?: string;
  apagadoPor?: string;
};

/** O card como a tela recebe: os dados, a versão do card e a versão de cada campo (para o conflito por campo). */
export type CardQ = { id: string; dados: DadosCard; versao: number; versoes: Record<string, number> };

/** Campos que a equipe muda pela tela (o resto é do servidor). */
export const CAMPOS_EDITAVEIS = ["tema", "coluna", "ordem", "cliente", "projeto", "resp", "prazo", "prioridade", "briefing"] as const;
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];
export const NOME_DO_CAMPO: Record<CampoEditavel, string> = {
  tema: "o título",
  coluna: "a coluna",
  ordem: "a posição",
  cliente: "o cliente",
  projeto: "o projeto",
  resp: "o responsável",
  prazo: "o prazo",
  prioridade: "a prioridade",
  briefing: "o briefing",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
export const LIMITE_TEMA = 200;
export const LIMITE_BRIEFING = 5000;

/**
 * Confere um valor de campo editável. Devolve o valor normalizado (null = tirar o campo) ou `undefined` se inválido.
 * Mesma regra no navegador (antes de enviar) e no servidor (antes de gravar).
 */
export function valorDoCampo(campo: CampoEditavel, v: unknown): unknown {
  if (v === null || v === "") return campo === "tema" || campo === "coluna" ? undefined : null;
  switch (campo) {
    case "tema": {
      const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
      return t.length >= 1 && t.length <= LIMITE_TEMA ? t : undefined;
    }
    case "coluna":
      return ehColuna(v) ? v : undefined;
    case "ordem":
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    case "cliente":
    case "projeto":
    case "resp":
      return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : undefined;
    case "prazo":
      return typeof v === "string" && DATA.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) ? v : undefined;
    case "prioridade":
      return v === "baixa" || v === "normal" || v === "alta" ? v : undefined;
    case "briefing":
      return typeof v === "string" && v.length <= LIMITE_BRIEFING ? v : undefined;
  }
}

/** Id de card: relógio em base 36 + acaso, dentro do formato que o banco exige (^[A-Za-z0-9_-]{4,64}$). */
export function novoId(agora = Date.now()): string {
  const acaso = Math.random().toString(36).slice(2, 8);
  return `c${agora.toString(36)}${acaso}`;
}
export const ID_CARD = /^[A-Za-z0-9_-]{4,64}$/;

/* ───────────── o próximo passo ───────────── */

export type Passo = { acao: "mover"; para: PapelColuna; rotulo: string } | { acao: "atribuir"; rotulo: string };

/**
 * O próximo passo de cada coluna: atalho para mover, não trava (arrastar e "Mover para…" continuam valendo). Vai
 * sempre para uma coluna de sistema (pelo papel; ela nunca é arquivada). Coluna da produtora segue como "Fazendo".
 */
export function proximoPasso(d: Pick<DadosCard, "coluna" | "resp">): { principal: Passo; outro?: Passo } | null {
  switch (d.coluna) {
    case "pauta":
      return d.resp ? { principal: { acao: "mover", para: "afazer", rotulo: "Para a fazer" } } : { principal: { acao: "atribuir", rotulo: "Atribuir" } };
    case "afazer":
      return { principal: { acao: "mover", para: "fazendo", rotulo: "Começar" } };
    case "fazendo":
      return { principal: { acao: "mover", para: "revisao", rotulo: "Mandar para revisão" } };
    case "revisao":
      return { principal: { acao: "mover", para: "aprovacao", rotulo: "Enviar ao cliente" }, outro: { acao: "mover", para: "fazendo", rotulo: "Devolver" } };
    case "aprovacao":
      return { principal: { acao: "mover", para: "aprovado", rotulo: "Aprovou" }, outro: { acao: "mover", para: "fazendo", rotulo: "Pediu ajuste" } };
    case "aprovado":
      return { principal: { acao: "mover", para: "agendado", rotulo: "Agendar" } };
    case "agendado":
      return { principal: { acao: "mover", para: "entregue", rotulo: "Entreguei" } };
    case "entregue":
      return null;
    default:
      return ehColuna(d.coluna) ? { principal: { acao: "mover", para: "revisao", rotulo: "Mandar para revisão" } } : null;
  }
}

/** Ordem entre os vizinhos: mover um card não regrava a coluna inteira. */
export function ordemEntre(a: { ordem?: number } | null, b: { ordem?: number } | null): number {
  const o = (x: { ordem?: number }) => (typeof x.ordem === "number" && Number.isFinite(x.ordem) ? x.ordem : 0);
  if (a && b) return (o(a) + o(b)) / 2;
  if (a) return o(a) + 1;
  if (b) return o(b) - 1;
  return 1;
}

/** A coluna em ordem: pela ordem; Entregue mostra o mais recente primeiro. */
export function ordenarColuna(k: ColunaId, l: CardQ[]): CardQ[] {
  const o = (c: CardQ) => (typeof c.dados.ordem === "number" ? c.dados.ordem : 0);
  if (k === "entregue") return [...l].sort((a, b) => (b.dados.colunaEm ?? 0) - (a.dados.colunaEm ?? 0));
  return [...l].sort((a, b) => o(a) - o(b) || a.id.localeCompare(b.id));
}

/* ───────────── filtros ───────────── */

export type Filtro = { busca: string; cliente: string; resp: string };
export const FILTRO_VAZIO: Filtro = { busca: "", cliente: "todos", resp: "todos" };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Passa no filtro? `resp`: todos | meus | ninguem | <sub>. `cliente`: todos | sem | <id>. Busca no título e no briefing. */
export function passaFiltro(c: CardQ, f: Filtro, eu: string, nomeCliente?: (id?: string) => string): boolean {
  const d = c.dados;
  if (f.resp === "meus" && d.resp !== eu) return false;
  if (f.resp === "ninguem" && d.resp) return false;
  if (!["todos", "meus", "ninguem"].includes(f.resp) && d.resp !== f.resp) return false;
  if (f.cliente === "sem" && d.cliente) return false;
  if (!["todos", "sem"].includes(f.cliente) && d.cliente !== f.cliente) return false;
  const q = semAcento(f.busca.trim());
  if (q) {
    const alvo = semAcento([d.tema, d.briefing ?? "", nomeCliente?.(d.cliente) ?? ""].join(" "));
    if (!q.split(/\s+/).every((p) => alvo.includes(p))) return false;
  }
  return true;
}

/* ───────────── datas ───────────── */

const D2 = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${D2(d.getMonth() + 1)}-${D2(d.getDate())}`;
export const hoje = () => iso(new Date());
const doISO = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
};
export const somaDias = (s: string, n: number) => {
  const d = doISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "hoje", "amanhã", "ontem", o dia da semana (próximos 6 dias) ou dd/mm. */
export function rotuloDia(s?: string, h = hoje()): string {
  if (!s) return "";
  if (s === h) return "hoje";
  if (s === somaDias(h, 1)) return "amanhã";
  if (s === somaDias(h, -1)) return "ontem";
  const dif = (doISO(s).getTime() - doISO(h).getTime()) / 864e5;
  if (dif > 1 && dif < 7) return DIAS[doISO(s).getDay()];
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

/** Estado do prazo de entrega: atrasado ou hoje só enquanto o card é trabalho da equipe. */
export function estadoPrazo(d: Pick<DadosCard, "prazo" | "coluna">, h = hoje()): "atrasado" | "hoje" | "ok" | null {
  if (!d.prazo) return null;
  if (!emTrabalho(d.coluna)) return "ok";
  return d.prazo < h ? "atrasado" : d.prazo === h ? "hoje" : "ok";
}

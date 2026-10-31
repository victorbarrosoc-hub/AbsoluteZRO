/**
 * A área do freela (drizzle/0037, titular 30/10/2026): quem tem a conta Absolute ZRO ligada a um freela de uma ou mais
 * produtoras entra no Maestro e vê "Seus trabalhos". Tudo pela porta estreita (`asFreela`: a pessoa da sessão, sem
 * organização): o banco confere `freelas.zro_sub` linha a linha e devolve só o que está em `Trabalho`. A pessoa vem
 * sempre da sessão, nunca da tela. Confirmar e recusar gravam em `escala_respostas` com o RLS do freela.
 *
 * Sem "server-only" para os testes; as funções puras (`separar`, `periodo`, `horario`) servem à tela.
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG } from "@/lib/db/client";
import { ehUuid, falha, type Res } from "@/lib/crm/comum";
import { diasEntre, hojeBr } from "@/lib/dinheiro";

export type MarcaDaProdutora = { nome: string; cor: string | null; logo: string | null };
export type ProdutoraDoFreela = MarcaDaProdutora & { org: string };
export type Resposta = "confirmado" | "recusado";

export type Trabalho = {
  id: string;
  org: string;
  titulo: string;
  /** O projeto, quando o título é o da diária. */
  projeto: string | null;
  /** null quando a produtora não mostra o cliente (Ajustes → Empresa) ou não há cliente. */
  cliente: string | null;
  tipo: "diaria" | "entrega" | "reuniao" | "outro" | null;
  funcao: string;
  inicio: string;
  fim: string;
  dias: number;
  horaIni: string | null;
  horaFim: string | null;
  local: string | null;
  diariaCents: number | null;
  valorCents: number;
  aluguelCents: number;
  pago: boolean;
  resposta: Resposta | null;
  entrega: string | null;
  temRecado: boolean;
};

export type DetalheDoTrabalho = Trabalho & {
  recado: string | null;
  contato: { telefone: string | null; email: string | null };
  marca: MarcaDaProdutora;
};

export type ProdutoraComTrabalhos = { org: string; marca: MarcaDaProdutora; trabalhos: Trabalho[] };

const numero = (v: unknown) => (v == null ? null : Number(v));

function trabalhoDe(j: Record<string, unknown>): Trabalho {
  return {
    id: String(j.id),
    org: String(j.org),
    titulo: String(j.titulo ?? "Trabalho"),
    projeto: (j.projeto as string | null) ?? null,
    cliente: (j.cliente as string | null) ?? null,
    tipo: (j.tipo as Trabalho["tipo"]) ?? null,
    funcao: String(j.funcao ?? ""),
    inicio: String(j.inicio),
    fim: String(j.fim),
    dias: Number(j.dias ?? 1),
    horaIni: (j.horaIni as string | null) ?? null,
    horaFim: (j.horaFim as string | null) ?? null,
    local: (j.local as string | null) ?? null,
    diariaCents: numero(j.diariaCents),
    valorCents: Number(j.valorCents ?? 0),
    aluguelCents: Number(j.aluguelCents ?? 0),
    pago: j.pago === true,
    resposta: j.resposta === "confirmado" || j.resposta === "recusado" ? j.resposta : null,
    entrega: typeof j.entrega === "string" && j.entrega.startsWith("https://") ? j.entrega : null,
    temRecado: j.temRecado === true,
  };
}

const marcaDe = (m: Record<string, unknown> | null | undefined): MarcaDaProdutora => ({
  nome: String(m?.nome ?? "Produtora"),
  cor: (m?.cor as string | null) ?? null,
  logo: (m?.logo as string | null) ?? null,
});

/** As produtoras em que a pessoa é freela ligada (e não é da equipe). Vazio = não é freela de ninguém. */
export async function produtorasDoFreela(sub: string): Promise<ProdutoraDoFreela[]> {
  if (!ehUuid(sub)) return [];
  const [r] = (await getBanco().asFreela(sub, (tx) => tx.execute(sql`select maestro.freela_produtoras() as j`))) as unknown as {
    j: Record<string, unknown>[];
  }[];
  return (r?.j ?? []).map((p) => ({ org: String(p.org), ...marcaDe(p) }));
}

/** "Seus trabalhos": cada produtora (com a marca) e os trabalhos dela, em ordem de data. */
export async function trabalhosDoFreela(sub: string): Promise<ProdutoraComTrabalhos[]> {
  if (!ehUuid(sub)) return [];
  const [r] = (await getBanco().asFreela(sub, (tx) => tx.execute(sql`select maestro.freela_trabalhos() as j`))) as unknown as {
    j: { org: string; marca: Record<string, unknown>; trabalhos: Record<string, unknown>[] }[];
  }[];
  return (r?.j ?? []).map((p) => ({ org: String(p.org), marca: marcaDe(p.marca), trabalhos: (p.trabalhos ?? []).map(trabalhoDe) }));
}

/** Um trabalho com o recado e o contato da produtora; null = não existe ou não é desta pessoa (a mesma resposta). */
export async function trabalhoDoFreela(sub: string, id: string): Promise<DetalheDoTrabalho | null> {
  if (!ehUuid(sub) || !ehUuid(id)) return null;
  const [r] = (await getBanco().asFreela(sub, (tx) => tx.execute(sql`select maestro.freela_trabalho(${id}::uuid) as j`))) as unknown as {
    j: Record<string, unknown> | null;
  }[];
  const j = r?.j;
  if (!j) return null;
  const contato = (j.contato ?? {}) as Record<string, unknown>;
  return {
    ...trabalhoDe(j),
    recado: (j.recado as string | null) ?? null,
    contato: { telefone: (contato.telefone as string | null) ?? null, email: (contato.email as string | null) ?? null },
    marca: marcaDe(j.marca as Record<string, unknown>),
  };
}

/**
 * Confirmar ou recusar um trabalho (de novo = troca a resposta). Só a própria pessoa, só trabalho dela e só enquanto
 * não passou: o banco confere (RLS do freela e o gatilho `escala_respostas_guarda`) e audita.
 */
export async function responderTrabalho(sub: string, id: string, resposta: string): Promise<Res> {
  if (resposta !== "confirmado" && resposta !== "recusado") return falha("resposta", "Escolha confirmar ou recusar.");
  if (!ehUuid(sub) || !ehUuid(id)) return falha("nao_existe", "Esse trabalho não está mais aqui.");
  try {
    return await getBanco().asFreela(sub, async (tx) => {
      const [t] = (await tx.execute(sql`select (maestro.freela_trabalho(${id}::uuid) ->> 'org')::uuid as org`)) as unknown as { org: string | null }[];
      if (!t?.org) return falha("nao_existe", "Esse trabalho não está mais aqui.");
      await tx.execute(sql`
        insert into maestro.escala_respostas (org_id, escala_id, zro_sub, resposta, inicio, fim)
        values (${t.org}, ${id}, ${sub}, ${resposta}, current_date, current_date)
        on conflict (org_id, escala_id) do update set resposta = excluded.resposta`);
      return { ok: true as const };
    });
  } catch (e) {
    if (mensagemPg(e).includes("escala_resposta:passou")) return falha("passou", "Esse trabalho já passou.");
    if (codigoPg(e) === PG.rls) return falha("nao_existe", "Esse trabalho não está mais aqui.");
    throw e;
  }
}

/* ───────────── puro (a tela) ───────────── */

/** Próximos (de hoje em diante, o mais perto primeiro) e anteriores (o mais recente primeiro). */
export function separar<T extends { inicio: string; fim: string }>(trabalhos: T[], hoje = hojeBr()): { proximos: T[]; anteriores: T[] } {
  const proximos = trabalhos.filter((t) => t.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const anteriores = trabalhos.filter((t) => t.fim < hoje).sort((a, b) => b.inicio.localeCompare(a.inicio));
  return { proximos, anteriores };
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const diaDaSemana = (s: string) => SEMANA[new Date(`${s}T12:00:00Z`).getUTCDay()];
const diaMes = (s: string) => `${+s.slice(8, 10)} ${MESES[+s.slice(5, 7) - 1]}`;

/** "qua, 5 nov" ou "5–7 nov" / "30 out – 2 nov". */
export function periodo(inicio: string, fim: string): string {
  if (inicio === fim) return `${diaDaSemana(inicio)}, ${diaMes(inicio)}`;
  if (inicio.slice(0, 7) === fim.slice(0, 7)) return `${+inicio.slice(8, 10)}–${diaMes(fim)}`;
  return `${diaMes(inicio)} – ${diaMes(fim)}`;
}

/** "8h", "8h30 – 18h" ou null. */
export function horario(ini: string | null, fim: string | null): string | null {
  const h = (t: string) => {
    const [hh, mm] = t.split(":");
    return `${+hh}h${mm && mm !== "00" ? mm : ""}`;
  };
  if (!ini) return null;
  return fim ? `${h(ini)} – ${h(fim)}` : h(ini);
}

/** "Hoje", "Amanhã", "Em 5 dias" (para o próximo); null para os mais longe. */
export function quando(inicio: string, fim: string, hoje = hojeBr()): string | null {
  if (inicio <= hoje && fim >= hoje) return "Hoje";
  const d = diasEntre(hoje, inicio);
  if (d === 1) return "Amanhã";
  if (d > 1 && d <= 6) return `Em ${d} dias`;
  return null;
}

/** Pode responder enquanto o trabalho não passou. */
export const podeResponder = (t: Pick<Trabalho, "fim">, hoje = hojeBr()) => t.fim >= hoje;

/**
 * O Google Agenda pelas Conexões da Absolute ZRO (ADR 0026 do HUB; contrato em docs/integration-contracts/agenda.md).
 * O Maestro não fala com o Google: pede ao HUB, com o access token da sessão (escopo `zro.agenda`), e o HUB usa a
 * conexão que a pessoa fez uma vez na conta. Aqui ficam:
 * - o desenho puro de cada item do Maestro como evento (`eventoDoMaestro`, `prazoDoCard`), com ref estável
 *   (`evento-<id>`, `card-<id>`) e o hash do conteúdo (sem mudança, nada é mandado);
 * - o cliente da API do HUB (`naAgendaDoHub`), que traduz as respostas em estados para a tela.
 * Sem "server-only": os testes chamam direto.
 */
import { createHash } from "node:crypto";
import { acessoIa } from "@/lib/zro/ia";
import { emissor, ESCOPO_AGENDA } from "@/lib/zro/config";
import { basePonte } from "@/lib/sobedesce/ponte";
import { FUSO } from "./ics";

import { ehTipoGoogle, type TipoGoogle } from "./tipos-google";

export const APP_NO_HUB = "maestro";
export { ehTipoGoogle, TIPOS_GOOGLE, TIPOS_PADRAO, type TipoGoogle } from "./tipos-google";

/** O corpo do PUT /api/v1/agenda/eventos/maestro/{ref}. */
export type CorpoEvento = {
  titulo: string;
  inicio?: string;
  fim?: string;
  dia?: string;
  ate_dia?: string;
  local?: string;
  descricao?: string;
  fuso: string;
  ocupa: boolean;
  link: string;
};

export type ItemGoogle = { ref: string; tipo: TipoGoogle; corpo: CorpoEvento };

/** Minutos à frente do UTC no fuso, num instante. */
function deslocamento(t: number, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60_000) * 60_000) / 60_000);
}

/** "AAAA-MM-DD" + "HH:MM" no fuso de Brasília → RFC 3339 com o deslocamento certo daquele dia. */
export function horaLocal(data: string, hora: string, fuso = FUSO): string {
  const comoUtc = Date.parse(`${data}T${hora}:00Z`);
  const off = deslocamento(comoUtc - deslocamento(comoUtc, fuso) * 60_000, fuso);
  const sinal = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${data}T${hora}:00${sinal}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

const somarHora = (hora: string, min: number) => {
  const t = Math.min(+hora.slice(0, 2) * 60 + +hora.slice(3, 5) + min, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const NOME_TIPO: Record<string, string> = { diaria: "Diária", entrega: "Entrega", reuniao: "Reunião" };
const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type EventoParaGoogle = {
  id: string;
  tipo: string;
  titulo: string;
  data: string;
  dataFim: string | null;
  horaIni: string | null;
  horaFim: string | null;
  local: string | null;
  projeto: string | null;
  equipe: { nome: string; funcao: string }[];
};

/** Diária, entrega, reunião ou compromisso: título com o tipo, hora local, lugar, projeto e equipe. */
export function eventoDoMaestro(e: EventoParaGoogle, base: string): ItemGoogle {
  const tipo: TipoGoogle = ehTipoGoogle(e.tipo) && e.tipo !== "prazo" ? e.tipo : "outro";
  const titulo = corta(NOME_TIPO[e.tipo] ? `${NOME_TIPO[e.tipo]}: ${e.titulo}` : e.titulo, 200);
  const descricao = [
    e.projeto ? `Projeto: ${e.projeto}` : null,
    e.equipe.length ? `Equipe: ${e.equipe.map((p) => `${p.nome} (${p.funcao})`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const corpo: CorpoEvento = { titulo, fuso: FUSO, ocupa: tipo !== "entrega", link: `${base}/app/agenda/${e.id}` };
  if (e.horaIni) {
    const fimData = e.dataFim ?? e.data;
    let horaFim = e.horaFim ?? somarHora(e.horaIni, 60);
    if (fimData === e.data && horaFim <= e.horaIni) horaFim = somarHora(e.horaIni, 60);
    corpo.inicio = horaLocal(e.data, e.horaIni);
    corpo.fim = horaLocal(fimData, horaFim);
    if (corpo.fim <= corpo.inicio) corpo.fim = horaLocal(e.data, "23:59");
  } else {
    corpo.dia = e.data;
    corpo.ate_dia = e.dataFim ?? e.data;
  }
  if (e.local) corpo.local = corta(e.local, 300);
  if (descricao) corpo.descricao = corta(descricao, 4000);
  return { ref: `evento-${e.id}`, tipo, corpo };
}

/** Prazo de card: dia inteiro, "livre" (não bloqueia a agenda), com o cliente. */
export function prazoDoCard(k: { id: string; tema: string; prazo: string; cliente: string | null }, base: string): ItemGoogle {
  return {
    ref: `card-${k.id}`,
    tipo: "prazo",
    corpo: {
      titulo: corta(`Prazo: ${k.tema}`, 200),
      dia: k.prazo.slice(0, 10),
      ate_dia: k.prazo.slice(0, 10),
      ...(k.cliente ? { descricao: `Cliente: ${k.cliente}` } : {}),
      fuso: FUSO,
      ocupa: false,
      link: `${base}/app/quadro?card=${encodeURIComponent(k.id)}`,
    },
  };
}

/** sha256 do corpo com as chaves em ordem: o mesmo conteúdo, o mesmo hash. */
export function hashDoCorpo(c: CorpoEvento): string {
  const ordenado = Object.fromEntries(Object.entries(c).sort(([a], [b]) => (a < b ? -1 : 1)));
  return createHash("sha256").update(JSON.stringify(ordenado)).digest("hex");
}

// ───────────── cliente da API do HUB ─────────────

/** Estados que a tela mostra. `ok` = deu certo; os outros pedem algo da pessoa ou tentam depois. */
export type EstadoGoogle = "ok" | "sem_conexao" | "app_desligado" | "reconectar_zro" | "erro";

export type RespostaHub<T> = { ok: true; status: number; dados: T } | { ok: false; status: number; estado: EstadoGoogle; erro: string; conectar: string };

/** Onde a pessoa conecta o Google Agenda (na Absolute ZRO). */
export const urlConexoes = () => `${emissor()}/conexoes`;

/**
 * Uma chamada à Agenda do HUB com o token da sessão. Sem token, sem o escopo (login antigo) ou recusado: `reconectar_zro`.
 * `token` deixa o chamador reaproveitar o access token numa rodada (a sincronia pede uma vez só).
 */
export async function naAgendaDoHub<T = Record<string, unknown>>(
  sessaoId: string,
  metodo: "GET" | "PUT" | "DELETE",
  caminho: string,
  corpo?: unknown,
  o: { token?: string; agora?: number } = {},
): Promise<RespostaHub<T>> {
  const falha = (status: number, estado: EstadoGoogle, erro: string, conectar = urlConexoes()) => ({ ok: false as const, status, estado, erro, conectar });
  let token = o.token;
  if (!token) {
    const a = await acessoIa(sessaoId, o.agora ?? Date.now(), ESCOPO_AGENDA);
    if ("erro" in a) return a.erro === "reconectar" ? falha(401, "reconectar_zro", "reconectar_zro") : falha(502, "erro", "hub_indisponivel");
    token = a.at;
  }
  let res: Response;
  try {
    res = await fetch(`${basePonte()}/api/v1/agenda/${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return falha(502, "erro", "hub_indisponivel");
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) return { ok: true, status: res.status, dados: (j ?? {}) as T };
  const erro = typeof j?.error === "string" ? j.error : "hub";
  const det = (j?.details ?? {}) as Record<string, unknown>;
  const conectar = typeof det.conectar === "string" && /^https?:\/\//.test(det.conectar) ? det.conectar : urlConexoes();
  if (res.status === 401) return falha(401, "reconectar_zro", erro);
  if (erro === "sem_conexao") return falha(409, "sem_conexao", det.motivo === "reconectar" ? "reconectar_google" : "sem_conexao", conectar);
  if (erro === "app_desligado") return falha(403, "app_desligado", erro, conectar);
  return falha(res.status, "erro", erro);
}

export type EstadoDaConexao = {
  estado: EstadoGoogle | "indisponivel";
  conta: string | null;
  conectar: string;
};

/** Como está a conexão para a tela de Ajustes (GET /api/v1/agenda/conexao). */
export async function estadoDaConexao(sessaoId: string): Promise<EstadoDaConexao> {
  const r = await naAgendaDoHub<{ conectada: boolean; estado: string | null; conta_email: string | null; app_ligado: boolean; conectar: string }>(
    sessaoId,
    "GET",
    "conexao",
  );
  if (!r.ok) return { estado: r.estado === "erro" ? "indisponivel" : r.estado, conta: null, conectar: r.conectar };
  const conectar = typeof r.dados.conectar === "string" && /^https?:\/\//.test(r.dados.conectar) ? r.dados.conectar : urlConexoes();
  if (!r.dados.conectada) return { estado: "sem_conexao", conta: null, conectar };
  if (!r.dados.app_ligado) return { estado: "app_desligado", conta: r.dados.conta_email, conectar };
  return { estado: "ok", conta: r.dados.conta_email, conectar };
}

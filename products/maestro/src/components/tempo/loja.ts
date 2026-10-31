"use client";
/**
 * O estado do cronômetro no navegador: um só por aba, fora do React (a pílula, o painel, o play de cada card e o selo
 * de tempo assinam só o pedaço que usam, com `useSyncExternalStore`; o card do Quadro não desenha de novo quando o
 * cronômetro anda). A verdade é o servidor (`/api/tempo`): toda resposta traz o estado inteiro e o relógio do servidor,
 * e a tela guarda o `desvio` (relógio do servidor − o da aba) para contar do `inicio` gravado. Otimista no toque
 * (o play responde na hora), com volta se o servidor recusar. Poll de 15 s com a aba à vista, e na volta do foco: o
 * que outro aparelho fez aparece aqui.
 */
import { useSyncExternalStore } from "react";
import type { CardDoTempo, Modo, Registro } from "@/lib/tempo/calculo";
import { cronometroDoApp, lerParadoDoApp } from "./desktop";

export type AbaPainel = "agora" | "hoje" | "semana";
/** O parado que a tela pergunta: de quando (último gesto) até quando (a volta), no relógio do servidor. */
export type Parado = { desde: number; ate: number; registro: string };
export type Aviso = { id: number; texto: string; desfazer?: () => void };

export type EstadoTempo = {
  carregado: boolean;
  pode: boolean;
  time: boolean;
  /** relógio do servidor − relógio da aba (ms) */
  desvio: number;
  rodando: Registro | null;
  hoje: Registro[];
  totais: Record<string, number>;
  cards: Record<string, CardDoTempo>;
  clientes: Record<string, string>;
  /** o último card (para "Retomar" com nada rodando) */
  ultimo: string | null;
  aberto: boolean;
  aba: AbaPainel;
  modo: Modo;
  parado: Parado | null;
  aviso: Aviso | null;
  /** muda a cada troca de tarefa: a pílula refaz a entrada (troca fluida) */
  troca: number;
};

type Resposta = {
  agora: string;
  rodando: Registro | null;
  hoje: Registro[];
  totais: Record<string, number>;
  cards: Record<string, CardDoTempo>;
  clientes?: Record<string, string>;
  time: boolean;
  pode?: boolean;
};

let s: EstadoTempo = {
  carregado: false,
  pode: false,
  time: false,
  desvio: 0,
  rodando: null,
  hoje: [],
  totais: {},
  cards: {},
  clientes: {},
  ultimo: null,
  aberto: false,
  aba: "agora",
  modo: "livre",
  parado: null,
  aviso: null,
  troca: 0,
};
const ouvintes = new Set<() => void>();
function mudar(p: Partial<EstadoTempo>) {
  s = { ...s, ...p };
  for (const f of ouvintes) f();
}
export const lerEstado = () => s;
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};

/** Assina um pedaço do estado (o mesmo valor = não desenha de novo). */
export function useTempo<T>(escolher: (e: EstadoTempo) => T): T {
  return useSyncExternalStore(
    assinar,
    () => escolher(s),
    () => escolher(INICIAL),
  );
}
const INICIAL = s;

/** O agora no relógio do servidor. */
export const agoraServidor = () => Date.now() + s.desvio;

/** Títulos e clientes que o Quadro já tem (o play mostra o título na pílula antes da resposta). */
const conhecidos = new Map<string, CardDoTempo>();
const clientesConhecidos = new Map<string, string>();
export function conhecerCards(lista: CardDoTempo[], clientes: { id: string; nome: string }[] = []) {
  for (const c of lista) conhecidos.set(c.id, c);
  for (const c of clientes) clientesConhecidos.set(c.id, c.nome);
}
export const nomeDoCliente = (id: string | null | undefined) => (id ? (s.clientes[id] ?? clientesConhecidos.get(id) ?? "") : "");
export const cardDoTempo = (id: string | null | undefined): CardDoTempo | null => (id ? (s.cards[id] ?? conhecidos.get(id) ?? null) : null);

function adotar(r: Resposta, recebidoEm: number) {
  const meio = (recebidoEm + Date.now()) / 2;
  const antes = s.rodando;
  const ultimo = r.rodando?.card ?? [...r.hoje].sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))[0]?.card ?? s.ultimo;
  mudar({
    carregado: true,
    pode: r.pode ?? s.pode,
    time: r.time,
    desvio: Date.parse(r.agora) - meio,
    rodando: r.rodando,
    hoje: r.hoje,
    totais: r.totais,
    cards: { ...s.cards, ...r.cards },
    clientes: { ...s.clientes, ...(r.clientes ?? {}) },
    ultimo,
    modo: r.rodando?.modo ?? s.modo,
    troca: (antes?.id ?? null) !== (r.rodando?.id ?? null) && antes?.card !== r.rodando?.card ? s.troca + 1 : s.troca,
  });
}

let avisoN = 0;
export function avisar(texto: string, desfazer?: () => void) {
  mudar({ aviso: { id: ++avisoN, texto, desfazer } });
}
export const fecharAviso = () => mudar({ aviso: null });

async function pedir(corpo: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const ida = Date.now();
  try {
    const r = await fetch("/api/tempo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      avisar(typeof d.mensagem === "string" ? d.mensagem : "Não deu agora. Tente de novo.");
      await carregar();
      return null;
    }
    if (d.estado) adotar(d.estado as Resposta, ida);
    return d;
  } catch {
    avisar("Sem conexão. O tempo não foi gravado.");
    await carregar();
    return null;
  }
}

let carregando: Promise<void> | null = null;
export function carregar(): Promise<void> {
  if (carregando) return carregando;
  const ida = Date.now();
  carregando = fetch("/api/tempo", { cache: "no-store" })
    .then(async (r) => {
      if (r.ok) adotar((await r.json()) as Resposta, ida);
      else if (r.status === 401 || r.status === 403) mudar({ carregado: true, pode: false });
    })
    .catch(() => {})
    .finally(() => {
      carregando = null;
    });
  return carregando;
}

/** Começa (ou troca para) o card: na hora na tela, depois o servidor confirma. */
export async function iniciar(card: string, modo: Modo = s.modo) {
  if (!s.pode) return;
  const agora = new Date(agoraServidor()).toISOString();
  const antes = s.rodando;
  const hoje = s.hoje.map((r) => (r.id === antes?.id ? { ...r, fim: agora } : r));
  const otimista: Registro = { id: `novo-${Date.now()}`, sub: "", card, inicio: agora, fim: null, origem: "cronometro", modo, motivo: null };
  mudar({ rodando: otimista, hoje: [...hoje, otimista], modo, ultimo: card, parado: null, troca: antes?.card !== card ? s.troca + 1 : s.troca });
  await pedir({ op: "iniciar", card, modo });
}

export async function pausar() {
  const r = s.rodando;
  if (!r) return;
  const agora = new Date(agoraServidor()).toISOString();
  mudar({ rodando: null, hoje: s.hoje.map((x) => (x.id === r.id ? { ...x, fim: agora } : x)), parado: null });
  await pedir({ op: "pausar" });
}

/** O play do card: rodando nele pausa; senão começa nele (e o anterior pausa). */
export function alternar(card: string) {
  if (s.rodando?.card === card) return pausar();
  return iniciar(card);
}

export async function trocarModo(modo: Modo) {
  if (modo === s.modo) return;
  mudar({ modo });
  // rodando: a sessão nova já nasce no modo escolhido (o tempo do card continua somando)
  if (s.rodando) await iniciar(s.rodando.card, modo);
}

export const abrirPainel = (aba?: AbaPainel) => mudar({ aberto: true, aba: aba ?? s.aba });
export const fecharPainel = () => mudar({ aberto: false });
export const alternarPainel = () => mudar({ aberto: !s.aberto });
export const escolherAba = (aba: AbaPainel) => mudar({ aba });

/* ───── parado ───── */

export const marcarParado = (p: Parado | null) => mudar({ parado: p });
export async function resolverParado(descartar: boolean) {
  const p = s.parado;
  mudar({ parado: null });
  if (p && descartar) await pedir({ op: "parado", desde: new Date(p.desde).toISOString(), continuar: true });
  // no app de computador quem perguntou foi o app: ele tira a pergunta da barra também
  cronometroDoApp()?.paradoResolvido();
}

/* ───── Ajustar e Zerar ───── */

export async function adicionarTempo(card: string, minutos: number, motivo: string) {
  const d = await pedir({ op: "adicionar", card, minutos, motivo });
  if (d) avisar("Tempo somado.");
  return !!d;
}

export async function ajustarSessao(id: string, campos: { inicio?: string; fim?: string; motivo?: string }) {
  return !!(await pedir({ op: "ajustar", id, ...campos }));
}

export async function apagarSessao(id: string) {
  const d = await pedir({ op: "apagar", id });
  const ids = (d?.ids as string[] | undefined) ?? [];
  if (ids.length) avisar("Sessão tirada.", () => void pedir({ op: "restaurar", ids }));
  return !!d;
}

export async function zerarCard(card: string) {
  const d = await pedir({ op: "zerar", card });
  const ids = (d?.ids as string[] | undefined) ?? [];
  if (ids.length) avisar("Tempo zerado.", () => void pedir({ op: "restaurar", ids }));
}

/* ───── a vida da loja: primeira carga, poll e foco ───── */

let ligada = false;
export function ligarLoja() {
  if (ligada || typeof window === "undefined") return () => {};
  ligada = true;
  void carregar();
  const t = setInterval(() => {
    if (document.visibilityState === "visible") void carregar();
  }, 15_000);
  const volta = () => {
    if (document.visibilityState === "visible") void carregar();
  };
  document.addEventListener("visibilitychange", volta);
  window.addEventListener("focus", volta);
  // no app de computador: a barra mudou o tempo (relê), pediu o painel e mandou o parado que o sistema viu
  const app = cronometroDoApp();
  const soltar = app
    ? [app.aoMudar(() => void carregar()), app.aoAbrirPainel(() => abrirPainel("agora")), app.aoParado((v) => mudar({ parado: lerParadoDoApp(v) }))]
    : [];
  return () => {
    ligada = false;
    for (const f of soltar) f();
    clearInterval(t);
    document.removeEventListener("visibilitychange", volta);
    window.removeEventListener("focus", volta);
  };
}

/** Só para a tela "Tempo" e os testes: o estado como está. */
export const instantaneo = () => s;

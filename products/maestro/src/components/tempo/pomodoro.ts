"use client";
/**
 * O modo Pomodoro do cronômetro (foco, pausa e pausa longa configuráveis). O foco É uma sessão do cronômetro (o tempo
 * do card soma no servidor); a pausa é só da tela. Fica no localStorage deste aparelho (preferências e a fase), sempre
 * conferido por `lerPomodoro`. Avisos no fim de cada fase: notificação do navegador (se a pessoa permitiu) e um som
 * curto gerado na hora (sem arquivo).
 */
import { useSyncExternalStore } from "react";
import { lerPomodoro, OCIOSO_PADRAO_MIN, POMODORO_PADRAO, type ConfigPomodoro } from "@/lib/tempo/calculo";
import { cronometroDoApp } from "./desktop";

export type Fase = "foco" | "pausa" | "longa" | "pronto";
export type EstadoPomodoro = {
  config: ConfigPomodoro;
  /** minutos parado antes de perguntar (0 = não perguntar) */
  ociosoMin: number;
  fase: Fase;
  /** focos completos no ciclo */
  feitos: number;
  /** foco já feito antes da sessão que roda (pausou no meio) */
  acumulado: number;
  /** a pausa: quando começou e quanto dura (relógio do servidor) */
  pausaDe: number | null;
  pausaMs: number;
};

const CHAVE = "mae:pomodoro:v1";
const PADRAO: EstadoPomodoro = { config: POMODORO_PADRAO, ociosoMin: OCIOSO_PADRAO_MIN, fase: "pronto", feitos: 0, acumulado: 0, pausaDe: null, pausaMs: 0 };

function ler(): EstadoPomodoro {
  try {
    return conferir(JSON.parse(localStorage.getItem(CHAVE) ?? "null"));
  } catch {
    return PADRAO;
  }
}

/** Confere um estado guardado (ou vindo do app de computador): fora da forma, o padrão de cada campo. */
function conferir(bruto: unknown): EstadoPomodoro {
  const v = bruto && typeof bruto === "object" ? (bruto as Partial<EstadoPomodoro>) : null;
  if (!v) return PADRAO;
  const fase: Fase = v.fase === "foco" || v.fase === "pausa" || v.fase === "longa" ? v.fase : "pronto";
  const num = (x: unknown, min: number, max: number, p: number) => (typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? x : p);
  return {
    config: lerPomodoro(v.config),
    ociosoMin: num(v.ociosoMin, 0, 120, OCIOSO_PADRAO_MIN),
    fase,
    feitos: num(v.feitos, 0, 1000, 0),
    acumulado: num(v.acumulado, 0, 4 * 3600_000, 0),
    pausaDe: typeof v.pausaDe === "number" && Number.isFinite(v.pausaDe) ? v.pausaDe : null,
    pausaMs: num(v.pausaMs, 0, 3600_000, 0),
  };
}

let p: EstadoPomodoro = PADRAO;
let lido = false;
const ouvintes = new Set<() => void>();
const garantir = () => {
  if (!lido && typeof window !== "undefined") {
    lido = true;
    p = ler();
  }
  return p;
};
/** Muda o Pomodoro (e guarda). No app de computador, o que a pessoa mudou aqui vai para o app, que conduz as fases. */
export function mudarPomodoro(m: Partial<EstadoPomodoro>, doApp = false) {
  p = { ...garantir(), ...m };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {}
  for (const f of ouvintes) f();
  // a fase só vai quando a pessoa mexeu nela (encerrar a pausa); mudar o tempo do foco não mexe na fase do app
  if (!doApp) cronometroDoApp()?.pomodoro({ config: p.config, ociosoMin: p.ociosoMin, fase: "fase" in m ? p.fase : undefined });
}

/**
 * No app de computador: a fase, os focos e a pausa vêm do app (ele avisa no fim do foco e da pausa, também com a janela
 * fechada). Ao ligar, manda as preferências daqui (o painel é onde elas mudam) e pede o estado do app.
 */
export function ligarPomodoroDoApp(): () => void {
  const app = cronometroDoApp();
  if (!app) return () => {};
  const soltar = app.aoPomodoro((v) => mudarPomodoro(conferir(v), true));
  const atual = garantir();
  app.pomodoro({ config: atual.config, ociosoMin: atual.ociosoMin });
  app.pronto();
  return soltar;
}
export const lerPomodoroAtual = () => garantir();
export function usePomodoro<T>(escolher: (e: EstadoPomodoro) => T): T {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => escolher(garantir()),
    () => escolher(PADRAO),
  );
}

/* ───── avisos ───── */

/** Pede a permissão de notificação (só num gesto da pessoa: trocar para Pomodoro). */
export function pedirNotificacao() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {}
}

export function notificar(titulo: string, corpo: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible")
      new Notification(titulo, { body: corpo, icon: "/pwa/icone-192.png", tag: "maestro-cronometro", silent: true });
  } catch {}
  tocarSom();
}

/** Dois toques curtos e baixos (Mi e Lá), feitos na hora pelo Web Audio. */
export function tocarSom() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    for (const [i, f] of [659.25, 880].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = t0 + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    }
    setTimeout(() => void ctx.close().catch(() => {}), 1200);
  } catch {}
}

"use client";
/**
 * O modo Pomodoro do cronômetro (foco, pausa e pausa longa configuráveis). O foco É uma sessão do cronômetro (o tempo
 * do card soma no servidor); a pausa é só da tela. Fica no localStorage deste aparelho (preferências e a fase), sempre
 * conferido por `lerPomodoro`. Avisos no fim de cada fase: notificação do navegador (se a pessoa permitiu) e um som
 * curto gerado na hora (sem arquivo).
 */
import { useSyncExternalStore } from "react";
import { lerPomodoro, OCIOSO_PADRAO_MIN, POMODORO_PADRAO, type ConfigPomodoro } from "@/lib/tempo/calculo";

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
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Partial<EstadoPomodoro> | null;
    if (!v) return PADRAO;
    const fase: Fase = v.fase === "foco" || v.fase === "pausa" || v.fase === "longa" ? v.fase : "pronto";
    const num = (x: unknown, min: number, max: number, p: number) => (typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? x : p);
    return {
      config: lerPomodoro(v.config),
      ociosoMin: num(v.ociosoMin, 0, 120, OCIOSO_PADRAO_MIN),
      fase,
      feitos: num(v.feitos, 0, 1000, 0),
      acumulado: num(v.acumulado, 0, 4 * 3600_000, 0),
      pausaDe: typeof v.pausaDe === "number" ? v.pausaDe : null,
      pausaMs: num(v.pausaMs, 0, 3600_000, 0),
    };
  } catch {
    return PADRAO;
  }
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
export function mudarPomodoro(m: Partial<EstadoPomodoro>) {
  p = { ...garantir(), ...m };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {}
  for (const f of ouvintes) f();
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

"use client";
/**
 * A ponte com o app de computador (products/maestro/desktop, 0.2.0+): lá o cronômetro também mora na barra de menus
 * (Mac) e na bandeja (Windows), funciona com a janela fechada e é ele quem conduz o Pomodoro e pergunta o parado pelo
 * sistema (ociosidade, suspensão). Dentro do app a página só mostra: relê o tempo quando a barra mudou, abre o painel
 * quando pedem, mostra a fase do Pomodoro e o "Manter/Descartar" que o app mandou, e conta ao app as preferências do
 * painel. No navegador (ou num app antigo, sem `cronometro`) nada disso existe e a página faz tudo como sempre.
 */
export type ParadoDoApp = { desde: number; ate: number; registro: string };

type Cronometro = {
  versao: number;
  aoMudar(cb: () => void): () => void;
  aoPomodoro(cb: (p: unknown) => void): () => void;
  aoParado(cb: (p: unknown) => void): () => void;
  aoAbrirPainel(cb: () => void): () => void;
  pronto(): void;
  pomodoro(p: unknown): void;
  paradoResolvido(): void;
};

/** O cronômetro do app, se a página está no app de computador que o tem. */
export function cronometroDoApp(): Cronometro | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { maestroDesktop?: { cronometro?: Cronometro } }).maestroDesktop?.cronometro;
  return c && typeof c.aoMudar === "function" && typeof c.pronto === "function" ? c : null;
}

/** O app cuida do Pomodoro e do parado (a página não conduz nem pergunta por conta própria). */
export const appCuida = () => cronometroDoApp() !== null;

/** O parado que veio do app, conferido. */
export function lerParadoDoApp(v: unknown): ParadoDoApp | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  if (!n(o.desde) || !n(o.ate) || typeof o.registro !== "string" || (o.ate as number) < (o.desde as number)) return null;
  return { desde: o.desde as number, ate: o.ate as number, registro: o.registro };
}

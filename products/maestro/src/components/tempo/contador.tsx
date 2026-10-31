"use client";
/**
 * O número que anda (cronômetro grande, pílula, selo do card). Nada de estado do React por segundo: um intervalo
 * curto escreve direto no DOM só quando o texto muda, e cada dígito que trocou entra com uma animação curta do próprio
 * navegador (Web Animations, sobe e aparece). Com "reduzir movimento", troca sem animar. A conta é do relógio do
 * servidor: `de` é o `inicio` gravado e `agora` é o relógio da aba + o desvio (src/components/tempo/loja.ts).
 */
import { useEffect, useRef } from "react";
import { contagem, duracaoCurta, duracaoFalada, relogio } from "@/lib/tempo/calculo";
import { agoraServidor } from "./loja";

export type Formato = "relogio" | "contagem" | "curto" | "falado";
const FORMATOS: Record<Formato, (ms: number) => string> = { relogio, contagem, curto: duracaoCurta, falado: duracaoFalada };

function valor(de: number | null, base: number, regressivo: number | null): number {
  const andou = base + (de === null ? 0 : Math.max(0, agoraServidor() - de));
  return regressivo === null ? andou : Math.max(0, regressivo - andou);
}

const calmo = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Contador({
  de,
  base = 0,
  regressivo = null,
  formato = "relogio",
  rolar = false,
  className,
  aoZerar,
}: {
  /** O início (ms, relógio do servidor) do que roda; null = parado. */
  de: number | null;
  /** O que já tinha antes (ms). */
  base?: number;
  /** Contagem regressiva a partir deste total (ms): o Pomodoro. */
  regressivo?: number | null;
  formato?: Formato;
  /** Cada dígito que muda entra com a animação (o cronômetro grande e a pílula). */
  rolar?: boolean;
  className?: string;
  /** A contagem regressiva chegou a zero (uma vez). */
  aoZerar?: () => void;
}) {
  const caixa = useRef<HTMLSpanElement>(null);
  const zerou = useRef(aoZerar);
  useEffect(() => {
    zerou.current = aoZerar;
  });
  const texto = FORMATOS[formato](valor(de, base, regressivo));

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let anterior = "";
    let avisou = false;
    const escrever = () => {
      const ms = valor(de, base, regressivo);
      const t = FORMATOS[formato](ms);
      if (regressivo !== null && ms <= 0 && de !== null && !avisou) {
        avisou = true;
        zerou.current?.();
      }
      if (t === anterior) return;
      if (!rolar || t.length !== anterior.length || el.children.length !== t.length) {
        el.replaceChildren(
          ...[...t].map((ch) => {
            const s = document.createElement("span");
            s.className = /\d/.test(ch) ? "tp-d" : "tp-s";
            s.textContent = ch;
            return s;
          }),
        );
      } else {
        const sem = calmo();
        [...t].forEach((ch, i) => {
          if (ch === anterior[i]) return;
          const s = el.children[i] as HTMLElement;
          s.textContent = ch;
          if (!sem && typeof s.animate === "function")
            s.animate(
              [
                { transform: "translateY(38%)", opacity: 0, filter: "blur(2px)" },
                { transform: "none", opacity: 1, filter: "none" },
              ],
              { duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
            );
        });
      }
      anterior = t;
    };
    escrever();
    if (de === null) return;
    const t = setInterval(escrever, 250);
    return () => clearInterval(t);
  }, [de, base, regressivo, formato, rolar]);

  // o servidor e a primeira pintura escrevem o texto inteiro; depois o efeito cuida dos filhos (por isso o React não
  // tem filho aqui para reconciliar: só o HTML inicial)
  const html = texto.replace(/[&<>"']/g, "");
  return (
    <span ref={caixa} className={`tp-num ${className ?? ""}`.trim()} aria-hidden="true" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
  );
}

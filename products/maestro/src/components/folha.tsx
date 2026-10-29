"use client";
/**
 * A folha do Maestro (ficha do card, "Mover para…" e o que mais abrir por cima da tela), no jeito Apple:
 * - o véu cobre a janela inteira (vai direto no <body> por portal: nada de ficar preso num pedaço da tela) e desfoca;
 * - no computador, a folha no centro, do tamanho do conteúdo (rola por dentro passando da altura); no celular, a folha
 *   de baixo com a alça, que fecha ao ser puxada;
 * - entra e sai com a mola (transform + opacidade, só CSS); com "reduzir movimento", aparece e some na hora;
 * - foco preso dentro, Esc fecha, clique no véu fecha e o foco volta para quem abriu.
 * Nada de estado por quadro: o arrasto da alça mexe só no estilo do elemento.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const nada = () => () => {};
/** No servidor (e na hidratação) a folha sai no lugar; depois de montar, vai para o <body>. */
function useNoNavegador() {
  return useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );
}

const SAIDA_MS = 220;

/** Fechar com a animação de saída (botão Fechar, Cancelar). Fora de uma folha, não faz nada. */
const Fechar = createContext<() => void>(() => {});
export const useFecharFolha = () => useContext(Fechar);
const calmo = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type FolhaProps = {
  rotulo: string;
  aoFechar: () => void;
  /** "ficha" (larga) ou "acao" (estreita, uma lista curta). */
  tamanho?: "ficha" | "acao";
  /** Classe extra do véu (os testes e o CSS antigos procuram `.q-veu--ficha`). */
  veuClasse?: string;
  className?: string;
  children: ReactNode;
};

export function Folha({ rotulo, aoFechar, tamanho = "ficha", veuClasse = "", className = "", children }: FolhaProps) {
  const noNavegador = useNoNavegador();
  const caixa = useRef<HTMLDivElement>(null);
  const [saindo, setSaindo] = useState(false);
  const fechou = useRef(false);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  });

  const fechar = useCallback(() => {
    if (fechou.current) return;
    fechou.current = true;
    if (calmo()) return aoFecharRef.current();
    setSaindo(true);
    setTimeout(() => aoFecharRef.current(), SAIDA_MS);
  }, []);

  // foco: guarda quem abriu, prende o Tab dentro, Esc fecha
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== "Tab" || !caixa.current) return;
      const els = [...caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!els.length) return;
      const primeiro = els[0];
      const ultimo = els[els.length - 1];
      const dentro = caixa.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === primeiro || !dentro)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    if (!caixa.current?.contains(document.activeElement)) {
      // quem está dentro decide o foco (a ficha foca o título); sem isso, a própria folha
      requestAnimationFrame(() => {
        if (caixa.current && !caixa.current.contains(document.activeElement)) caixa.current.focus({ preventScroll: true });
      });
    }
    return () => {
      document.removeEventListener("keydown", tecla);
      if (antes?.isConnected) antes.focus({ preventScroll: true });
    };
  }, [fechar]);

  /* ───── a alça (celular): puxar para baixo fecha ───── */
  const arraste = useRef<{ y: number; t: number } | null>(null);
  const aoPegar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    arraste.current = { y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (caixa.current) caixa.current.style.transition = "none";
  };
  const aoMover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!arraste.current || !caixa.current) return;
    const dy = Math.max(0, e.clientY - arraste.current.y);
    caixa.current.style.transform = `translateY(${dy}px)`;
  };
  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arraste.current;
    arraste.current = null;
    const el = caixa.current;
    if (!a || !el) return;
    const dy = Math.max(0, e.clientY - a.y);
    const v = dy / Math.max(1, performance.now() - a.t);
    el.style.transition = "";
    if (dy > 110 || v > 0.6) {
      el.style.transform = "";
      fechar();
    } else el.style.transform = "";
  };

  const folha = (
    <div
      className={`m-veu ${veuClasse}`.trim()}
      data-saindo={saindo || undefined}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        ref={caixa}
        className={`m-folha m-folha--${tamanho} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        tabIndex={-1}
        data-saindo={saindo || undefined}
      >
        <div className="m-folha__alca" aria-hidden="true" onPointerDown={aoPegar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
          <i />
        </div>
        <Fechar.Provider value={fechar}>{children}</Fechar.Provider>
      </div>
    </div>
  );
  return noNavegador ? createPortal(folha, document.body) : folha;
}

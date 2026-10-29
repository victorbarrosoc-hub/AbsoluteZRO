"use client";
/**
 * FLIP do Quadro: depois de cada mudança (arrastar, mover, filtrar, criar, apagar, o que chega de outro aparelho), os
 * cards que trocaram de lugar deslizam da posição antiga até a nova com a mola (Web Animations; nada de estado por
 * quadro no React). As posições são medidas em relação ao conteúdo do Quadro, então rolar a página ou o Quadro de lado
 * não conta como movimento. Com "reduzir movimento", nada desliza.
 */
import { useLayoutEffect, useRef, type RefObject } from "react";

type Pos = { x: number; y: number };
const MOLA = "cubic-bezier(0.32, 0.72, 0, 1)";

function medir(raiz: HTMLElement): Map<string, Pos> {
  const base = raiz.getBoundingClientRect();
  const m = new Map<string, Pos>();
  for (const el of raiz.querySelectorAll<HTMLElement>("[data-card]")) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    m.set(el.dataset.card!, { x: r.left - base.left + raiz.scrollLeft, y: r.top - base.top + raiz.scrollTop });
  }
  return m;
}

/**
 * Liga o FLIP num contêiner. `voo` (opcional) traz um card recém-criado de um retângulo da tela (o título da folha) até
 * o lugar dele na coluna.
 */
export function useFlip(raizRef: RefObject<HTMLElement | null>, vooRef: RefObject<{ id: string; de: DOMRect } | null>) {
  const antes = useRef<Map<string, Pos>>(new Map());

  // depois de cada render: compara com a última medida e anima o que andou
  useLayoutEffect(() => {
    const el = raizRef.current;
    if (!el) return;
    const agora = medir(el);
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!calmo) {
      for (const card of el.querySelectorAll<HTMLElement>("[data-card]")) {
        const id = card.dataset.card!;
        const a = antes.current.get(id);
        const b = agora.get(id);
        if (!a || !b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration: Math.min(520, 300 + Math.hypot(dx, dy) / 6),
          easing: MOLA,
          composite: "add",
        });
      }
      const v = vooRef.current;
      if (v) {
        vooRef.current = null;
        const card = el.querySelector<HTMLElement>(`[data-card="${CSS.escape(v.id)}"]`);
        if (card) {
          card.scrollIntoView({ block: "nearest", inline: "nearest" });
          const r = card.getBoundingClientRect();
          const sx = Math.max(0.4, Math.min(2.5, v.de.width / Math.max(1, r.width)));
          card.animate(
            [
              { transform: `translate(${v.de.left - r.left}px, ${v.de.top - r.top}px) scale(${sx})`, transformOrigin: "0 0", opacity: 0.2 },
              { transform: "translate(0, 0) scale(1)", transformOrigin: "0 0", opacity: 1 },
            ],
            { duration: 520, easing: MOLA },
          );
        }
      }
    } else vooRef.current = null;
    antes.current = agora;
  });

  // rolar e mudar o tamanho da janela mexem nas posições sem render: mede de novo (uma vez por quadro, no máximo)
  useLayoutEffect(() => {
    const el = raizRef.current;
    if (!el) return;
    let pedido = 0;
    const remedir = () => {
      if (pedido) return;
      pedido = requestAnimationFrame(() => {
        pedido = 0;
        if (raizRef.current && !raizRef.current.getAnimations({ subtree: true }).some((a) => a.playState === "running")) antes.current = medir(raizRef.current);
      });
    };
    window.addEventListener("resize", remedir, { passive: true });
    el.addEventListener("scroll", remedir, { passive: true });
    return () => {
      cancelAnimationFrame(pedido);
      window.removeEventListener("resize", remedir);
      el.removeEventListener("scroll", remedir);
    };
  }, [raizRef]);
}

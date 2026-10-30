"use client";
/**
 * FLIP do Quadro: depois de cada mudança (arrastar, mover, filtrar, criar, apagar, o que chega de outro aparelho), os
 * cards que trocaram de lugar deslizam da posição antiga até a nova com a mola (Web Animations; nada de estado por
 * quadro no React). As posições são medidas em relação ao conteúdo do Quadro, então rolar a página ou o Quadro de lado
 * não conta como movimento. Com "reduzir movimento", nada desliza.
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

type Pos = { x: number; y: number };
const MOLA = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Onde cada card está, pelo lugar dele (`.q-lugar`): o lugar não leva o FLIP nem o "assentar" do card, então a medida é
 * o layout (mais o espaço que o arrastar abriu com transform) e uma mudança no meio de outra não soma o deslize que
 * ainda está andando (o `composite: "add"` já soma).
 */
function medir(raiz: HTMLElement): Map<string, Pos> {
  const base = raiz.getBoundingClientRect();
  const m = new Map<string, Pos>();
  for (const el of raiz.querySelectorAll<HTMLElement>("[data-card]")) {
    const r = (el.parentElement?.classList.contains("q-lugar") ? el.parentElement : el).getBoundingClientRect();
    if (!r.width) continue;
    m.set(el.dataset.card!, { x: r.left - base.left + raiz.scrollLeft, y: r.top - base.top + raiz.scrollTop });
  }
  return m;
}

/** O card que já estava na tela não "chega" de novo: trocar de coluna remonta o elemento e o CSS repetiria a entrada
 * (`q-assenta`, que começa invisível). */
function semEntrada(card: HTMLElement) {
  for (const a of card.getAnimations()) if (a instanceof CSSAnimation && a.animationName === "q-assenta") a.finish();
}

/**
 * Liga o FLIP num contêiner. `voo` (opcional) traz um card recém-criado de um retângulo da tela (o título da folha) até
 * o lugar dele na coluna.
 */
export function useFlip(raizRef: RefObject<HTMLElement | null>, vooRef: RefObject<{ id: string; de: DOMRect } | null>) {
  const antes = useRef<Map<string, Pos>>(new Map());
  const elementos = useRef<Map<string, HTMLElement>>(new Map());
  /**
   * Mede agora (com o que estiver na tela, transform incluso) e toma isso como "antes" do próximo render. O arrastar do
   * celular (gestos.ts) chama logo antes de gravar: os cards já estão onde vão ficar, então nada desliza de novo. `em`
   * troca a medida de um card pelo retângulo dado (o card arrastado assenta onde o fantasma pousou).
   */
  const fixar = useCallback(
    (em?: { id: string; rect: DOMRect }) => {
      const el = raizRef.current;
      if (!el) return;
      const m = medir(el);
      if (em) {
        const base = el.getBoundingClientRect();
        m.set(em.id, { x: em.rect.left - base.left + el.scrollLeft, y: em.rect.top - base.top + el.scrollTop });
      }
      antes.current = m;
    },
    [raizRef],
  );

  // depois de cada render: compara com a última medida e anima o que andou
  useLayoutEffect(() => {
    const el = raizRef.current;
    if (!el) return;
    const agora = medir(el);
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vistos = new Map<string, HTMLElement>();
    for (const card of el.querySelectorAll<HTMLElement>("[data-card]")) {
      const id = card.dataset.card!;
      vistos.set(id, card);
      const era = elementos.current.get(id);
      if (era && era !== card) semEntrada(card);
      const a = antes.current.get(id);
      const b = agora.get(id);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (calmo || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) continue;
      const anim = card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: Math.min(520, 300 + Math.hypot(dx, dy) / 6),
        easing: MOLA,
        composite: "add",
      });
      // de uma coluna para outra: passa por cima das colunas do caminho
      if (Math.abs(dx) >= 1) {
        card.style.zIndex = "2";
        const solta = () => {
          if (!card.getAnimations().some((x) => x !== anim && x.playState === "running" && !(x instanceof CSSAnimation))) card.style.zIndex = "";
        };
        anim.finished.then(solta, solta);
      }
    }
    if (!calmo) {
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
    elementos.current = vistos;
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

  return fixar;
}

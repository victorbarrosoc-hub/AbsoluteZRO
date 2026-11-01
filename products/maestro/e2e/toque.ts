/**
 * Alvo de toque no iPhone (e2e/celular.spec.ts): todo botão, link, aba ou seletor à vista precisa de 44 × 44 px para o
 * dedo (Apple HIG). Conta a área de toque estendida por um ::after/::before posicionado com inset negativo (a regra de
 * `celular.css`), porque o desenho pode ser menor que o toque. Devolve uma linha por alvo pequeno.
 *
 * Ficam de fora: link no meio do texto (inline dentro de p/li/span), rótulo (`label`, o campo é o alvo), campo de
 * texto (a caixa dele é o alvo, e o `corte.ts` já confere a fonte), o que está escondido ou acima do topo da página e o
 * que pede `data-toque-livre` (com o motivo no JSX).
 */
import type { Page } from "@playwright/test";

export async function alvosPequenos(page: Page, minimo = 44): Promise<string[]> {
  return page.evaluate((MIN) => {
    const achados: string[] = [];
    const seletor = "button, a[href], select, summary, [role='button'], [role='tab'], [role='radio'], [role='switch'], [role='menuitem']";
    const descrever = (el: Element) => {
      const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      const txt = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 36);
      const pai = el.parentElement && typeof el.parentElement.className === "string" ? el.parentElement.className.trim().split(/\s+/)[0] : "";
      return `${pai ? `${pai} > ` : ""}${el.tagName.toLowerCase()}${cls}${txt ? ` "${txt}"` : ""}`;
    };
    const estendido = (el: Element) => {
      let [t, r, b, l] = [0, 0, 0, 0];
      for (const p of ["::after", "::before"]) {
        const cs = getComputedStyle(el, p);
        if (cs.content === "none" || cs.position !== "absolute") continue;
        t = Math.max(t, -parseFloat(cs.top) || 0);
        b = Math.max(b, -parseFloat(cs.bottom) || 0);
        l = Math.max(l, -parseFloat(cs.left) || 0);
        r = Math.max(r, -parseFloat(cs.right) || 0);
      }
      return { x: l + r, y: t + b };
    };
    for (const el of Array.from(document.querySelectorAll(seletor))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2 || r.bottom <= 0) continue;
      const ck = (el as HTMLElement).checkVisibility;
      if (typeof ck === "function" && !ck.call(el, { opacityProperty: true, visibilityProperty: true })) continue;
      if (el.closest("[aria-hidden='true'], [inert], [data-toque-livre], .sr-only")) continue;
      const cs = getComputedStyle(el);
      if (el.tagName === "A" && cs.display === "inline" && el.parentElement?.closest("p, li, span, small, figcaption, td")) continue;
      // o select dentro de um rótulo que já tem a altura do toque (a pílula de busca/filtro)
      const rotulo = el.closest("label");
      if (rotulo && rotulo.getBoundingClientRect().height >= MIN - 0.5 && rotulo.getBoundingClientRect().width >= MIN - 0.5) continue;
      const e = estendido(el);
      const w = r.width + e.x;
      const h = r.height + e.y;
      if (w < MIN - 0.5 || h < MIN - 0.5) achados.push(`alvo de ${Math.round(w)}×${Math.round(h)} px: ${descrever(el)}`);
    }
    return achados;
  }, minimo);
}

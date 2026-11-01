/**
 * Detector de corte no celular (e2e/sem-corte.spec.ts): procura conteúdo cortado dentro da própria caixa, que o
 * "sem rolagem de lado" da página não pega. Roda no navegador e devolve uma linha por achado:
 *
 * - texto ou controle que passa da borda de um ancestral que corta (overflow hidden/clip) ou da tela;
 * - texto cortado sem reticências (overflow hidden e scrollWidth > clientWidth);
 * - faixa com rolagem de lado que não foi marcada como faixa de propósito (`data-rolagem`);
 * - rótulo curto de botão, aba ou segmento ("15 dias") quebrado em duas linhas;
 * - placeholder de campo que não cabe (o select corta com reticências do sistema; só conta se passar da caixa);
 * - textos sobrepostos dentro do player (`[data-player]`) e a barra nativa do <video> sobre a imagem no toque;
 * - no celular, campo (input, select, textarea) com fonte abaixo de 16 px, que faz o Safari ampliar a página sozinho.
 *
 * Reticências (`text-overflow: ellipsis`) são corte de propósito; o resto é bug.
 */
import type { Page } from "@playwright/test";

export async function achadosDeCorte(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const achados: string[] = [];
    // No celular, uma página larga demais alarga a área de layout (é o zoom sozinho do Safari): a tela é o limite.
    const vw = Math.min(document.documentElement.clientWidth, window.screen.width || Infinity);
    const TOL = 1;
    const descrever = (el: Element) => {
      const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      const txt = (el.textContent || (el as HTMLInputElement).placeholder || "").replace(/\s+/g, " ").trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${cls}${txt ? ` "${txt}"` : ""}`;
    };
    const visivel = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      const ck = (el as HTMLElement).checkVisibility;
      if (typeof ck === "function" && !ck.call(el, { opacityProperty: true, visibilityProperty: true })) return false;
      return !el.closest("[aria-hidden='true'], [inert], .sr-only, .visually-hidden, svg");
    };
    const textoProprio = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
    const CONTROLES = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "IMG", "VIDEO", "IFRAME", "LABEL"]);
    const conteudo = (el: Element) => textoProprio(el) || CONTROLES.has(el.tagName);
    const corta = (v: string) => v === "hidden" || v === "clip";
    const rola = (v: string) => v === "auto" || v === "scroll";
    const faixa = (el: Element) => el.closest("[data-rolagem]") !== null;
    const medir = (() => {
      const c = document.createElement("canvas").getContext("2d")!;
      return (texto: string, cs: CSSStyleDeclaration) => {
        c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return c.measureText(texto).width;
      };
    })();

    if (document.documentElement.scrollWidth > vw + TOL) achados.push(`página rola de lado (${document.documentElement.scrollWidth} > ${vw})`);
    // Campo com fonte abaixo de 16 px: no iPhone o Safari amplia a página ao tocar nele e não volta sozinho.
    if (window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches)
      for (const c of Array.from(document.querySelectorAll("input, select, textarea"))) {
        const tipo = (c as HTMLInputElement).type;
        if (["hidden", "checkbox", "radio", "range", "file", "color", "submit", "button", "image", "reset"].includes(tipo)) continue;
        if (!visivel(c)) continue;
        const px = parseFloat(getComputedStyle(c).fontSize);
        if (px < 16) achados.push(`campo com fonte de ${px}px (o Safari amplia ao tocar): ${descrever(c)}`);
      }

    const todos = Array.from(document.body.querySelectorAll("*"));
    const vistos = new Set<Element>();
    for (const el of todos) {
      if (!visivel(el)) continue;
      const cs = getComputedStyle(el);
      // Faixa com rolagem de lado: só vale se for de propósito.
      if (rola(cs.overflowX) && el.scrollWidth > el.clientWidth + TOL && !el.hasAttribute("data-rolagem") && el.tagName !== "TEXTAREA" && el.tagName !== "PRE")
        achados.push(`rola de lado sem data-rolagem: ${descrever(el)} (${el.scrollWidth} > ${el.clientWidth})`);
      if (!conteudo(el)) continue;
      // Texto cortado na própria caixa, sem reticências.
      if (textoProprio(el) && corta(cs.overflowX) && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + TOL)
        achados.push(`texto cortado: ${descrever(el)} (${el.scrollWidth} > ${el.clientWidth})`);
      // Rótulo curto de controle que quebrou em duas linhas (um segmento "15 / dias", um botão "Fechar / lote").
      if (el.matches("button, a, [role='radio'], [role='tab'], .chip") && textoProprio(el)) {
        const texto = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (texto.length <= 16 && texto.includes(" ")) {
          const topos = new Set<number>();
          for (const n of Array.from(el.childNodes)) {
            if (n.nodeType !== 3 || !(n.textContent ?? "").trim()) continue;
            const faixa = document.createRange();
            faixa.selectNodeContents(n);
            for (const q of Array.from(faixa.getClientRects())) if (q.width > 0) topos.add(Math.round(q.top / 8));
          }
          if (topos.size > 1) achados.push(`rótulo quebrado: ${descrever(el)}`);
        }
      }
      // Placeholder que não cabe.
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !(el as HTMLInputElement).value && (el as HTMLInputElement).placeholder) {
        const livre = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const w = medir((el as HTMLInputElement).placeholder, cs);
        if (el.tagName === "INPUT" && w > livre + 2) achados.push(`placeholder cortado: ${descrever(el)} (${Math.round(w)} > ${Math.round(livre)})`);
      }
      // A caixa passa do ancestral que corta, ou da tela.
      const r = el.getBoundingClientRect();
      let dentroDeFaixa = false;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (rola(ac.overflowX)) {
          dentroDeFaixa = true;
          break;
        }
        if (corta(ac.overflowX)) {
          const ar = a.getBoundingClientRect();
          const esq = ar.left + a.clientLeft;
          const dir = esq + a.clientWidth;
          if ((r.right > dir + TOL || r.left < esq - TOL) && !vistos.has(el)) {
            if (!(ac.textOverflow === "ellipsis" && textoProprio(a))) {
              achados.push(
                `cortado por ${descrever(a).slice(0, 50)}: ${descrever(el)} (${Math.round(r.left)}–${Math.round(r.right)} fora de ${Math.round(esq)}–${Math.round(dir)})`,
              );
              vistos.add(el);
            }
          }
          break;
        }
      }
      if (!dentroDeFaixa && !faixa(el) && !vistos.has(el) && cs.position !== "fixed" && (r.right > vw + TOL || r.left < -TOL)) {
        achados.push(`fora da tela: ${descrever(el)} (${Math.round(r.left)}–${Math.round(r.right)} de ${vw})`);
        vistos.add(el);
      }
    }

    // Textos sobrepostos dentro do player; no toque, nada de barra nativa por cima do quadro (o tempo dela pisa no
    // timecode gravado no vídeo).
    const toque = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 600px)").matches;
    for (const player of Array.from(document.querySelectorAll("[data-player]"))) {
      if (toque && player.querySelector("video[controls]")) achados.push("controles nativos do vídeo sobre a imagem no toque");
      const textos = Array.from(player.querySelectorAll("*")).filter((e) => visivel(e) && textoProprio(e));
      for (let i = 0; i < textos.length; i++)
        for (let j = i + 1; j < textos.length; j++) {
          const a = textos[i];
          const b = textos[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (x > 2 && y > 2) achados.push(`sobreposto no player: ${descrever(a)} × ${descrever(b)}`);
        }
    }
    return achados;
  });
}

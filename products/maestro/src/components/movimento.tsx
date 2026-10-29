"use client";
/**
 * O movimento entre seções (como o Synquei, com a View Transitions API do navegador): a seção nova entra deslizando
 * do lado para onde a pessoa foi na cápsula (frente = da direita, volta = da esquerda) e a antiga sai esmaecendo; links
 * de dentro das telas e o voltar do navegador fazem uma troca curta (sobe 8 px e aparece). A cápsula fica parada.
 * Tudo em CSS (src/app/motion.css); com "reduzir movimento", a troca é na hora.
 *
 * Os números grandes (Hoje, Números) sobem até o valor ao chegar na seção: o texto do servidor é o valor final e a
 * contagem só reescreve o nó de texto por alguns quadros, direto no DOM, sem render do React (o mesmo nó: se o React
 * atualizar o número depois, ele continua mandando).
 */
import { usePathname } from "next/navigation";
import { useEffect, ViewTransition, type ReactNode } from "react";

const TIPOS = { "m-frente": "m-frente", "m-volta": "m-volta", default: "m-troca" };

export function Transicao({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  return (
    <ViewTransition key={caminho} enter={TIPOS} exit={TIPOS} default="none">
      {children}
    </ViewTransition>
  );
}

const NUMEROS = ".hoje-cartao__n, .hoje-caixa__n, .numeros-grande, [data-conta]";
const DURACAO = 700;

/** "R$ 12.345,67" → partes para contar (o primeiro número do texto, no formato do Brasil). */
function partes(texto: string) {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?/.exec(texto);
  if (!m) return null;
  const inteiro = Number(m[1].replace(/\./g, ""));
  const casas = m[2] ? m[2].length - 1 : 0;
  const valor = inteiro + (m[2] ? Number(`0.${m[2].slice(1)}`) : 0);
  if (!Number.isFinite(valor) || valor === 0) return null;
  return { antes: texto.slice(0, m.index), depois: texto.slice(m.index + m[0].length), valor, casas, milhar: m[1].includes(".") || inteiro >= 1000 };
}

/** Ponha no fim da página: ao montar (a página chegou, não o esqueleto), os números grandes dela contam até o valor. */
export function Contar() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.getElementById("conteudo");
    if (!main) return;
    const alvos = [...main.querySelectorAll<HTMLElement>(NUMEROS)]
      .filter((el) => el.childNodes.length === 1 && el.firstChild!.nodeType === Node.TEXT_NODE)
      .map((el) => ({ el: el.firstChild as Text, final: el.textContent ?? "", p: partes(el.textContent ?? "") }))
      .filter((a) => a.p);
    if (!alvos.length) return;
    let pedido = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / DURACAO);
      const e = 1 - Math.pow(1 - k, 3);
      for (const { el, final, p } of alvos) {
        if (!el.isConnected) continue;
        if (k >= 1) {
          el.nodeValue = final;
          continue;
        }
        const v = p!.valor * e;
        const n = v.toLocaleString("pt-BR", { minimumFractionDigits: p!.casas, maximumFractionDigits: p!.casas, useGrouping: p!.milhar });
        el.nodeValue = `${p!.antes}${n}${p!.depois}`;
      }
      if (k < 1) pedido = requestAnimationFrame(passo);
    };
    pedido = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(pedido);
      for (const { el, final } of alvos) if (el.isConnected && el.nodeValue !== final) el.nodeValue = final;
    };
  }, []);
  return null;
}

"use client";

/**
 * Controle segmentado da página inicial (abas no padrão WAI-ARIA): setas, Home e End andam e escolhem; cada painel já
 * vem pronto do servidor e só troca o `hidden` (a imagem do painel escondido nem carrega: `loading="lazy"` com
 * `display: none`). A pílula de vidro anda até a aba escolhida: mede uma vez por troca, o CSS faz o resto (nada por
 * quadro no React). Sem JavaScript, a primeira aba aparece.
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type Aba = { id: string; rotulo: string; painel: ReactNode };

export function Abas({ abas, rotulo, prefixo, className }: { abas: Aba[]; rotulo: string; prefixo: string; className?: string }) {
  const [atual, setAtual] = useState(0);
  const lista = useRef<HTMLDivElement>(null);
  const pilula = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const botao = lista.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[atual];
    const p = pilula.current;
    if (!botao || !p) return;
    const posicionar = () => {
      p.style.setProperty("--x", `${botao.offsetLeft}px`);
      p.style.setProperty("--w", `${botao.offsetWidth}px`);
      p.dataset.pronta = "1";
    };
    posicionar();
    // a fonte ou a largura mudam o tamanho das abas: reposiciona sem animar o primeiro quadro
    const obs = new ResizeObserver(posicionar);
    obs.observe(lista.current!);
    // na faixa que rola de lado (celular), a aba escolhida fica à vista
    const l = lista.current!;
    if (l.scrollWidth > l.clientWidth) l.scrollTo({ left: botao.offsetLeft - (l.clientWidth - botao.offsetWidth) / 2, behavior: "smooth" });
    return () => obs.disconnect();
  }, [atual]);

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const n = abas.length;
    const prox = { ArrowRight: atual + 1, ArrowLeft: atual - 1, Home: 0, End: n - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    const i = (prox + n) % n;
    setAtual(i);
    lista.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[i]?.focus();
  }

  return (
    <div className={`iabas${className ? ` ${className}` : ""}`}>
      <div className="iabas__lista" role="tablist" aria-label={rotulo} ref={lista} onKeyDown={teclado} data-rolagem="">
        <span className="iabas__pilula" ref={pilula} aria-hidden="true" />
        {abas.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`${prefixo}-aba-${a.id}`}
            aria-selected={i === atual}
            aria-controls={`${prefixo}-painel-${a.id}`}
            tabIndex={i === atual ? 0 : -1}
            onClick={() => setAtual(i)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {abas.map((a, i) => (
        <div
          key={a.id}
          className="iabas__painel"
          role="tabpanel"
          id={`${prefixo}-painel-${a.id}`}
          aria-labelledby={`${prefixo}-aba-${a.id}`}
          hidden={i !== atual}
          tabIndex={0}
        >
          {a.painel}
        </div>
      ))}
    </div>
  );
}

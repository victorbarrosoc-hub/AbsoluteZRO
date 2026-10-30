"use client";
/**
 * O Set da Absolute ZRO (ADR 0032 de lá, 30/10/2026): quem da equipe e dos contatos está online, em qual app, e as
 * conversas (diretas e do projeto). É a aba em comum de todas as plataformas: aqui, "Set" no controle de abas da área
 * logada, depois de Z e Conta. Não abre página: abre a folha do <zro-set modo="folha"> publicado pela Absolute ZRO
 * (lateral no computador, tela cheia no iPhone), vestida com as cores do SOBEDESCE (globals.css, --zro-set-*). Ele
 * fala com /api/zro/set, o repasse do servidor que acrescenta o token da conta (lib/zro/set.ts); o navegador nunca vê
 * token. A aba só aparece depois que o Set respondeu (conta ligada com o escopo zro.set); sem isso, nada muda.
 * O <zro-set> nasce por DOM, como o <zro-ia> (components/conta/painel-z.tsx): `api` e `tema` são propriedades dele.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export const SCRIPT_ZRO_SET = "https://absolutezro.com/set/v1/zro-set.js";

type ElementoSet = HTMLElement & { aberto?: boolean; abrirSet?: () => void; fecharSet?: () => void };

/** Pessoas, no traço dos ícones do site (o mesmo desenho do app do celular). */
export function IconeSet({ className }: { className?: string }) {
  return (
    <svg className={cn("size-[17px] shrink-0", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4" />
    </svg>
  );
}

export function AbaSet() {
  const el = useRef<ElementoSet | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [novidades, setNovidades] = useState(0);
  const [online, setOnline] = useState(0);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    let criado: ElementoSet | null = null;
    const estado = (e: Event) => {
      const d = (e as CustomEvent<{ online?: number; naoLidas?: number; pedidos?: number }>).detail || {};
      setVisivel(true);
      setOnline(d.online || 0);
      setNovidades((d.naoLidas || 0) + (d.pedidos || 0));
    };
    const fora = () => setVisivel(false);
    const abriu = () => setAberto(true);
    const fechou = () => setAberto(false);
    if (!customElements.get("zro-set") && !document.querySelector(`script[src="${SCRIPT_ZRO_SET}"]`)) {
      const s = document.createElement("script");
      s.type = "module";
      s.src = SCRIPT_ZRO_SET;
      document.head.append(s);
    }
    // sem rede ou sem o widget, o elemento nunca é definido e a aba não aparece
    customElements.whenDefined("zro-set").then(() => {
      if (!vivo) return;
      const n = document.createElement("zro-set") as ElementoSet;
      n.setAttribute("modo", "folha");
      n.setAttribute("api", "/api/zro/set");
      n.setAttribute("tema", "auto");
      // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: a aba fica escondida
      n.style.display = "none";
      n.addEventListener("zro-set:estado", estado);
      n.addEventListener("zro-set:sem-login", fora);
      n.addEventListener("zro-set:aberto", abriu);
      n.addEventListener("zro-set:fechado", fechou);
      document.body.append(n);
      criado = el.current = n;
    });
    return () => {
      vivo = false;
      criado?.remove();
      el.current = null;
    };
  }, []);

  if (!visivel) return null;
  return (
    <button
      type="button"
      data-set=""
      aria-haspopup="dialog"
      aria-expanded={aberto}
      aria-label={`Set${online ? `, ${online} online` : ""}${novidades ? `, ${novidades} ${novidades === 1 ? "novidade" : "novidades"}` : ""}`}
      title="Quem está online e as conversas"
      onClick={() => (el.current?.aberto ? el.current.fecharSet?.() : el.current?.abrirSet?.())}
      className={cn(
        "toque relative inline-flex h-9 min-w-[88px] items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors",
        aberto ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-ink-2 hover:text-ink",
      )}
    >
      <IconeSet />
      Set
      {novidades ? (
        <span aria-hidden="true" className="ml-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-[11px] leading-none font-bold text-bg tabular-nums">
          {novidades > 99 ? "99+" : novidades}
        </span>
      ) : null}
    </button>
  );
}

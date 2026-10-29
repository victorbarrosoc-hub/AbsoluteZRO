"use client";

/**
 * Campo de senha com o olho para mostrar e esconder o que foi digitado (senha longa é difícil de conferir).
 * O olho fica dentro do campo, à direita: `type="button"` (nunca envia o form), `aria-pressed` e rótulo
 * "Mostrar senha"/"Ocultar senha". Clicar não tira o foco do campo e o cursor volta ao mesmo lugar.
 * `autoComplete` e os demais atributos passam direto para o input.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Input } from "./field";

export function InputSenha({ className, disabled, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visivel, setVisivel] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const selecao = useRef<[number | null, number | null] | null>(null);

  // trocar o type pode mandar o cursor para o fim: devolve a seleção de antes, se o foco continuou no campo
  useLayoutEffect(() => {
    const el = campo.current;
    const s = selecao.current;
    selecao.current = null;
    if (!el || !s || document.activeElement !== el) return;
    try {
      el.setSelectionRange(s[0], s[1]);
    } catch {
      /* alguns tipos não aceitam seleção */
    }
  }, [visivel]);

  function alternar() {
    const el = campo.current;
    if (el && document.activeElement === el) selecao.current = [el.selectionStart, el.selectionEnd];
    setVisivel((v) => !v);
  }

  const rotulo = visivel ? "Ocultar senha" : "Mostrar senha";
  return (
    <div className="relative">
      <Input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
        ref={campo}
        disabled={disabled}
        type={visivel ? "text" : "password"}
        className={cn("pr-12 [&::-ms-reveal]:hidden", className)}
      />
      <button
        type="button"
        aria-label={rotulo}
        title={rotulo}
        aria-pressed={visivel}
        aria-controls={props.id}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternar}
        className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-ink-3 transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-down disabled:opacity-45 aria-pressed:text-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {visivel ? (
            <>
              <path d="M3 3l18 18" />
              <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </>
          ) : (
            <>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

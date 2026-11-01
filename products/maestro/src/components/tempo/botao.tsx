"use client";
/** O cronômetro na cápsula (computador) e no topo (iPhone): abre o painel; o ponto acende enquanto roda. */
import { Icone } from "@/components/icones";
import { alternarPainel, useTempo } from "./loja";

export function BotaoDoCronometro({ className = "" }: { className?: string }) {
  const pode = useTempo((e) => e.pode);
  const rodando = useTempo((e) => !!e.rodando);
  const aberto = useTempo((e) => e.aberto);
  if (!pode) return null;
  return (
    <button
      type="button"
      className={`tp-botao ${className}`.trim()}
      data-rodando={rodando || undefined}
      aria-expanded={aberto}
      aria-label="Cronômetro"
      title="Cronômetro (⌥T)"
      onClick={alternarPainel}
    >
      <Icone nome="cronometro" size={18} />
      <i className="tp-botao__ponto" aria-hidden="true" />
    </button>
  );
}

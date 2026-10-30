"use client";
/** O botão "Imprimir ou PDF" da folha do roteiro (o PDF é o "salvar como PDF" do navegador). */
import { Icone } from "@/components/icones";

export function BotaoImprimir() {
  return (
    <button type="button" className="glass-btn glass-btn--ink" onClick={() => window.print()}>
      <Icone nome="imprimir" size={18} /> Imprimir ou PDF
    </button>
  );
}

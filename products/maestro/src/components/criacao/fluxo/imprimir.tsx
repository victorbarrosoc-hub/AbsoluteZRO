"use client";
/**
 * PDF do Fluxo (plano da Criação §6.2): é a Lista com o CSS de impressão (`.imprimivel`, A4), pelo "salvar PDF" do
 * navegador; nada de motor de PDF no servidor. Antes de imprimir, as imagens da Lista (que carregam com `lazy`) são
 * pedidas e esperadas, até 4 s, para não sair folha com buraco.
 */
import { Icone } from "@/components/icones";

export async function imprimirComImagens(raiz: ParentNode = document): Promise<void> {
  const imgs = [...raiz.querySelectorAll<HTMLImageElement>(".imprimivel img")];
  for (const i of imgs) i.loading = "eager";
  const prontas = Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))));
  await Promise.race([prontas, new Promise((r) => setTimeout(r, 4000))]);
  window.print();
}

export function ImprimirFluxo({ rotulo = "PDF" }: { rotulo?: string }) {
  return (
    <button type="button" className="glass-btn glass-btn--sm glass-btn--ink" onClick={() => void imprimirComImagens()} title="Imprimir ou salvar PDF">
      <Icone nome="imprimir" size={16} /> {rotulo}
    </button>
  );
}

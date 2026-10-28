/** Estado vazio elegante: ícone, título curto, uma linha. Sem fingir função: nada de botão para o que não existe. */
import type { ReactNode } from "react";
import { Icone, type NomeIcone } from "./icones";

export function EstadoVazio({ icone, titulo, apoio, children }: { icone: NomeIcone; titulo: string; apoio?: string; children?: ReactNode }) {
  return (
    <section className="vazio" aria-label={titulo}>
      <span className="vazio__icone">
        <Icone nome={icone} size={26} />
      </span>
      <h2>{titulo}</h2>
      {apoio && <p>{apoio}</p>}
      {children}
    </section>
  );
}

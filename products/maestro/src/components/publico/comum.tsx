/**
 * Peças das páginas que o cliente abre sem conta (`/a`, `/p`, `/o`): o topo com a marca da produtora (logo ou nome, a
 * cor como filete), o rodapé "com Maestro · Absolute ZRO" e a tela neutra de link morto. Sem estado: servem ao servidor
 * e ao cliente.
 */
import type { CSSProperties } from "react";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";

export type MarcaDaPagina = { nome: string; logo: string | null; cor: string | null };

/** A cor da produtora vira o `--acento` da página (superfície e filete; nunca texto). */
export const estiloDaMarca = (cor: string | null | undefined): CSSProperties | undefined => (cor ? ({ "--acento": cor } as CSSProperties) : undefined);

export function CabecaMarca({ marca }: { marca: MarcaDaPagina }) {
  return (
    <div className="cl-marca">
      {marca.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo da produtora, bytes do banco pela rota própria
        <img src={marca.logo} alt={marca.nome} />
      ) : (
        <span className="cl-marca__nome">{marca.nome}</span>
      )}
    </div>
  );
}

export function RodapeMaestro() {
  return (
    <footer className="cl-rodape">
      <span>com</span> <MaestroSimbolo width={22} /> <b>Maestro</b> <span aria-hidden="true">·</span>
      <ZroSimbolo size={16} /> <span>Absolute ZRO</span>
    </footer>
  );
}

/** Link desconhecido, revogado ou vencido: a mesma tela, sem dizer de quem é. */
export function NeutroPublico({ limite = false }: { limite?: boolean }) {
  return (
    <main className="cl cl--neutro" id="conteudo">
      <section className="cl-neutro">
        <MaestroSimbolo width={120} />
        <h1>{limite ? "Muitas tentativas." : "Este link não está mais ativo."}</h1>
        <p>{limite ? "Espere alguns minutos e abra de novo." : "Peça um link novo a quem enviou."}</p>
      </section>
      <RodapeMaestro />
    </main>
  );
}

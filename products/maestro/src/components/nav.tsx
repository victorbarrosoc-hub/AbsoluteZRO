"use client";
/**
 * A navegação do Maestro (plano v2 §3): barra lateral em vidro com grupos, a Z primeiro (padrão do ecossistema):
 * Produção (Quadro, Aprovações, Projetos, Agenda), Comercial (Clientes, Orçamentos), Operação (Freelas, Inventário),
 * Dinheiro (Financeiro) e Ajustes. Só entra o que tem tela de verdade. No celular vira a barra de baixo com o que se
 * usa todo dia (Z, Quadro, Aprovações, Agenda) e "Mais", que abre todas as seções.
 * A aba ativa segue o caminho e ganha o filete de latão (só superfície, nunca texto).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AJUSTES, BARRA, GRUPOS, MAIS, type Aba } from "@/lib/navegacao";
import { Icone } from "./icones";

function ativa(caminho: string, href: string) {
  return caminho === href || caminho.startsWith(`${href}/`);
}

function Item({ aba, caminho }: { aba: Aba; caminho: string }) {
  const on = ativa(caminho, aba.href);
  return (
    <Link href={aba.href} aria-current={on ? "page" : undefined} data-aba={aba.icone} className="lado__item">
      <Icone nome={aba.icone} size={18} />
      <span>{aba.nome}</span>
    </Link>
  );
}

/** A barra lateral (computador). */
export function Lateral() {
  const caminho = usePathname();
  return (
    <nav className="lado__nav" aria-label="Seções do Maestro">
      {GRUPOS.map((g) => (
        <div key={g.nome ?? "z"} className="lado__grupo" role="group" aria-label={g.nome ?? "Z"}>
          {g.nome ? <span className="lado__rotulo">{g.nome}</span> : null}
          {g.abas.map((a) => (
            <Item key={a.href} aba={a} caminho={caminho} />
          ))}
        </div>
      ))}
      <div className="lado__grupo lado__grupo--fim">
        <Item aba={AJUSTES} caminho={caminho} />
      </div>
    </nav>
  );
}

/** A barra de baixo (celular): ícone e nome curto. "Mais" fica marcado nas seções que não estão na barra. */
export function Barra() {
  const caminho = usePathname();
  const naBarra = BARRA.slice(0, -1).some((a) => ativa(caminho, a.href));
  return (
    <nav className="barra" aria-label="Seções do Maestro">
      {BARRA.map((a) => {
        const on = a === MAIS ? !naBarra : ativa(caminho, a.href);
        return (
          <Link key={a.href} href={a.href} aria-current={on ? "page" : undefined} data-aba={a.icone}>
            <Icone nome={a.icone} size={20} />
            <span>{a.curto ?? a.nome}</span>
          </Link>
        );
      })}
    </nav>
  );
}

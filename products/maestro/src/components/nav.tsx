"use client";
/**
 * A navegação do Maestro (plano v2 §3): barra lateral em vidro com grupos, a Z primeiro (padrão do ecossistema). Só
 * entra o que existe hoje; os grupos que ainda não têm tela (Comercial com Pedidos e Orçamentos, Operação, Dinheiro)
 * nascem quando a fase deles entrar no ar. No celular vira a barra de baixo, com as mesmas abas.
 * A aba ativa segue o caminho e ganha o filete de latão (só superfície, nunca texto).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone, type NomeIcone } from "./icones";

export type Aba = { href: string; nome: string; icone: NomeIcone; curto?: string };
export type Grupo = { nome: string | null; abas: Aba[] };

export const GRUPOS: Grupo[] = [
  { nome: null, abas: [{ href: "/app/z", nome: "Z", icone: "z" }] },
  {
    nome: "Produção",
    abas: [
      { href: "/app/quadro", nome: "Quadro", icone: "quadro" },
      { href: "/app/aprovacoes", nome: "Aprovações", icone: "aprovacoes", curto: "Aprovar" },
      { href: "/app/projetos", nome: "Projetos", icone: "projetos" },
    ],
  },
  { nome: "Comercial", abas: [{ href: "/app/clientes", nome: "Clientes", icone: "clientes" }] },
];

export const AJUSTES: Aba = { href: "/app/ajustes", nome: "Ajustes", icone: "ajustes" };

/** Todas as abas, na ordem da barra (a Z primeiro, Ajustes por último). */
export const ABAS: Aba[] = [...GRUPOS.flatMap((g) => g.abas), AJUSTES];

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

/** A barra de baixo (celular): ícone e nome curto. */
export function Barra() {
  const caminho = usePathname();
  return (
    <nav className="barra" aria-label="Seções do Maestro">
      {ABAS.map((a) => {
        const on = ativa(caminho, a.href);
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

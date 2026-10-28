/** Peças das telas de clientes e projetos (componentes de servidor): selos, filtros em pílula, iniciais e linhas. */
import Link from "next/link";
import type { ReactNode } from "react";
import { COLUNA, type ColunaKey } from "@/lib/quadro/metodo";
import { Icone } from "./icones";

export function Selo({ tom, children }: { tom: "ok" | "aviso" | "neutro"; children: ReactNode }) {
  return (
    <span className={`selo selo--${tom}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

/** Filtros em pílula (links): o ativo fica marcado. */
export function Pilulas({ itens, ativo }: { itens: { valor: string; nome: string; href: string }[]; ativo: string }) {
  return (
    <nav className="pilulas" aria-label="Filtro">
      {itens.map((i) => (
        <Link key={i.valor} href={i.href} aria-current={i.valor === ativo ? "true" : undefined} scroll={false}>
          {i.nome}
        </Link>
      ))}
    </nav>
  );
}

/** Um tom fechado e fixo por nome (o mesmo cliente tem sempre a mesma cor), só no fundo do monograma. */
export function tomDoNome(nome: string): number {
  let h = 0;
  for (const ch of nome.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

export function Monograma({ nome, grande }: { nome: string; grande?: boolean }) {
  const ini =
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span className={`monograma${grande ? " monograma--grande" : ""}`} data-tom={tomDoNome(nome)} aria-hidden="true">
      {ini}
    </span>
  );
}

/** Um card do Quadro numa lista (ficha do cliente ou do projeto): coluna, título, prazo; abre a ficha no Quadro. */
export function LinhaCard({ c }: { c: { id: string; tema: string; coluna: string; prazo: string | null } }) {
  return (
    <li>
      <Link className="linha" href={`/app/quadro?card=${encodeURIComponent(c.id)}`}>
        <span className="linha__coluna">{COLUNA[c.coluna as ColunaKey]?.nome ?? c.coluna}</span>
        <span className="linha__titulo">{c.tema}</span>
        {c.prazo ? (
          <span className="linha__meta">
            <Icone nome="relogio" size={13} /> {c.prazo.slice(8, 10)}/{c.prazo.slice(5, 7)}
          </span>
        ) : null}
        <Icone nome="seta" size={15} className="linha__seta" />
      </Link>
    </li>
  );
}

export function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="secao">
      <header className="secao__topo">
        <h2>{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  );
}

/** dd/mm/aaaa a partir de AAAA-MM-DD. */
export const dataBr = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

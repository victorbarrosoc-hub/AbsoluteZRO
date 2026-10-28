/** Peças do Financeiro (servidor): cabeçalho com as abas, a linha de lançamento e o aviso para quem não vê dinheiro. */
import Link from "next/link";
import type { ReactNode } from "react";
import { brl, dataCurta } from "@/lib/dinheiro";
import { NOME_STATUS, nomeCategoria } from "@/lib/financeiro/contas";
import type { Lancamento } from "@/lib/financeiro/servidor";
import { Icone } from "./icones";
import { Abas, SeloStatus } from "./painel";
import { EstadoVazio } from "./vazio";

const ABAS = [
  { href: "/app/financeiro", nome: "Lançamentos" },
  { href: "/app/financeiro/contas", nome: "A pagar e a receber" },
  { href: "/app/financeiro/fluxo", nome: "Fluxo e resultado" },
  { href: "/app/financeiro/recorrencias", nome: "Recorrências" },
];

export function CabecaFinanceiro({ ativa, acao }: { ativa: string; acao?: ReactNode }) {
  return (
    <>
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Seu <strong>financeiro.</strong>
        </h1>
        {acao}
      </header>
      <Abas itens={ABAS} ativa={ativa} />
    </>
  );
}

export function SemDinheiro() {
  return <EstadoVazio icone="dinheiro" titulo="O Financeiro é da gestão" apoio="Só administração e gestão veem entradas, saídas e pagamentos." />;
}

export function NovoLancamento() {
  return (
    <Link className="glass-btn glass-btn--ink" href="/app/financeiro/novo">
      <Icone nome="mais" size={18} /> Novo lançamento
    </Link>
  );
}

/** Um lançamento na lista: data, descrição, de quem, valor (entrada em grafite, saída com sinal) e status. */
export function LinhaLancamento({ l }: { l: Lancamento }) {
  return (
    <li>
      <Link className="item item--fino" href={`/app/financeiro/${l.id}`}>
        <span className="data-ficha" data-tipo={l.tipo}>
          <strong>{l.vencimento.slice(8, 10)}</strong>
          <span>{dataCurta(l.vencimento).slice(3)}</span>
        </span>
        <span className="item__miolo">
          <span className="item__nome">{l.descricao}</span>
          <span className="item__apoio">{[nomeCategoria(l.categoria), l.projetoCodigo, l.cliente ?? l.freela, l.parcela].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="item__valor" data-tipo={l.tipo}>
          {l.tipo === "saida" ? "− " : ""}
          {brl(l.valorCents)}
          {l.status === "parcial" ? <span className="sutil"> falta {brl(l.aberto)}</span> : null}
        </span>
        <SeloStatus status={l.status}>{NOME_STATUS[l.status]}</SeloStatus>
      </Link>
    </li>
  );
}

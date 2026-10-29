/**
 * Peças das telas da produtora (componentes de servidor): cifras (números grandes), o gráfico de fluxo de caixa,
 * abas de seção e o selo de status do dinheiro. Texto sempre em grafite/cinza; cor só em ponto e barra.
 * Paleta do gráfico (entradas azul, saídas latão) conferida pelo validador de cor (claro e escuro, daltonismo).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { brl, brlCurto, mesCurto } from "@/lib/dinheiro";
import type { MesDoFluxo } from "@/lib/financeiro/contas";

export function Cifras({ children }: { children: ReactNode }) {
  return <div className="cifras">{children}</div>;
}

export function Cifra({ rotulo, valor, apoio, tom }: { rotulo: string; valor: ReactNode; apoio?: ReactNode; tom?: "ok" | "aviso" | "perigo" }) {
  return (
    <div className="cifra" data-tom={tom}>
      <span className="cifra__rotulo">
        {tom ? <i aria-hidden="true" /> : null}
        {rotulo}
      </span>
      <strong className="cifra__valor">{valor}</strong>
      {apoio ? <span className="cifra__apoio">{apoio}</span> : null}
    </div>
  );
}

/** Abas de uma seção (links): a ativa marcada. */
export function Abas({ itens, ativa }: { itens: { href: string; nome: string; n?: number }[]; ativa: string }) {
  return (
    <nav className="abas" aria-label="Partes da seção" data-rolagem>
      {itens.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.href === ativa ? "page" : undefined}>
          {i.nome}
          {i.n != null ? <span>{i.n}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Selo de status (pago, parcial, atrasado, pendente…): ponto + texto, nunca só a cor. */
export function SeloStatus({ status, children }: { status: string; children: ReactNode }) {
  return (
    <span className="selo" data-status={status}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * Fluxo de caixa mês a mês: entradas e saídas previstas (pelo vencimento) lado a lado, o mês atual marcado. Cada barra
 * tem a dica com o valor; a tabela ao lado é a mesma informação em texto (a leitura acessível).
 */
export function GraficoFluxo({ meses, atual }: { meses: MesDoFluxo[]; atual: string }) {
  const max = Math.max(1, ...meses.flatMap((m) => [m.entradas, m.saidas]));
  const h = (v: number) => `${Math.max(v > 0 ? 2 : 0, Math.round((v / max) * 100))}%`;
  return (
    <figure className="fluxo" aria-label="Entradas e saídas por mês">
      <div className="fluxo__legenda" aria-hidden="true">
        <span data-serie="entrada">
          <i /> Entradas
        </span>
        <span data-serie="saida">
          <i /> Saídas
        </span>
      </div>
      <div className="fluxo__grade">
        {meses.map((m) => (
          <div key={m.mes} className="fluxo__mes" data-atual={m.mes === atual || undefined} data-futuro={m.mes > atual || undefined}>
            <div className="fluxo__barras">
              <span
                className="fluxo__barra"
                data-serie="entrada"
                style={{ height: h(m.entradas) }}
                title={`Entradas de ${mesCurto(m.mes)}: ${brl(m.entradas)}`}
              />
              <span className="fluxo__barra" data-serie="saida" style={{ height: h(m.saidas) }} title={`Saídas de ${mesCurto(m.mes)}: ${brl(m.saidas)}`} />
            </div>
            <span className="fluxo__rotulo">{mesCurto(m.mes)}</span>
            <span className="fluxo__saldo" title="Saldo previsto do mês">
              {m.saldo >= 0 ? "+" : "−"}
              {brlCurto(Math.abs(m.saldo))}
            </span>
          </div>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>Fluxo de caixa por mês</caption>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Entradas</th>
              <th>Saídas</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes}>
                <td>{m.mes}</td>
                <td>{brl(m.entradas)}</td>
                <td>{brl(m.saidas)}</td>
                <td>{brl(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Barra de proporção fina (margem, andamento): só forma. */
export function Medidor({ valor, rotulo, tom }: { valor: number; rotulo: string; tom?: "ok" | "aviso" | "perigo" }) {
  const v = Math.max(0, Math.min(1, valor));
  return (
    <span className="medidor" data-tom={tom} role="img" aria-label={rotulo} title={rotulo}>
      <i style={{ width: `${Math.round(v * 100)}%` }} />
    </span>
  );
}

"use client";
/** Formulário do lote novo: cliente, nome e as peças (os cards do cliente em Revisão vêm marcados). */
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { COLUNA, type ColunaKey } from "@/lib/quadro/metodo";
import type { CardDisponivel } from "@/lib/revisao/equipe";
import type { EstadoForm } from "@/components/form";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--ink" disabled={pending}>
      {pending ? "Criando…" : "Criar lote"}
    </button>
  );
}

export function NovoLote({
  acao,
  clientes,
  cards,
  clienteInicial,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  clientes: { id: string; nome: string }[];
  cards: CardDisponivel[];
  clienteInicial: string;
}) {
  const [estado, enviar] = useActionState(acao, undefined);
  const [cliente, setCliente] = useState(estado?.valores?.cliente ?? (clientes.some((c) => c.id === clienteInicial) ? clienteInicial : ""));
  const doCliente = cards.filter((c) => c.cliente === cliente);
  const nomeCliente = clientes.find((c) => c.id === cliente)?.nome;
  return (
    <form className="form" action={enviar} aria-label="Novo lote">
      <div className={`form__campo${estado?.erros?.cliente ? " form__campo--erro" : ""}`}>
        <label htmlFor="cliente">Cliente</label>
        <select id="cliente" name="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} required>
          <option value="">Escolha</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        {estado?.erros?.cliente ? <p className="form__erro">{estado.erros.cliente}</p> : null}
      </div>
      <div className={`form__campo${estado?.erros?.titulo ? " form__campo--erro" : ""}`}>
        <label htmlFor="titulo">Nome do lote</label>
        <input
          id="titulo"
          name="titulo"
          maxLength={200}
          required
          defaultValue={estado?.valores?.titulo ?? ""}
          placeholder={nomeCliente ? `Aprovação da semana: ${nomeCliente}` : "Aprovação da semana"}
        />
        {estado?.erros?.titulo ? <p className="form__erro">{estado.erros.titulo}</p> : null}
      </div>
      {cliente ? (
        <fieldset className="ap-escolha">
          <legend>Peças</legend>
          {doCliente.length ? (
            doCliente.map((c) => (
              <label key={c.id} className="ap-escolha__item">
                <input type="checkbox" name="cards" value={c.id} defaultChecked={c.coluna === "revisao"} />
                <i className="q-ponto" data-col={c.coluna} aria-hidden="true" />
                <span>{c.tema}</span>
                <small>{COLUNA[c.coluna as ColunaKey]?.nome ?? c.coluna}</small>
              </label>
            ))
          ) : (
            <p className="form__dica">Nenhum card deste cliente em produção. Dá para criar o lote e pôr peças depois.</p>
          )}
        </fieldset>
      ) : null}
      {estado?.mensagem ? (
        <p className="form__erro" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      <div className="acoes">
        <Enviar />
        <Link className="glass-btn" href="/app/aprovacoes">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

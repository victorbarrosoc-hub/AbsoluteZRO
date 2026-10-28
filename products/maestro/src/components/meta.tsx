"use client";
/** A meta de faturamento do mês: um campo e salvar (vazio tira). A action confere papel; o banco confere de novo. */
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { salvarMetaAcao } from "@/app/(app)/app/financeiro/numeros/acoes";
import { Icone } from "./icones";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={pending}>
      {pending ? "…" : "Salvar"}
    </button>
  );
}

export function MetaDoMes({ mes, valor, rotulo }: { mes: string; valor: string; rotulo: string }) {
  const [estado, enviar] = useActionState(salvarMetaAcao, undefined);
  return (
    <form action={enviar} className="numeros-meta" key={estado?.n ?? 0}>
      <input type="hidden" name="mes" value={mes} />
      <label htmlFor="meta-mes">Meta de {rotulo}</label>
      <span className="numeros-meta__campo">
        <input id="meta-mes" name="meta" defaultValue={valor} inputMode="decimal" className="num" placeholder="R$ 0,00" />
        <Enviar />
      </span>
      {estado?.mensagem ? (
        <span className="erro erro--linha" role="alert">
          {estado.mensagem}
        </span>
      ) : null}
      {estado?.aviso ? (
        <span className="aviso-ok aviso-ok--linha" role="status">
          <Icone nome="check" size={14} /> {estado.aviso}
        </span>
      ) : null}
    </form>
  );
}

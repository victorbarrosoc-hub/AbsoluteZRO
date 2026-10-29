"use client";
/**
 * O alcance de uma pessoa (Ajustes → Pessoas): "Todos os clientes" ou "Só alguns" com a lista para marcar. A action
 * confere sessão e papel; o banco aplica a regra em toda tabela ligada a cliente (drizzle/0018).
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarAcessoAcao } from "@/app/(app)/app/ajustes/pessoas/acoes";
import { Icone } from "./icones";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={pending}>
      {pending ? "Salvando…" : "Salvar acesso"}
    </button>
  );
}

export function Alcance({
  sub,
  nome,
  restrito,
  marcados,
  clientes,
}: {
  sub: string;
  nome: string;
  restrito: boolean;
  marcados: string[];
  clientes: { id: string; nome: string }[];
}) {
  const [estado, enviar] = useActionState(salvarAcessoAcao, undefined);
  const [alguns, setAlguns] = useState(restrito);
  return (
    <form action={enviar} className="alcance">
      <input type="hidden" name="sub" value={sub} />
      <div className="q-segmentos" role="radiogroup" aria-label={`Clientes que ${nome} vê`}>
        <input type="hidden" name="alcance" value={alguns ? "alguns" : "todos"} />
        <button type="button" role="radio" aria-checked={!alguns} onClick={() => setAlguns(false)}>
          Todos os clientes
        </button>
        <button type="button" role="radio" aria-checked={alguns} onClick={() => setAlguns(true)}>
          Só alguns
        </button>
      </div>
      {alguns ? (
        clientes.length ? (
          <fieldset className="alcance__lista">
            <legend className="sr-only">Clientes de {nome}</legend>
            {clientes.map((c) => (
              <label key={c.id}>
                <input type="checkbox" name="cliente" value={c.id} defaultChecked={marcados.includes(c.id)} />
                <span>{c.nome}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="sutil">Nenhum cliente cadastrado ainda: assim, não vê nenhum.</p>
        )
      ) : null}
      <div className="acoes">
        <Enviar />
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
      </div>
    </form>
  );
}

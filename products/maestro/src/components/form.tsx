"use client";
/**
 * Formulários de clientes e projetos: Server Action com useActionState (erros por campo, valores mantidos), campos no
 * padrão da casa e um "Remover" em dois toques.
 */
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icone } from "./icones";

export type EstadoForm = { erros?: Record<string, string>; mensagem?: string; valores?: Record<string, string> } | undefined;
type Acao = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

export type DefCampo = {
  nome: string;
  rotulo: string;
  tipo?: "texto" | "email" | "tel" | "data" | "area" | "select" | "segmentos";
  opcoes?: { valor: string; nome: string }[];
  dica?: string;
  obrigatorio?: boolean;
  largo?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  max?: number;
};

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--ink" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </button>
  );
}

function Segmentos({ def, valor }: { def: DefCampo; valor: string }) {
  const [v, setV] = useState(valor);
  return (
    <div className="q-segmentos" role="radiogroup" aria-label={def.rotulo}>
      <input type="hidden" name={def.nome} value={v} />
      {def.opcoes?.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={v === o.valor} onClick={() => setV(o.valor)}>
          {o.nome}
        </button>
      ))}
    </div>
  );
}

export function Formulario({
  acao,
  campos,
  inicial,
  id,
  rotulo,
  voltar,
}: {
  acao: Acao;
  campos: DefCampo[];
  inicial: Record<string, string>;
  id?: string;
  rotulo: string;
  voltar: string;
}) {
  const [estado, enviar] = useActionState(acao, undefined);
  const valores = estado?.valores ?? inicial;
  return (
    <form action={enviar} className="form" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {estado?.mensagem ? (
        <p className="erro" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      <div className="form__grade">
        {campos.map((c) => {
          const erro = estado?.erros?.[c.nome];
          const idCampo = `campo-${c.nome}`;
          const comum = {
            id: idCampo,
            name: c.nome,
            defaultValue: valores[c.nome] ?? "",
            "aria-invalid": erro ? true : undefined,
            "aria-describedby": erro ? `${idCampo}-erro` : undefined,
            autoFocus: c.autoFocus,
            placeholder: c.placeholder,
            maxLength: c.max,
            required: c.obrigatorio,
          };
          return (
            <div key={c.nome} className={`form__campo${c.largo ? " form__campo--largo" : ""}${erro ? " form__campo--erro" : ""}`}>
              <label htmlFor={c.tipo === "segmentos" ? undefined : idCampo}>{c.rotulo}</label>
              {c.tipo === "area" ? (
                <textarea {...comum} rows={4} />
              ) : c.tipo === "select" ? (
                <select {...comum}>
                  {c.opcoes?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              ) : c.tipo === "segmentos" ? (
                <Segmentos key={valores[c.nome]} def={c} valor={valores[c.nome] ?? c.opcoes?.[0]?.valor ?? ""} />
              ) : (
                <input
                  {...comum}
                  type={c.tipo === "data" ? "date" : c.tipo === "email" ? "email" : c.tipo === "tel" ? "tel" : "text"}
                  inputMode={c.tipo === "tel" ? "tel" : undefined}
                />
              )}
              {erro ? (
                <span className="form__erro" id={`${idCampo}-erro`}>
                  {erro}
                </span>
              ) : c.dica ? (
                <span className="form__dica">{c.dica}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="acoes">
        <Enviar rotulo={rotulo} />
        <Link className="glass-btn" href={voltar}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}

/** Remover em dois toques: o primeiro pergunta, o segundo remove. */
export function Remover({ acao, id, rotulo, pergunta }: { acao: Acao; id: string; rotulo: string; pergunta: string }) {
  const [estado, enviar] = useActionState(acao, undefined);
  const [certeza, setCerteza] = useState(false);
  return (
    <form action={enviar} className="remover">
      <input type="hidden" name="id" value={id} />
      {estado?.mensagem ? (
        <p className="erro" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      {certeza ? (
        <div className="remover__certeza">
          <span>{pergunta}</span>
          <button type="submit" className="q-perigo">
            <Icone nome="lixo" size={16} /> {rotulo}
          </button>
          <button type="button" className="q-limpar" onClick={() => setCerteza(false)}>
            Não
          </button>
        </div>
      ) : (
        <button type="button" className="q-perigo" onClick={() => setCerteza(true)}>
          <Icone nome="lixo" size={16} /> {rotulo}
        </button>
      )}
    </form>
  );
}

/** Cabeçalho das telas de formulário: voltar + título. */
export function CabecaForm({ voltar, titulo, children }: { voltar: string; titulo: ReactNode; children?: ReactNode }) {
  return (
    <header className="pagina__cabeca">
      <Link className="voltar" href={voltar}>
        <Icone nome="voltar" size={16} /> Voltar
      </Link>
      <h1 className="atitle">{titulo}</h1>
      {children}
    </header>
  );
}

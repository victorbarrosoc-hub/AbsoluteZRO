"use client";
/**
 * Na escala do projeto, para quem escreve: o recado da produção e o link de entrega que o freela vê em "Seus
 * trabalhos" (drizzle/0037). Recolhido numa linha; um formulário por escala (ids próprios).
 */
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoForm } from "@/components/form";
import { Icone } from "@/components/icones";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

export function ParaFreela({
  escala,
  recado,
  entrega,
  acao,
}: {
  escala: string;
  recado: string | null;
  entrega: string | null;
  acao: (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;
}) {
  const [estado, enviar] = useActionState(acao, undefined);
  const id = useId();
  const valores = estado?.valores ?? { recado: recado ?? "", entrega: entrega ?? "" };
  const tem = !!(recado || entrega);
  return (
    <details className="ef-para">
      <summary>
        <Icone nome="balao" size={14} /> Para o freela{tem ? <span className="ef-para__ponto" aria-label="(preenchido)" /> : null}
      </summary>
      <form action={enviar} className="form form--compacto" noValidate>
        <input type="hidden" name="id" value={escala} />
        {estado?.mensagem ? (
          <p className="erro" role="alert">
            {estado.mensagem}
          </p>
        ) : null}
        {estado?.aviso ? (
          <p className="aviso-ok" role="status">
            <Icone nome="check" size={16} /> {estado.aviso}
          </p>
        ) : null}
        <div className="form__grade">
          <div className={`form__campo form__campo--largo${estado?.erros?.recado ? " form__campo--erro" : ""}`}>
            <label htmlFor={`${id}-recado`}>Recado</label>
            <textarea
              id={`${id}-recado`}
              name="recado"
              rows={3}
              maxLength={2000}
              defaultValue={valores.recado}
              placeholder="Briefing, figurino, o que levar…"
            />
            {estado?.erros?.recado ? <span className="form__erro">{estado.erros.recado}</span> : null}
          </div>
          <div className={`form__campo form__campo--largo${estado?.erros?.entrega ? " form__campo--erro" : ""}`}>
            <label htmlFor={`${id}-entrega`}>Link de entrega</label>
            <input id={`${id}-entrega`} name="entrega" type="url" inputMode="url" maxLength={1000} defaultValue={valores.entrega} placeholder="https://" />
            {estado?.erros?.entrega ? <span className="form__erro">{estado.erros.entrega}</span> : null}
          </div>
        </div>
        <div className="acoes">
          <Salvar />
        </div>
      </form>
    </details>
  );
}

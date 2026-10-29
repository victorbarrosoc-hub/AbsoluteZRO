"use client";
/**
 * Um botão que roda uma Server Action com campos escondidos (dar baixa, mudar status, cancelar reserva…), com o erro
 * ao lado e, se pedido, a confirmação em dois toques. A action confere sessão e papel; o banco confere de novo.
 */
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoForm } from "./form";
import { Icone, type NomeIcone } from "./icones";

type Acao = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

function Enviar({ rotulo, classe, icone, titulo }: { rotulo: ReactNode; classe: string; icone?: NomeIcone; titulo?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending} aria-busy={pending || undefined} title={titulo}>
      {icone ? <Icone nome={icone} size={16} /> : null}
      {rotulo}
    </button>
  );
}

export function BotaoAcao({
  acao,
  campos,
  rotulo,
  classe = "glass-btn glass-btn--sm",
  icone,
  confirmar,
  titulo,
}: {
  acao: Acao;
  campos: Record<string, string>;
  rotulo: ReactNode;
  classe?: string;
  icone?: NomeIcone;
  /** Pergunta do segundo toque (sem ela, um toque só). */
  confirmar?: string;
  titulo?: string;
}) {
  const [estado, enviar] = useActionState(acao, undefined);
  const [certeza, setCerteza] = useState(false);
  return (
    <form action={enviar} className="acao-form">
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {confirmar && !certeza ? (
        <button type="button" className={classe} onClick={() => setCerteza(true)} title={titulo}>
          {icone ? <Icone nome={icone} size={16} /> : null}
          {rotulo}
        </button>
      ) : confirmar ? (
        <span className="remover__certeza">
          <span>{confirmar}</span>
          <Enviar rotulo="Sim" classe="q-perigo" />
          <button type="button" className="q-limpar" onClick={() => setCerteza(false)}>
            Não
          </button>
        </span>
      ) : (
        <Enviar rotulo={rotulo} classe={classe} icone={icone} titulo={titulo} />
      )}
      {estado?.mensagem ? (
        <span className="erro erro--linha" role="alert">
          {estado.mensagem}
        </span>
      ) : null}
    </form>
  );
}

/** Imprimir a página (o timbrado e os documentos saem limpos em A4 pelo CSS de impressão). */
export function BotaoImprimir({ rotulo = "Imprimir ou salvar PDF" }: { rotulo?: string }) {
  return (
    <button type="button" className="glass-btn glass-btn--ink" onClick={() => window.print()}>
      <Icone nome="imprimir" size={18} /> {rotulo}
    </button>
  );
}

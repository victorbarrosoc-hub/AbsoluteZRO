"use client";
/**
 * Botões da demonstração: carregar (uma produtora de exemplo com 10 clientes) e remover em dois toques. As ações
 * (app/ajustes/acoes.ts) conferem sessão e papel; aqui é só a forma.
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { carregarDemonstracaoAcao, removerDemonstracaoAcao } from "@/app/(app)/app/ajustes/acoes";
import { Icone } from "./icones";

function Enviar({ rotulo, ocupado, className }: { rotulo: string; ocupado: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined}>
      {pending ? ocupado : rotulo}
    </button>
  );
}

export function CarregarDemonstracao({ className = "glass-btn" }: { className?: string }) {
  const [estado, enviar] = useActionState(carregarDemonstracaoAcao, undefined);
  return (
    <form action={enviar} className="demo-form">
      <Enviar rotulo="Carregar demonstração" ocupado="Montando a produtora…" className={className} />
      {estado?.mensagem ? (
        <p className="erro" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
    </form>
  );
}

export function RemoverDemonstracao() {
  const [estado, enviar] = useActionState(removerDemonstracaoAcao, undefined);
  const [certeza, setCerteza] = useState(false);
  return (
    <form action={enviar} className="remover">
      {estado?.mensagem ? (
        <p className="erro" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      {certeza ? (
        <div className="remover__certeza">
          <span>Tirar todos os dados de exemplo?</span>
          <Enviar rotulo="Remover" ocupado="Removendo…" className="q-perigo" />
          <button type="button" className="q-limpar" onClick={() => setCerteza(false)}>
            Não
          </button>
        </div>
      ) : (
        <button type="button" className="q-perigo" onClick={() => setCerteza(true)}>
          <Icone nome="lixo" size={16} /> Remover demonstração
        </button>
      )}
    </form>
  );
}

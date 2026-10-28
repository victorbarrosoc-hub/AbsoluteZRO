"use client";
/**
 * "Quero acesso": e-mail, nome opcional e consentimento. O campo "site" é a armadilha (escondido de gente, de leitor de
 * tela e do Tab). Tudo é conferido de novo no servidor (src/app/acoes.ts → lib/lista-espera.ts).
 */
import { useActionState } from "react";
import { queroAcesso, type EstadoEspera } from "@/app/acoes";
import { Icone } from "@/components/icones";

export function QueroAcesso() {
  const [estado, acao, pendente] = useActionState<EstadoEspera, FormData>(queroAcesso, undefined);
  if (estado?.feito) {
    return (
      <div className="espera espera--feito" role="status">
        <span className="espera__selo" aria-hidden="true">
          <Icone nome="aprovacoes" size={28} />
        </span>
        <p className="espera__titulo">Pronto. Você está na lista.</p>
        <p className="apoio">Avisamos por e-mail quando o acesso abrir para você.</p>
      </div>
    );
  }
  const erros = estado?.erros ?? {};
  const valores = estado?.valores;
  return (
    <form action={acao} className="espera" noValidate aria-label="Quero acesso ao Maestro">
      <div className="espera__campos">
        <label className={`espera__campo${erros.email ? " espera__campo--erro" : ""}`}>
          <span>E-mail</span>
          <input
            type="email"
            name="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            placeholder="voce@produtora.com.br"
            defaultValue={valores?.email}
            aria-invalid={erros.email ? true : undefined}
            aria-describedby={erros.email ? "espera-erro-email" : undefined}
          />
          {erros.email ? (
            <small id="espera-erro-email" className="espera__erro">
              {erros.email}
            </small>
          ) : null}
        </label>
        <label className="espera__campo">
          <span>Nome (opcional)</span>
          <input type="text" name="nome" maxLength={80} autoComplete="name" defaultValue={valores?.nome} />
        </label>
      </div>
      <div className="espera__armadilha" aria-hidden="true">
        <label>
          Site
          <input type="text" name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className={`espera__ok${erros.consentimento ? " espera__ok--erro" : ""}`}>
        <input type="checkbox" name="consentimento" value="sim" required aria-invalid={erros.consentimento ? true : undefined} />
        <span>Pode me escrever sobre o acesso ao Maestro. Para sair da lista, é só pedir em contato@absolutezro.com.</span>
      </label>
      {erros.consentimento ? <small className="espera__erro">{erros.consentimento}</small> : null}
      {estado?.mensagem ? (
        <p className="erro" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      <button type="submit" className="glass-btn glass-btn--ink" disabled={pendente}>
        {pendente ? "Enviando…" : "Quero acesso"}
      </button>
    </form>
  );
}

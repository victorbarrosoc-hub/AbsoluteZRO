"use client";
/**
 * A tela do convite do freela (`/convite/<token>`, drizzle/0036): a marca da produtora, uma frase e uma ação. Sem conta:
 * "Criar conta" (o login único abre direto no cadastro) e "Já tenho conta". Com a conta: "Aceitar" como @fulano, ou
 * "Trocar de conta". Aceitou: pronto, "Ver seus trabalhos" (a área do freela) e o perfil profissional.
 */
import { useState, useTransition, type ReactNode } from "react";
import { Icone } from "@/components/icones";
import { Monograma } from "@/components/crm";

type Quem = { arroba: string | null; nome: string | null; foto: string | null };

export function ConviteDoFreela({
  token,
  nome,
  produtora,
  marca,
  quem,
  aceito: jaAceito,
  criarConta,
  entrar,
  perfil,
  trabalhos,
}: {
  token: string;
  nome: string;
  produtora: string;
  marca: ReactNode;
  quem: Quem | null;
  aceito: boolean;
  criarConta: string;
  entrar: string;
  perfil: string;
  /** A área do freela no Maestro (drizzle/0037), pelo login único. */
  trabalhos: string;
}) {
  const [aceito, setAceito] = useState(jaAceito);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, iniciar] = useTransition();

  const aceitar = () =>
    iniciar(async () => {
      setErro(null);
      try {
        const r = await fetch("/api/publico/convite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; mensagem?: string };
        if (r.ok && j.ok) setAceito(true);
        else setErro(j.mensagem ?? "Não deu agora. Tente de novo.");
      } catch {
        setErro("Sem conexão. Tente de novo.");
      }
    });

  const eu = quem?.arroba ? `@${quem.arroba}` : (quem?.nome ?? "sua conta");
  return (
    <section className="cv" aria-labelledby="cv-titulo">
      <div className="cv__marca">{marca}</div>
      {aceito ? (
        <>
          <span className="cv__ok" aria-hidden="true">
            <Icone nome="check" size={30} />
          </span>
          <h1 id="cv-titulo">Pronto, {nome}.</h1>
          <p>Você está no banco de freelas da {produtora}.</p>
          <div className="cv__acoes">
            <a className="glass-btn glass-btn--ink" href={trabalhos}>
              Ver seus trabalhos
            </a>
            <a className="glass-btn" href={perfil}>
              Seu perfil
            </a>
          </div>
        </>
      ) : (
        <>
          <h1 id="cv-titulo">
            Oi, <strong>{nome}.</strong>
          </h1>
          <p>A {produtora} quer você no banco de freelas.</p>
          {quem ? (
            <>
              <div className="cv__quem" aria-label={`Entrando como ${eu}`}>
                {quem.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto da própria conta, do HUB
                  <img src={quem.foto} alt="" width={36} height={36} />
                ) : (
                  <Monograma nome={quem.nome ?? quem.arroba ?? "?"} />
                )}
                <span>{eu}</span>
              </div>
              <div className="cv__acoes">
                <button type="button" className="glass-btn glass-btn--ink" onClick={aceitar} disabled={indo}>
                  {indo ? "Entrando…" : "Aceitar convite"}
                </button>
                <a className="glass-btn" href={entrar}>
                  Trocar de conta
                </a>
              </div>
            </>
          ) : (
            <div className="cv__acoes">
              <a className="glass-btn glass-btn--ink" href={criarConta}>
                Criar conta
              </a>
              <a className="glass-btn" href={entrar}>
                Já tenho conta
              </a>
            </div>
          )}
          {erro ? (
            <p className="cv__erro" role="alert">
              {erro}
            </p>
          ) : (
            <p className="cv__nota">Uma conta Absolute ZRO vale para todos os apps.</p>
          )}
        </>
      )}
    </section>
  );
}

"use client";
/**
 * A conta Absolute ZRO na ficha do freela (drizzle/0036): "Conectado @fulano", "Convite enviado" ou "Sem conta". Quem
 * escreve freelas convida (link de 7 dias), copia o link, manda no WhatsApp (o número e a mensagem do cadastro, com o
 * link no fim; só para quem vê o contato), revoga ou desliga. E-mail em espera: nada é enviado sozinho.
 */
import { useState, useTransition } from "react";
import { linkDoWhatsapp, NOME_DO_ESTADO, textoDoConvite, type ContaDoFreela } from "@/lib/freelas/convite";
import { dataCurta } from "@/lib/dinheiro";
import { Icone } from "@/components/icones";
import { SeloStatus } from "@/components/painel";
import "./conta-zro.css";

type Acoes = {
  convidar: (freelaId: string) => Promise<{ url?: string; expira?: string; mensagem?: string }>;
  revogar: (freelaId: string) => Promise<{ ok?: boolean; mensagem?: string }>;
  desligar: (freelaId: string) => Promise<{ ok?: boolean; mensagem?: string }>;
};

const STATUS = { conectado: "ok", convidado: "enviado", sem_conta: "rascunho" } as const;

export function ContaZro({
  freelaId,
  conta: inicial,
  podeMudar,
  perfilBase,
  whatsapp,
  modelo,
  nome,
  produtora,
  acoes,
}: {
  freelaId: string;
  conta: ContaDoFreela;
  podeMudar: boolean;
  perfilBase: string;
  /** null = sem número ou sem a área "Dados da equipe". */
  whatsapp: string | null;
  modelo: string | null;
  nome: string;
  produtora: string;
  acoes: Acoes;
}) {
  const [conta, setConta] = useState(inicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [certeza, setCerteza] = useState(false);
  const [indo, iniciar] = useTransition();

  const convidar = () =>
    iniciar(async () => {
      setMsg(null);
      const r = await acoes.convidar(freelaId);
      if (r.url && r.expira) setConta({ estado: "convidado", url: r.url, expira: r.expira });
      else setMsg(r.mensagem ?? "Não deu agora. Tente de novo.");
    });
  const revogar = () =>
    iniciar(async () => {
      const r = await acoes.revogar(freelaId);
      if (r.ok) setConta({ estado: "sem_conta" });
      else setMsg(r.mensagem ?? null);
    });
  const desligar = () =>
    iniciar(async () => {
      const r = await acoes.desligar(freelaId);
      setCerteza(false);
      if (r.ok) setConta({ estado: "sem_conta" });
      else setMsg(r.mensagem ?? null);
    });
  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copie o link", url);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  const url = conta.estado === "convidado" ? conta.url : null;
  const wpp = url ? linkDoWhatsapp(whatsapp, textoDoConvite(modelo, nome, produtora, url)) : null;
  return (
    <section className="czro-ficha" aria-label="Conta Absolute ZRO">
      <span className="czro-ficha__estado">
        <SeloStatus status={STATUS[conta.estado]}>{NOME_DO_ESTADO[conta.estado]}</SeloStatus>
        {conta.estado === "conectado" && conta.arroba ? (
          <a className="czro-ficha__arroba" href={`${perfilBase}/pessoas/@${conta.arroba}`} target="_blank" rel="noreferrer" title="Perfil no Absolute ZRO">
            @{conta.arroba}
          </a>
        ) : conta.estado === "convidado" ? (
          <span className="czro-ficha__apoio">até {dataCurta(conta.expira.slice(0, 10))}</span>
        ) : null}
      </span>
      {podeMudar ? (
        <span className="czro-ficha__acoes">
          {conta.estado === "sem_conta" ? (
            <button type="button" className="glass-btn glass-btn--ink glass-btn--sm" onClick={convidar} disabled={indo}>
              <Icone nome="adicionar" size={15} /> Convidar para o Absolute ZRO
            </button>
          ) : null}
          {url ? (
            <>
              <button type="button" className="glass-btn glass-btn--sm" onClick={() => copiar(url)}>
                <Icone nome={copiado ? "check" : "copiar"} size={15} /> {copiado ? "Copiado" : "Copiar link"}
              </button>
              {wpp ? (
                <a className="glass-btn glass-btn--ink glass-btn--sm" href={wpp} target="_blank" rel="noreferrer">
                  <Icone nome="whatsapp" size={15} /> Mandar no WhatsApp
                </a>
              ) : null}
              <button type="button" className="czro-ficha__texto" onClick={revogar} disabled={indo}>
                Revogar
              </button>
            </>
          ) : null}
          {conta.estado === "conectado" ? (
            certeza ? (
              <>
                <button type="button" className="q-perigo" onClick={desligar} disabled={indo}>
                  Desligar a conta
                </button>
                <button type="button" className="czro-ficha__texto" onClick={() => setCerteza(false)}>
                  Não
                </button>
              </>
            ) : (
              <button type="button" className="czro-ficha__texto" onClick={() => setCerteza(true)}>
                Desligar
              </button>
            )
          ) : null}
        </span>
      ) : null}
      {msg ? (
        <p className="czro-ficha__erro" role="alert">
          {msg}
        </p>
      ) : null}
    </section>
  );
}

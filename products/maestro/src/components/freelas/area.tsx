/**
 * A moldura da área do freela (`/trabalhos`, drizzle/0037): o Maestro pequeno no topo, o tema, a troca para o Maestro
 * da produtora (só para quem também é da equipe de alguma) e a conta com Sair. Componente de servidor: recebe a sessão
 * já conferida pela página. Nada da navegação da produtora aparece aqui.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Sessao } from "@/lib/auth/sessao";
import type { MarcaDaProdutora, Resposta } from "@/lib/freelas/area";
import { HUB_URL, ROTAS } from "@/lib/site";
import { Icone } from "@/components/icones";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";
import { Avatar, BotaoSair } from "@/components/shell";
import { SeletorDeTema } from "@/components/tema";

export function AreaDoFreela({ sessao, maestro, children }: { sessao: Sessao; maestro: boolean; children: ReactNode }) {
  const nome = sessao.nome ?? sessao.email ?? "Sua conta";
  return (
    <div className="ft">
      <header className="ft-topo">
        <Link className="ft-topo__marca" href={ROTAS.trabalhos} aria-label="Seus trabalhos">
          <MaestroSimbolo width={30} />
          <span>Maestro</span>
        </Link>
        <div className="ft-topo__fim">
          {maestro ? (
            <Link className="glass-btn glass-btn--sm ft-trocar" href="/app/hoje" title={`Abrir o Maestro da ${sessao.orgNome}`}>
              <Icone nome="quadro" size={15} />
              <span>Produtora</span>
            </Link>
          ) : null}
          <SeletorDeTema />
          <details className="ft-conta">
            <summary title={nome}>
              <Avatar sessao={sessao} />
              <span className="sr-only">{nome}</span>
            </summary>
            <div className="ft-conta__menu">
              <p>{nome}</p>
              <BotaoSair />
            </div>
          </details>
        </div>
      </header>
      <main id="conteudo" className="ft-miolo">
        {children}
      </main>
      <footer className="ft-rodape">
        <a href={HUB_URL} target="_blank" rel="noreferrer">
          <ZroSimbolo size={14} /> <span>Absolute ZRO</span>
        </a>
      </footer>
    </div>
  );
}

/** A cor da produtora como filete (nunca texto), igual às páginas do cliente. */
export const corDaProdutora = (cor: string | null): CSSProperties | undefined => (cor ? ({ "--acento": cor } as CSSProperties) : undefined);

export function MarcaPequena({ marca }: { marca: MarcaDaProdutora }) {
  return (
    <span className="ft-marca">
      {marca.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo da produtora, bytes do banco pela rota própria
        <img src={marca.logo} alt="" />
      ) : (
        <i aria-hidden="true">{marca.nome.trim().charAt(0).toUpperCase()}</i>
      )}
      <span>{marca.nome}</span>
    </span>
  );
}

const RESPOSTA: Record<Resposta, { nome: string; status: string }> = {
  confirmado: { nome: "Confirmado", status: "ok" },
  recusado: { nome: "Recusado", status: "recusado" },
};

/** O estado do trabalho para o freela: confirmado, recusado ou esperando a resposta dele (só enquanto não passou). */
export function EstadoDoTrabalho({ resposta, aberto }: { resposta: Resposta | null; aberto: boolean }) {
  if (resposta)
    return (
      <span className="ft-estado" data-status={RESPOSTA[resposta].status}>
        <i aria-hidden="true" />
        {RESPOSTA[resposta].nome}
      </span>
    );
  if (!aberto) return null;
  return (
    <span className="ft-estado" data-status="responder">
      <i aria-hidden="true" />
      Responder
    </span>
  );
}

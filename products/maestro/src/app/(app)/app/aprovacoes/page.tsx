import Link from "next/link";
import type { CSSProperties } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEscrever } from "@/lib/papeis";
import { listarLotes, type LoteResumo } from "@/lib/revisao/equipe";
import { Monograma } from "@/components/crm";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";
import "../../../revisao.css";

export const metadata = { title: "Aprovações" };

const NOME_STATUS = { rascunho: "Rascunho", enviado: "Com o cliente", fechado: "Fechado" } as const;

function Anel({ l }: { l: LoteResumo }) {
  const p = l.pecas ? l.decididas / l.pecas : 0;
  return (
    <span className="ap-anel" style={{ "--p": p } as CSSProperties} title={`${l.decididas} de ${l.pecas} decididas`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" pathLength="100" className="ap-anel__fundo" />
        <circle cx="18" cy="18" r="15" pathLength="100" className="ap-anel__feito" />
      </svg>
      <span>
        {l.decididas}/{l.pecas}
      </span>
    </span>
  );
}

/** Lotes para o cliente decidir pelo link, peça a peça (texto e vídeo juntos). */
export default async function Aprovacoes() {
  const sessao = await exigirAcessoNaPagina("/app/aprovacoes");
  const lotes = await listarLotes({ sub: sessao.sub, orgId: sessao.orgId });
  const escreve = podeEscrever(sessao.papel);
  const novo = escreve ? (
    <Link className="glass-btn glass-btn--ink" href="/app/aprovacoes/novo">
      <Icone nome="mais" size={18} /> Novo lote
    </Link>
  ) : null;
  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Suas <strong>aprovações.</strong>
        </h1>
        {lotes.length ? novo : null}
      </header>
      {!lotes.length ? (
        <EstadoVazio icone="aprovacoes" titulo="Nenhum lote ainda" apoio="Junte as peças em revisão e mande um link. O cliente decide sem conta.">
          {novo}
        </EstadoVazio>
      ) : (
        <ul className="lista ap-lotes" aria-label="Lotes">
          {lotes.map((l) => (
            <li key={l.id}>
              <Link className="item" href={`/app/aprovacoes/${l.id}`}>
                <Monograma nome={l.cliente.nome} />
                <span className="item__miolo">
                  <span className="item__nome">{l.titulo}</span>
                  <span className="item__apoio">
                    {l.cliente.nome} · {NOME_STATUS[l.status]}
                  </span>
                </span>
                <span className="item__numeros">
                  {l.abertos ? (
                    <span title="Comentários em aberto">
                      <Icone nome="balao" size={14} /> {l.abertos}
                    </span>
                  ) : null}
                  {l.link ? (
                    <span title={l.link.pin ? "Link ativo, com PIN" : "Link ativo"}>
                      <Icone nome={l.link.pin ? "cadeado" : "link"} size={14} />
                    </span>
                  ) : null}
                </span>
                <Anel l={l} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

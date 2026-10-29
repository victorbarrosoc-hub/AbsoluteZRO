import Link from "next/link";
import type { CSSProperties } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEditarCriacao } from "@/lib/criacao/permissoes";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { listarRoteiros, NOME_ESTADO_ROTEIRO, opcoesDeVinculo } from "@/lib/criacao/roteiro/servidor";
import { barra, quando, STATUS_DO_ESTADO, textoAlvo } from "@/components/criacao/roteiro/comum";
import { NovoRoteiro } from "@/components/criacao/roteiro/novo";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Criação" };

const um = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Produção → Criação (plano da Criação §3): os roteiros da produtora em cartões (título, vínculo, duração contra o
 * alvo, estado, quando mudou) e o "Novo roteiro" com os 6 modelos. O seletor Roteiros · Fluxos já mostra onde o Fluxo
 * vai morar; até a F5 ele diz "em breve" (nada fingido).
 */
export default async function Criacao({ searchParams }: PageProps<"/app/criacao">) {
  const s = await exigirAcessoNaPagina("/app/criacao");
  const sp = await searchParams;
  const aba = sp.aba === "fluxos" ? "fluxos" : "roteiros";
  const ctx = { sub: s.sub, orgId: s.orgId };
  const edita = podeEditarCriacao(s.papel);
  const [roteiros, opcoes] = await Promise.all([listarRoteiros(ctx), edita ? opcoesDeVinculo(ctx) : Promise.resolve({ projetos: [], cards: [] })]);
  const novo = edita ? <NovoRoteiro opcoes={opcoes} aberto={sp.novo === "1"} projeto={um(sp.projeto)} card={um(sp.card)} /> : null;
  return (
    <div className="pagina pagina--larga cr-pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <div>
          <h1 className="atitle">
            <strong>Criação.</strong>
          </h1>
          <nav className="q-segmentos cr-abas" aria-label="Criação">
            <Link href="/app/criacao" aria-current={aba === "roteiros" ? "page" : undefined}>
              Roteiros
            </Link>
            <Link href="/app/criacao?aba=fluxos" aria-current={aba === "fluxos" ? "page" : undefined}>
              Fluxos
            </Link>
          </nav>
        </div>
        {aba === "roteiros" && roteiros.length ? <div className="acoes">{novo}</div> : null}
      </header>

      {aba === "fluxos" ? (
        <EstadoVazio icone="fluxo" titulo="Fluxos chegam em breve." apoio="Ideias e referências num quadro livre, ligadas ao roteiro." />
      ) : roteiros.length ? (
        <ul className="cr-lista">
          {roteiros.map((r, i) => {
            const b = barra(r.duracaoSeg, r.alvo);
            const ligacao = [r.projeto, r.card].filter(Boolean).join(" · ");
            return (
              <li key={r.id} className="cr-cartao" style={{ "--i": i } as CSSProperties}>
                <Link href={`/app/criacao/roteiros/${r.id}`} className="cr-cartao__link">
                  <span className="cr-cartao__topo">
                    <span className="selo" data-status={STATUS_DO_ESTADO[r.estado]}>
                      <i aria-hidden="true" />
                      {r.versaoAtual ? `v${r.versaoAtual} · ` : ""}
                      {NOME_ESTADO_ROTEIRO[r.estado]}
                    </span>
                    <span className="cr-cartao__formato" data-formato={r.formato} title={`Formato ${r.formato}`}>
                      <i aria-hidden="true" />
                      {r.formato}
                    </span>
                  </span>
                  <span className="cr-cartao__titulo">{r.titulo}</span>
                  <span className="cr-cartao__ligacao">
                    {ligacao ? (
                      <>
                        <Icone nome="link" size={13} /> {ligacao}
                      </>
                    ) : (
                      "Sem projeto"
                    )}
                  </span>
                  <span className="cr-medidor" data-estado={b.estado} title={b.titulo}>
                    <i style={{ width: `${Math.round(b.fracao * 100)}%` }} />
                  </span>
                  <span className="cr-cartao__pe">
                    <b className="num">{formatarTempo(r.duracaoSeg)}</b>
                    {r.alvo ? <span> · {textoAlvo(r.alvo)}</span> : null}
                    <span className="cr-cartao__quando">{quando(r.atualizado)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EstadoVazio icone="criacao" titulo="Nenhum roteiro ainda." apoio={edita ? "Comece por um modelo." : "Quando a equipe escrever, aparece aqui."}>
          {novo}
        </EstadoVazio>
      )}
    </div>
  );
}

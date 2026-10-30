import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { type ItemLixeira } from "@/lib/criacao/lixeira";
import { podeApagarDeVezCriacao, podeEditarCriacao } from "@/lib/criacao/permissoes";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { listarRoteiros, NOME_ESTADO_ROTEIRO, opcoesDeVinculo, type RoteiroLista } from "@/lib/criacao/roteiro/servidor";
import { AbasCriacao } from "@/components/criacao/abas";
import { CartaoApagavel, CartaoNaLixeira, ListaLixeira } from "@/components/criacao/lixeira";
import { barra, quando, STATUS_DO_ESTADO, textoAlvo } from "@/components/criacao/roteiro/comum";
import { NovoRoteiro } from "@/components/criacao/roteiro/novo";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";
import "../../../lixeira.css";

export const metadata = { title: "Criação" };

const um = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const itemDe = (r: RoteiroLista): ItemLixeira => ({
  tipo: "roteiro",
  id: r.id,
  titulo: r.titulo,
  card: r.cardId ? (r.card ?? "Card") : null,
  links: 0,
  versoes: r.versaoAtual,
});

/**
 * Produção → Criação (plano da Criação §3): os roteiros da produtora em cartões (título, vínculo, duração contra o
 * alvo, estado, quando mudou) e o "Novo roteiro" com os 6 modelos. O seletor Roteiros · Fluxos leva à rota irmã
 * `/app/criacao/fluxos` (o `?aba=fluxos` antigo vai para lá). Apagar = lixeira, com Desfazer (`components/criacao/lixeira.tsx`);
 * `?lixeira=1` mostra a lixeira (Restaurar; Apagar de vez para administração e gestão).
 */
export default async function Criacao({ searchParams }: PageProps<"/app/criacao">) {
  const s = await exigirAcessoNaPagina("/app/criacao");
  const sp = await searchParams;
  if (sp.aba === "fluxos") redirect("/app/criacao/fluxos");
  const ctx = { sub: s.sub, orgId: s.orgId };
  const edita = podeEditarCriacao(s.papel);
  if (sp.lixeira === "1") return <Lixeira ctx={ctx} edita={edita} deVez={podeApagarDeVezCriacao(s.papel)} />;
  const [roteiros, naLixeira, opcoes] = await Promise.all([
    listarRoteiros(ctx),
    listarRoteiros(ctx, { lixeira: true }),
    edita ? opcoesDeVinculo(ctx) : Promise.resolve({ projetos: [], cards: [] }),
  ]);
  const novo = edita ? <NovoRoteiro opcoes={opcoes} aberto={sp.novo === "1"} projeto={um(sp.projeto)} card={um(sp.card)} /> : null;
  const apagou = naLixeira.find((r) => r.id === um(sp.apagou));
  return (
    <ListaLixeira key="lista" apagouAgora={apagou && edita ? itemDe(apagou) : null}>
      <div className="pagina pagina--larga cr-pagina">
        <header className="pagina__cabeca pagina__cabeca--acao">
          <div>
            <h1 className="atitle">
              <strong>Criação.</strong>
            </h1>
            <AbasCriacao atual="roteiros" />
          </div>
          {roteiros.length ? <div className="acoes">{novo}</div> : null}
        </header>

        {roteiros.length ? (
          <ul className="cr-lista">
            {roteiros.map((r, i) => {
              const b = barra(r.duracaoSeg, r.alvo);
              const ligacao = [r.projeto, r.card].filter(Boolean).join(" · ");
              return (
                <CartaoApagavel
                  key={r.id}
                  item={itemDe(r)}
                  href={`/app/criacao/roteiros/${r.id}`}
                  podeApagar={edita}
                  className="cr-cartao"
                  style={{ "--i": i } as CSSProperties}
                >
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
                </CartaoApagavel>
              );
            })}
          </ul>
        ) : (
          <EstadoVazio icone="criacao" titulo="Nenhum roteiro ainda." apoio={edita ? "Comece por um modelo." : "Quando a equipe escrever, aparece aqui."}>
            {novo}
          </EstadoVazio>
        )}

        {naLixeira.length ? (
          <Link className="lx-entrada" href="/app/criacao?lixeira=1">
            <Icone nome="lixo" size={15} /> Lixeira · {naLixeira.length}
          </Link>
        ) : null}
      </div>
    </ListaLixeira>
  );
}

/** Roteiros na lixeira: o cartão (sem abrir: o editor não abre o que está na lixeira) e Restaurar / Apagar de vez. */
async function Lixeira({ ctx, edita, deVez }: { ctx: { sub: string; orgId: string }; edita: boolean; deVez: boolean }) {
  const roteiros = await listarRoteiros(ctx, { lixeira: true });
  return (
    <ListaLixeira key="lixeira">
      <div className="pagina pagina--larga cr-pagina">
        <header className="pagina__cabeca pagina__cabeca--acao">
          <h1 className="atitle">
            Roteiros na <strong>lixeira.</strong>
          </h1>
          <Link className="glass-btn glass-btn--sm" href="/app/criacao">
            <Icone nome="voltar" size={16} /> Roteiros
          </Link>
        </header>
        {roteiros.length ? (
          <ul className="cr-lista" aria-label="Roteiros na lixeira">
            {roteiros.map((r) => (
              <CartaoNaLixeira key={r.id} item={itemDe(r)} podeRestaurar={edita} podeDeVez={deVez} className="cr-cartao">
                <div className="cr-cartao__link lx-parado">
                  <span className="cr-cartao__topo">
                    <span className="selo" data-status={STATUS_DO_ESTADO[r.estado]}>
                      <i aria-hidden="true" />
                      {r.versaoAtual ? `v${r.versaoAtual} · ` : ""}
                      {NOME_ESTADO_ROTEIRO[r.estado]}
                    </span>
                  </span>
                  <span className="cr-cartao__titulo">{r.titulo}</span>
                  <span className="cr-cartao__pe">
                    <b className="num">{formatarTempo(r.duracaoSeg)}</b>
                    <span className="cr-cartao__quando">{quando(r.atualizado)}</span>
                  </span>
                </div>
              </CartaoNaLixeira>
            ))}
          </ul>
        ) : (
          <EstadoVazio icone="lixo" titulo="Lixeira vazia" />
        )}
      </div>
    </ListaLixeira>
  );
}

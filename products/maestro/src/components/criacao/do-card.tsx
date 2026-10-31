"use client";
/**
 * O bloco "Criação" na ficha do card (plano da Criação §4.5; roteiros da F3, fluxos da F6): o que a Criação tem ligado
 * ao card, numa lista só. Roteiro com versão, duração contra o alvo e estado; fluxo com o número de itens. Cada linha
 * abre o editor ou o canvas. "Novo roteiro" já nasce ligado (`?novo=1&card=`); o fluxo chega ao card pelo "Mandar
 * para um card" do próprio fluxo. Quem só lê vê a lista, sem o "Novo", e o bloco some quando não há nada.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { criacaoDoCardAcao } from "@/app/(app)/app/criacao/acoes";
import { NOME_ESTADO_ROTEIRO } from "@/lib/criacao/roteiro/nomes";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { Icone } from "@/components/icones";
import { barra, STATUS_DO_ESTADO } from "./roteiro/comum";

type Itens = Omit<Awaited<ReturnType<typeof criacaoDoCardAcao>>, "ok">;

const itens = (n: number) => (n === 1 ? "1 item" : `${n} itens`);

export function CriacaoDoCard({ card, podeEscrever }: { card: string; podeEscrever: boolean }) {
  const [dados, setDados] = useState<Itens | null>(null);

  useEffect(() => {
    let vivo = true;
    void criacaoDoCardAcao(card).then(
      (r) => vivo && setDados({ roteiros: r.roteiros, fluxos: r.fluxos }),
      () => vivo && setDados((v) => v ?? { roteiros: [], fluxos: [] }),
    );
    return () => {
      vivo = false;
    };
  }, [card]);

  const vazio = dados !== null && !dados.roteiros.length && !dados.fluxos.length;
  if (vazio && !podeEscrever) return null;
  return (
    <section className="cr-card" aria-label="Criação" aria-busy={dados === null || undefined}>
      <span className="cr-card__titulo">Criação</span>
      {dados && !vazio ? (
        <ul className="cr-card__lista">
          {dados.roteiros.map((r) => {
            const b = barra(r.duracaoSeg, r.alvo);
            return (
              <li key={r.id}>
                <Link className="cr-card__item" href={`/app/criacao/roteiros/${r.id}`}>
                  <Icone nome="criacao" size={16} />
                  <span className="cr-card__nome">{r.titulo}</span>
                  <span className="cr-card__meta">
                    <span className="num" title={b.titulo}>
                      {formatarTempo(r.duracaoSeg)}
                    </span>
                    <span className="selo" data-status={STATUS_DO_ESTADO[r.estado]}>
                      <i aria-hidden="true" />
                      {r.versaoAtual ? `v${r.versaoAtual} · ` : ""}
                      {NOME_ESTADO_ROTEIRO[r.estado]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {dados.fluxos.map((f) => (
            <li key={f.id}>
              <Link className="cr-card__item" href={`/app/criacao/fluxos/${f.id}`}>
                <Icone nome="fluxo" size={16} />
                <span className="cr-card__nome">{f.titulo}</span>
                <span className="cr-card__meta">
                  <span className="num">{itens(f.itens)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : vazio ? (
        <p className="cr-card__vazio">Nenhum roteiro ou fluxo ainda.</p>
      ) : null}
      {podeEscrever ? (
        <Link className="glass-btn glass-btn--sm cr-card__novo" href={`/app/criacao?novo=1&card=${encodeURIComponent(card)}`}>
          <Icone nome="mais" size={14} /> Novo roteiro
        </Link>
      ) : null}
    </section>
  );
}

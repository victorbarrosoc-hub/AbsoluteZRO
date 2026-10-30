"use client";
/**
 * O bloco "Criação" na ficha do card (plano da Criação §4.5, fase F3): os roteiros ligados ao card (título, versão,
 * duração contra o alvo e estado), cada um abrindo o editor, e "Novo roteiro" já ligado ao card (`?novo=1&card=`).
 * Ligar um roteiro que já existe é no editor (Ajustes do roteiro). Leitura vê a lista, sem o "Novo".
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { roteirosDoCardAcao } from "@/app/(app)/app/criacao/acoes";
import { NOME_ESTADO_ROTEIRO } from "@/lib/criacao/roteiro/nomes";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { Icone } from "@/components/icones";
import { barra, STATUS_DO_ESTADO } from "./comum";

type Item = Awaited<ReturnType<typeof roteirosDoCardAcao>>["roteiros"][number];

export function CriacaoDoCard({ card, podeEscrever }: { card: string; podeEscrever: boolean }) {
  const [roteiros, setRoteiros] = useState<Item[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void roteirosDoCardAcao(card).then(
      (r) => vivo && setRoteiros(r.roteiros),
      () => vivo && setRoteiros((v) => v ?? []),
    );
    return () => {
      vivo = false;
    };
  }, [card]);

  if (roteiros && !roteiros.length && !podeEscrever) return null;
  return (
    <section className="cr-card" aria-label="Criação" aria-busy={roteiros === null || undefined}>
      <span className="cr-card__titulo">Criação</span>
      {roteiros?.length ? (
        <ul className="cr-card__lista">
          {roteiros.map((r) => {
            const b = barra(r.duracaoSeg, r.alvo);
            return (
              <li key={r.id}>
                <Link className="cr-card__roteiro" href={`/app/criacao/roteiros/${r.id}`}>
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
        </ul>
      ) : roteiros ? (
        <p className="cr-card__vazio">Nenhum roteiro ainda.</p>
      ) : null}
      {podeEscrever ? (
        <Link className="glass-btn glass-btn--sm cr-card__novo" href={`/app/criacao?novo=1&card=${encodeURIComponent(card)}`}>
          <Icone nome="mais" size={14} /> Novo roteiro
        </Link>
      ) : null}
    </section>
  );
}

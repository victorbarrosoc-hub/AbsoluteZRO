"use client";
/**
 * As versões do card na ficha do Quadro: v1, v2… com a fonte e o link para abrir, e um campo para colar a próxima. É
 * o mesmo caminho do lote (`useNovaVersao` → `novaVersaoAcao` → `maestro.versao_criar`): a versão é do card, então o
 * lote que tiver o card já a mostra. Leitura vê a lista, sem o campo. Fica dentro do formulário da ficha, por isso não
 * tem <form> próprio: Enter no campo adiciona (e não envia a ficha).
 */
import { useCallback, useEffect, useState } from "react";
import { versoesDoCardAcao } from "@/app/(app)/app/aprovacoes/acoes";
import { NOME_DA_FONTE, type TipoFonte } from "@/lib/revisao/fontes/detectar";
import type { VersaoDoCard } from "@/lib/revisao/equipe";
import { Icone, type NomeIcone } from "@/components/icones";
import { useNovaVersao } from "@/components/revisao/nova-versao";

const ICONE: Record<TipoFonte, NomeIcone> = {
  drive: "nuvem",
  youtube: "tocar",
  vimeo: "tocar",
  dropbox: "nuvem",
  mp4: "filme",
  hls: "filme",
  link: "link",
};

const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function VersoesDoCard({ card, podeEscrever }: { card: string; podeEscrever: boolean }) {
  const [versoes, setVersoes] = useState<VersaoDoCard[] | null>(null);
  const [vez, setVez] = useState(0);
  const recarregar = useCallback(() => setVez((n) => n + 1), []);
  const { link, setLink, fonte, pendente, enviar, mensagem } = useNovaVersao(card, recarregar);

  useEffect(() => {
    let vivo = true;
    void versoesDoCardAcao(card).then(
      (r) => vivo && setVersoes(r.ok ? r.versoes : []),
      () => vivo && setVersoes((v) => v ?? []),
    );
    return () => {
      vivo = false;
    };
  }, [card, vez]);

  return (
    <section className="vc" aria-label="Versões" aria-busy={versoes === null || undefined}>
      <span className="vc__titulo">Versões</span>
      {versoes?.length ? (
        <ul className="vc__lista">
          {versoes.map((v) => (
            <li key={v.id}>
              <a className="vc__versao" href={v.url} target="_blank" rel="noreferrer noopener" title={`${NOME_DA_FONTE[v.fonte]} · abrir em outra aba`}>
                <span className="vc__n">v{v.n}</span>
                <Icone nome={ICONE[v.fonte]} size={15} className="vc__icone" />
                <span className="vc__nome">{v.titulo ?? NOME_DA_FONTE[v.fonte]}</span>
                <span className="vc__dia">{dia(v.em)}</span>
                <Icone nome="externo" size={14} className="vc__abrir" />
              </a>
            </li>
          ))}
        </ul>
      ) : versoes && !podeEscrever ? (
        <p className="vc__vazio">Nenhuma versão ainda.</p>
      ) : null}
      {podeEscrever ? (
        <>
          <div className="vc__colar">
            <Icone nome="link" size={16} />
            <input
              type="url"
              inputMode="url"
              data-campo="versao"
              placeholder="Cole o link da versão"
              aria-label="Link da versão"
              title="Drive, YouTube, Vimeo, Dropbox, mp4…"
              value={link}
              maxLength={2000}
              onChange={(e) => setLink(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (!pendente) enviar();
              }}
            />
            {fonte?.ok ? (
              <span className="vc__fonte">
                <i aria-hidden="true" />
                {NOME_DA_FONTE[fonte.tipo]}
              </span>
            ) : null}
            <button type="button" className="glass-btn glass-btn--ink glass-btn--sm" disabled={pendente || !fonte?.ok} onClick={enviar}>
              {pendente ? "Guardando…" : "Adicionar"}
            </button>
          </div>
          {mensagem ? (
            <p className="vc__erro" role="alert">
              {mensagem}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

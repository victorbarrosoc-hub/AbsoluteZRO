"use client";
/**
 * Entregáveis de um card (as versões de entrega que o Relay gerou ou está gerando) e o botão "Gerar versões" de uma
 * versão do Drive. A lista pergunta ao servidor a cada 5 s só enquanto há item andando e a aba está à vista (a ficha ou
 * o lote abertos); o servidor lê o andamento no SOBEDESCE e guarda (src/lib/relay/entregaveis.ts).
 * "Pronto" só com o MD5 conferido do lado do SOBEDESCE; o Maestro nunca promete prazo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelarEntregavelAcao, entregaveisDoCardAcao } from "@/app/(app)/app/aprovacoes/relay-acoes";
import type { Computador, Entregavel } from "@/lib/relay/entregaveis";
import { Icone } from "@/components/icones";

const ANDANDO = new Set(["pendente", "convertendo"]);
export const COMPUTADOR_FECHADO = "Vai começar quando o computador com o SOBEDESCE abrir.";

export type EstadoEntregas = {
  lista: Entregavel[] | null;
  computador: Computador | null;
  aviso: string | null;
  /** Depois de pedir: a lista e o computador que o servidor devolveu. */
  aplicar: (lista: Entregavel[], computador: Computador | null) => void;
  trocar: (e: Entregavel) => void;
};

/** A lista do card e o acompanhamento (5 s, só com item andando e a aba à vista). */
export function useEntregaveis(card: string): EstadoEntregas {
  const [lista, setLista] = useState<Entregavel[] | null>(null);
  const [computador, setComputador] = useState<Computador | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const vivo = useRef(true);

  const ler = useCallback(
    (acompanhar: boolean) =>
      entregaveisDoCardAcao(card, acompanhar).then(
        (r) => {
          if (!vivo.current) return;
          setLista(r.entregaveis);
          setComputador(r.computador);
          setAviso(r.aviso);
        },
        () => vivo.current && setLista((l) => l ?? []),
      ),
    [card],
  );

  useEffect(() => {
    vivo.current = true;
    entregaveisDoCardAcao(card, true).then(
      (r) => {
        if (!vivo.current) return;
        setLista(r.entregaveis);
        setComputador(r.computador);
        setAviso(r.aviso);
      },
      () => vivo.current && setLista((l) => l ?? []),
    );
    return () => {
      vivo.current = false;
    };
  }, [card]);

  const andando = !!lista?.some((e) => ANDANDO.has(e.status));
  useEffect(() => {
    if (!andando) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void ler(true);
    }, 5000);
    const voltou = () => document.visibilityState === "visible" && void ler(true);
    document.addEventListener("visibilitychange", voltou);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [andando, ler]);

  const aplicar = useCallback((novas: Entregavel[], c: Computador | null) => {
    // o servidor devolve todos os entregáveis da versão pedida, na ordem da folha
    const versoes = new Set(novas.map((n) => n.versao));
    setLista((l) => [...(l ?? []).filter((x) => !versoes.has(x.versao)), ...novas]);
    setComputador(c);
  }, []);
  const trocar = useCallback((e: Entregavel) => setLista((l) => (l ?? []).map((x) => (x.id === e.id ? e : x))), []);
  return { lista, computador, aviso, aplicar, trocar };
}

const NOME_STATUS: Record<Entregavel["status"], string> = {
  pendente: "Na fila",
  convertendo: "Convertendo",
  pronto: "Pronto",
  erro: "Erro",
  cancelado: "Cancelado",
};

function tamanho(b: number | null) {
  if (b === null) return null;
  if (b >= 1e9) return `${(b / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.max(1, Math.round(b / 1e3))} KB`;
}

function Item({ e, podeCancelar, aoTrocar }: { e: Entregavel; podeCancelar: boolean; aoTrocar: (e: Entregavel) => void }) {
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pct = e.status === "convertendo" && e.frac !== null ? Math.round(e.frac * 100) : null;
  return (
    <li className="rl-item" data-status={e.status}>
      <div className="rl-item__linha">
        <span className="rl-item__nome" title={e.arquivo?.nome ?? e.nome}>
          {e.nome}
        </span>
        <span className="rl-chip" data-status={e.status} title={e.status === "pronto" ? `MD5 ${e.arquivo?.md5} conferido no Drive` : (e.erro ?? undefined)}>
          <i aria-hidden="true" />
          {NOME_STATUS[e.status]}
          {pct !== null ? ` ${pct}%` : ""}
          {e.status === "pronto" ? (
            <span className="rl-chip__md5">
              <Icone nome="check" size={12} /> MD5
            </span>
          ) : null}
        </span>
        {e.arquivo ? (
          <>
            <a
              className="rl-acao"
              href={e.arquivo.abrir}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Abrir ${e.nome} no Drive`}
              title="Abrir no Drive"
            >
              <Icone nome="externo" size={15} />
            </a>
            <button
              type="button"
              className="rl-acao"
              aria-label={copiado ? "Link copiado" : `Copiar o link de ${e.nome}`}
              title={copiado ? "Copiado" : "Copiar link"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(e.arquivo!.abrir);
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 1600);
                } catch {
                  setErro("Não deu para copiar.");
                }
              }}
            >
              <Icone nome={copiado ? "check" : "copiar"} size={15} />
            </button>
          </>
        ) : ANDANDO.has(e.status) && podeCancelar ? (
          <button
            type="button"
            className="rl-acao"
            aria-label={`Cancelar ${e.nome}`}
            title="Cancelar"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              const r = await cancelarEntregavelAcao(e.id).catch(() => null);
              setOcupado(false);
              if (r?.ok) aoTrocar(r.entregavel);
              else setErro(r?.mensagem ?? "Não deu para cancelar agora.");
            }}
          >
            <Icone nome="fechar" size={15} />
          </button>
        ) : null}
      </div>
      {pct !== null ? (
        <span className="rl-barra" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      {e.status === "pronto" && e.arquivo ? (
        <span className="rl-item__apoio">{[e.arquivo.nome, tamanho(e.arquivo.tamanho), e.pasta?.nome].filter(Boolean).join(" · ")}</span>
      ) : e.status === "erro" && e.erro ? (
        <span className="rl-item__apoio">{e.erro}</span>
      ) : null}
      {erro ? (
        <span className="rl-item__erro" role="alert">
          {erro}
        </span>
      ) : null}
    </li>
  );
}

/** A lista "Entregáveis" de uma versão (ou do card inteiro, com o número da versão). */
export function ListaEntregaveis({
  itens,
  computador,
  aviso,
  podeCancelar,
  aoTrocar,
  rotulo = "Entregáveis",
}: {
  itens: Entregavel[];
  computador: Computador | null;
  aviso: string | null;
  podeCancelar: boolean;
  aoTrocar: (e: Entregavel) => void;
  rotulo?: string;
}) {
  if (!itens.length) return null;
  const esperando = itens.some((e) => e.status === "pendente") && computador?.aberto_agora === false;
  return (
    <section className="rl-lista" aria-label={rotulo}>
      <ul>
        {itens.map((e) => (
          <Item key={e.id} e={e} podeCancelar={podeCancelar} aoTrocar={aoTrocar} />
        ))}
      </ul>
      {esperando ? (
        <p className="rl-lista__nota">
          <Icone nome="relogio" size={14} /> {COMPUTADOR_FECHADO}
        </p>
      ) : null}
      {aviso ? <p className="rl-lista__nota">{aviso}</p> : null}
    </section>
  );
}

/** O botão da versão do Drive: com o ícone do Relay; em destaque quando a versão está aprovada. */
export function BotaoGerar({ aprovada, aoAbrir }: { aprovada: boolean; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      className={`glass-btn glass-btn--sm rl-botao${aprovada ? " glass-btn--ink" : ""}`}
      onClick={aoAbrir}
      title="Versões de entrega (YouTube, Reels, WhatsApp…) com o Relay"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/relay-icone.svg" alt="" width={18} height={18} className="rl-marca" />
      Gerar versões
    </button>
  );
}

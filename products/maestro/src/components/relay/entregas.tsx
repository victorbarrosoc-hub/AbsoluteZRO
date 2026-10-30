"use client";
/**
 * Entregáveis de um card (as versões de entrega que o Relay gerou ou está gerando) e o botão "Gerar versões" de uma
 * versão do Drive. A lista pergunta ao servidor só enquanto há item andando e a aba está à vista (a ficha ou o lote
 * abertos): a cada 5 s com o computador aberto ou convertendo, a cada 15 s com tudo na fila e o computador fechado
 * (nada vai mudar até ele abrir). O servidor lê o andamento no SOBEDESCE e guarda (src/lib/relay/entregaveis.ts).
 * "Pronto" só com o MD5 conferido do lado do SOBEDESCE; o Maestro nunca promete prazo nem mostra progresso que não veio.
 * O botão "Gerar versões" só aparece quando funciona (`gerar`: um computador da conta com o SOBEDESCE que converte);
 * com app antigo, no lugar dele, o pedido para atualizar (`AvisoAtualizar`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelarEntregavelAcao, conferirEntregavelAcao, entregaveisDoCardAcao } from "@/app/(app)/app/aprovacoes/relay-acoes";
import type { Computador, Entregavel } from "@/lib/relay/entregaveis";
import { intervaloDoAcompanhar, MSG_ATUALIZAR, type Gerar } from "@/lib/relay/escolha";
import { Icone } from "@/components/icones";

const ANDANDO = new Set(["pendente", "convertendo"]);
export const COMPUTADOR_FECHADO = "Começa quando o computador com o SOBEDESCE abrir.";
const NO_NAVEGADOR = "Converter no navegador com o Relay: baixe o original do Drive antes. O arquivo não volta para o card sozinho.";
const RELAY_CONVERTER = "https://relay.absolutezro.com/converter";

export type EstadoEntregas = {
  lista: Entregavel[] | null;
  computador: Computador | null;
  aviso: string | null;
  /** O papel pede, confere e cancela (o servidor decide por `podeEntregas`). */
  podePedir: boolean;
  /** "Gerar versões" (`sim`), o pedido para atualizar o app do computador (`atualizar`) ou nada; `nao` até saber. */
  gerar: Gerar;
  /** Depois de pedir ou conferir: os itens e o computador que o servidor devolveu. */
  aplicar: (lista: Entregavel[], computador: Computador | null) => void;
  trocar: (e: Entregavel) => void;
};

/** A lista do card e o acompanhamento. */
export function useEntregaveis(card: string): EstadoEntregas {
  const [lista, setLista] = useState<Entregavel[] | null>(null);
  const [computador, setComputador] = useState<Computador | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [podePedir, setPodePedir] = useState(false);
  const [gerar, setGerar] = useState<Gerar>("nao");
  const vivo = useRef(true);

  const ler = useCallback(
    () =>
      entregaveisDoCardAcao(card, true).then(
        (r) => {
          if (!vivo.current) return;
          setLista(r.entregaveis);
          if (r.computador) setComputador(r.computador);
          setAviso(r.aviso);
          setPodePedir(r.podePedir);
          // Na volta sem resposta do SOBEDESCE durante o acompanhamento, o botão que já estava fica (ele já funcionou).
          setGerar((g) => (r.gerar !== "nao" || !r.aviso ? r.gerar : g));
        },
        () => vivo.current && setLista((l) => l ?? []),
      ),
    [card],
  );

  useEffect(() => {
    vivo.current = true;
    void ler();
    return () => {
      vivo.current = false;
    };
  }, [ler]);

  const intervalo = intervaloDoAcompanhar(lista, computador);
  useEffect(() => {
    if (!intervalo) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void ler();
    }, intervalo);
    const voltou = () => document.visibilityState === "visible" && void ler();
    document.addEventListener("visibilitychange", voltou);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [intervalo, ler]);

  const aplicar = useCallback((novas: Entregavel[], c: Computador | null) => {
    // o servidor devolve todos os entregáveis da versão pedida, na ordem da folha
    const versoes = new Set(novas.map((n) => n.versao));
    setLista((l) => [...(l ?? []).filter((x) => !versoes.has(x.versao)), ...novas]);
    if (c) setComputador(c);
  }, []);
  const trocar = useCallback((e: Entregavel) => setLista((l) => (l ?? []).map((x) => (x.id === e.id ? e : x))), []);
  return { lista, computador, aviso, podePedir, gerar, aplicar, trocar };
}

const NOME_STATUS: Record<Entregavel["status"], string> = {
  pendente: "Na fila",
  convertendo: "Convertendo",
  pronto: "Pronto",
  erro: "Não saiu",
  cancelado: "Cancelado",
  revisar: "A conferir",
};

function tamanho(b: number | null) {
  if (b === null) return null;
  if (b >= 1e9) return `${(b / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.max(1, Math.round(b / 1e3))} KB`;
}

/** O desenho do formato: tela em pé, deitada ou só som (forma em vez de texto). */
export function Forma({ forma }: { forma: Entregavel["forma"] }) {
  return <span className="rl-forma" data-forma={forma} aria-hidden="true" />;
}

function Item({
  e,
  computador,
  podePedir,
  aoTrocar,
  aoAplicar,
}: {
  e: Entregavel;
  computador: Computador | null;
  podePedir: boolean;
  aoTrocar: (e: Entregavel) => void;
  aoAplicar: (lista: Entregavel[], c: Computador | null) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pct = e.status === "convertendo" && e.frac !== null ? Math.round(e.frac * 100) : null;
  const naFilaFechado = e.status === "pendente" && computador?.aberto_agora === false;
  const dica =
    e.status === "pronto" ? `MD5 ${e.arquivo?.md5} conferido no Drive` : e.status === "pendente" && naFilaFechado ? COMPUTADOR_FECHADO : (e.erro ?? undefined);
  return (
    <li className="rl-item" data-status={e.status}>
      <div className="rl-item__linha">
        <Forma forma={e.forma} />
        <span className="rl-item__nome" title={e.arquivo?.nome ?? e.nome}>
          {e.nome}
        </span>
        <span className="rl-chip" data-status={e.status} title={dica}>
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
        ) : e.status === "revisar" && podePedir ? (
          <button
            type="button"
            className="glass-btn glass-btn--sm rl-conferir"
            disabled={ocupado}
            title="Pede de novo a mesma versão: se a fila já tem, ela devolve a que existe (nunca sai duas)."
            onClick={async () => {
              setOcupado(true);
              setErro(null);
              const r = await conferirEntregavelAcao(e.id).catch(() => null);
              setOcupado(false);
              if (r?.ok) aoAplicar(r.entregaveis, r.computador);
              else setErro(r?.mensagem ?? "Não deu para conferir agora.");
            }}
          >
            {ocupado ? "Conferindo…" : "Conferir"}
          </button>
        ) : ANDANDO.has(e.status) && podePedir ? (
          <>
            {naFilaFechado ? (
              <a
                className="rl-acao"
                href={`${RELAY_CONVERTER}?preset=${encodeURIComponent(e.preset)}&de=maestro`}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Converter ${e.nome} no navegador com o Relay`}
                title={NO_NAVEGADOR}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/relay-icone.svg" alt="" width={16} height={16} className="rl-marca" />
              </a>
            ) : null}
            <button
              type="button"
              className="rl-acao"
              aria-label={`Cancelar ${e.nome}`}
              title="Cancelar"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                setErro(null);
                const r = await cancelarEntregavelAcao(e.id).catch(() => null);
                setOcupado(false);
                if (r?.ok) aoTrocar(r.entregavel);
                else setErro(r?.mensagem ?? "Não deu para cancelar agora.");
              }}
            >
              <Icone nome="fechar" size={15} />
            </button>
          </>
        ) : null}
      </div>
      {pct !== null ? (
        <span className="rl-barra" role="progressbar" aria-label={`${e.nome}: ${pct}%`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      {e.status === "pronto" && e.arquivo ? (
        <span className="rl-item__apoio">{[e.arquivo.nome, tamanho(e.arquivo.tamanho), e.pasta?.nome].filter(Boolean).join(" · ")}</span>
      ) : (e.status === "erro" || e.status === "revisar") && e.erro ? (
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
  podePedir,
  aoTrocar,
  aoAplicar,
  rotulo = "Entregáveis",
}: {
  itens: Entregavel[];
  computador: Computador | null;
  aviso: string | null;
  podePedir: boolean;
  aoTrocar: (e: Entregavel) => void;
  aoAplicar: (lista: Entregavel[], c: Computador | null) => void;
  rotulo?: string;
}) {
  if (!itens.length) return null;
  const esperando = itens.some((e) => e.status === "pendente") && computador?.aberto_agora === false;
  return (
    <section className="rl-lista" aria-label={rotulo}>
      <ul>
        {itens.map((e) => (
          <Item key={e.id} e={e} computador={computador} podePedir={podePedir} aoTrocar={aoTrocar} aoAplicar={aoAplicar} />
        ))}
      </ul>
      {esperando ? (
        <p className="rl-lista__nota" role="status">
          <Icone nome="computador" size={14} /> {COMPUTADOR_FECHADO}
        </p>
      ) : null}
      {aviso ? (
        <p className="rl-lista__nota" role="status">
          <Icone nome="alerta" size={14} /> {aviso}
        </p>
      ) : null}
    </section>
  );
}

/** No lugar do botão, para quem tem o SOBEDESCE com app antigo no computador: discreto, sem botão morto. */
export function AvisoAtualizar() {
  return (
    <p className="rl-atualizar" role="note">
      <Icone nome="computador" size={14} /> {MSG_ATUALIZAR}
    </p>
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

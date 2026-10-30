"use client";
/**
 * O cliente no editor do Roteiro (plano da Criação §4.6, fase F7):
 *
 * - `useClienteDoRoteiro`: os comentários do cliente (por bloco e versão) e as decisões, de `GET ?cliente=1`, ao abrir,
 *   ao voltar à aba e a cada 20 s com a aba à vista; resolver/reabrir é otimista e volta se o banco recusar.
 * - `ComentariosDoBloco`: embaixo de cada bloco do editor, o que o cliente disse dele (só os em aberto; o resolvido
 *   fica na folha). Os blocos têm id estável, então o comentário da v2 continua no mesmo trecho da v3.
 * - `BotaoCliente` + `FolhaCliente`: o número em aberto no topo e a folha com a história (decisões e todos os
 *   comentários, "Ir ao trecho", Resolver).
 * - `ParaOCliente`: o corpo da folha "Para o cliente aprovar" (de uma versão salva, pelo link de aprovação do card).
 */
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ClienteDoRoteiro, ComentarioDoRoteiro, EstadoParaCliente } from "@/lib/criacao/roteiro/cliente";
import { resumoDoBloco } from "@/lib/criacao/roteiro/comparar";
import { acharBloco } from "@/lib/criacao/roteiro/editar";
import type { Roteiro } from "@/lib/criacao/roteiro/modelo";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { quando } from "./comum";

const POLL_MS = 20_000;

export type Cliente = {
  dados: ClienteDoRoteiro | null;
  abertos: ComentarioDoRoteiro[];
  porBloco: Map<string, ComentarioDoRoteiro[]>;
  resolver: (id: string, resolvido: boolean) => Promise<string | null>;
  recarregar: () => void;
};

export function useClienteDoRoteiro(url: string): Cliente {
  const [dados, setDados] = useState<ClienteDoRoteiro | null>(null);
  const vez = useRef(0);
  const recarregar = useCallback(() => {
    const minha = ++vez.current;
    void fetch(`${url}?cliente=1`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ClienteDoRoteiro>) : null))
      .then((d) => {
        if (d && minha === vez.current) setDados(d);
      })
      .catch(() => {});
  }, [url]);
  useEffect(() => {
    recarregar();
    const t = setInterval(() => document.visibilityState === "visible" && recarregar(), POLL_MS);
    const ver = () => document.visibilityState === "visible" && recarregar();
    document.addEventListener("visibilitychange", ver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ver);
    };
  }, [recarregar]);

  const resolver = useCallback(
    async (id: string, resolvido: boolean) => {
      const marcar = (v: boolean) => setDados((d) => (d ? { ...d, comentarios: d.comentarios.map((c) => (c.id === id ? { ...c, resolvido: v } : c)) } : d));
      marcar(resolvido);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "resolver", id, resolvido }),
        });
        if (r.ok) return null;
        const j = (await r.json().catch(() => ({}))) as { mensagem?: string };
        marcar(!resolvido);
        return j.mensagem ?? "Não deu para resolver.";
      } catch {
        marcar(!resolvido);
        return "Sem conexão. Tente de novo.";
      }
    },
    [url],
  );

  return useMemo(() => {
    const abertos = (dados?.comentarios ?? []).filter((c) => c.autor === "cliente" && !c.resolvido && !c.pai);
    const porBloco = new Map<string, ComentarioDoRoteiro[]>();
    for (const c of abertos) if (c.bloco) porBloco.set(c.bloco, [...(porBloco.get(c.bloco) ?? []), c]);
    return { dados, abertos, porBloco, resolver, recarregar };
  }, [dados, resolver, recarregar]);
}

type Ctx = { cliente: Cliente; editavel: boolean };
export const ClienteCtx = createContext<Ctx | null>(null);

function Comentario({
  c,
  editavel,
  resolver,
  compacto = false,
}: {
  c: ComentarioDoRoteiro;
  editavel: boolean;
  resolver: Cliente["resolver"];
  compacto?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  return (
    <li className="cr-cli__item" data-resolvido={c.resolvido || undefined} data-compacto={compacto || undefined}>
      <span className="cr-cli__av" aria-hidden="true">
        {c.nome.slice(0, 1).toUpperCase()}
      </span>
      <span className="cr-cli__miolo">
        <span className="cr-cli__quem">
          <b>{c.nome}</b>
          <span className="sutil">
            v{c.n} · {quando(c.em)}
          </span>
        </span>
        <span className="cr-cli__texto">{c.texto}</span>
        {erro ? (
          <span className="sutil" role="alert">
            {erro}
          </span>
        ) : null}
      </span>
      {editavel && c.autor === "cliente" ? (
        <button
          type="button"
          className="cr-icone cr-cli__resolver"
          aria-label={c.resolvido ? "Reabrir" : "Resolver"}
          title={c.resolvido ? "Reabrir" : "Resolver"}
          aria-pressed={c.resolvido}
          onClick={async () => setErro(await resolver(c.id, !c.resolvido))}
        >
          <Icone nome={c.resolvido ? "retorno" : "check"} size={15} />
        </button>
      ) : null}
    </li>
  );
}

/** Embaixo do bloco: o que o cliente disse dele e ainda está em aberto. */
export function ComentariosDoBloco({ bloco }: { bloco: string }) {
  const x = useContext(ClienteCtx);
  const lista = x?.cliente.porBloco.get(bloco);
  if (!x || !lista?.length) return null;
  return (
    <ul className="cr-cli" aria-label="Comentários do cliente">
      {lista.map((c) => (
        <Comentario key={c.id} c={c} editavel={x.editavel} resolver={x.cliente.resolver} compacto />
      ))}
    </ul>
  );
}

/** O número de comentários do cliente em aberto (some sem nada do cliente). */
export function BotaoCliente({ cliente, abrir }: { cliente: Cliente; abrir: () => void }) {
  const d = cliente.dados;
  if (!d || (!d.comentarios.length && !d.decisoes.length)) return null;
  const n = cliente.abertos.length;
  return (
    <button
      type="button"
      className="cr-cli-botao"
      onClick={abrir}
      data-abertos={n || undefined}
      aria-label={n ? `${n} comentário${n > 1 ? "s" : ""} do cliente em aberto` : "Cliente"}
      title="Cliente"
    >
      <Icone nome="balao" size={14} />
      {n ? <span className="num">{n}</span> : <Icone nome="check" size={12} />}
    </button>
  );
}

const NOME_DECISAO = { aprovado: "Aprovado", ajuste: "Ajustes pedidos" } as const;

export function FolhaCliente({
  cliente,
  roteiro,
  editavel,
  irPara,
  aoFechar,
}: {
  cliente: Cliente;
  roteiro: Roteiro;
  editavel: boolean;
  irPara: (bloco: string) => void;
  aoFechar: () => void;
}) {
  const depois = useRef<(() => void) | null>(null);
  return (
    <Folha
      rotulo="Cliente"
      tamanho="acao"
      className="cr-cli-folha"
      aoFechar={() => {
        aoFechar();
        const f = depois.current;
        if (f) setTimeout(f, 40);
      }}
    >
      <h2 className="cr-folha__titulo">Cliente</h2>
      <CorpoCliente cliente={cliente} roteiro={roteiro} editavel={editavel} irPara={(b) => (depois.current = () => irPara(b))} />
    </Folha>
  );
}

function CorpoCliente({ cliente, roteiro, editavel, irPara }: { cliente: Cliente; roteiro: Roteiro; editavel: boolean; irPara: (bloco: string) => void }) {
  const fechar = useFecharFolha();
  const d = cliente.dados;
  if (!d) return <p className="sutil">Abrindo…</p>;
  const raiz = d.comentarios.filter((c) => !c.pai);
  const ordem = [...raiz.filter((c) => !c.resolvido), ...raiz.filter((c) => c.resolvido)];
  const resumo = (bloco: string | null) => {
    if (!bloco) return null;
    const onde = acharBloco(roteiro, bloco);
    if (!onde) return { rotulo: "Trecho que saiu do roteiro", texto: "", existe: false };
    return { ...resumoDoBloco(roteiro, roteiro.cenas[onde.cena].blocos[onde.bloco]), existe: true, cena: onde.cena + 1 };
  };
  return (
    <div className="cr-cli-corpo">
      {d.decisoes.length ? (
        <ul className="cr-cli-decisoes" aria-label="Decisões do cliente">
          {d.decisoes.map((x, i) => (
            <li key={`${x.em}-${i}`} data-decisao={x.decisao}>
              <Icone nome={x.decisao === "aprovado" ? "check" : "editar"} size={14} />
              <span>
                <b>{NOME_DECISAO[x.decisao]}</b> · v{x.n}
                {x.nome ? ` · ${x.nome}` : ""} · {quando(x.em)}
                {x.nota ? <small>“{x.nota}”</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {ordem.length ? (
        <ul className="cr-cli-lista">
          {ordem.map((c) => {
            const r = resumo(c.bloco);
            return (
              <li key={c.id} className="cr-cli-lista__grupo">
                {r ? (
                  <button
                    type="button"
                    className="cr-cli-lista__trecho"
                    disabled={!r.existe}
                    onClick={() => {
                      irPara(c.bloco!);
                      fechar();
                    }}
                  >
                    <span>
                      {"cena" in r ? `Cena ${r.cena} · ` : ""}
                      {r.rotulo}
                    </span>
                    {r.texto ? <span className="sutil">{r.texto}</span> : null}
                  </button>
                ) : null}
                <ul className="cr-cli">
                  <Comentario c={c} editavel={editavel} resolver={cliente.resolver} />
                </ul>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sutil">Nenhum comentário do cliente.</p>
      )}
    </div>
  );
}

// ───────────── "Para o cliente aprovar" ─────────────

type Fase = { k: "lendo" } | { k: "erro"; msg: string } | { k: "pronto"; e: EstadoParaCliente } | { k: "enviado"; url: string; novo: boolean };

export function ParaOCliente({
  url,
  n,
  cards,
  ligar,
  aoEnviar,
}: {
  url: string;
  n: number;
  /** Os cards que o roteiro pode ligar (vazio = quem não edita: só avisa). */
  cards: { id: string; tema: string }[];
  ligar: (cardId: string) => Promise<string | null>;
  aoEnviar: () => void;
}) {
  const [fase, setFase] = useState<Fase>({ k: "lendo" });
  const [indo, setIndo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [card, setCard] = useState("");
  const [cliente, setCliente] = useState("");
  const [copiado, setCopiado] = useState(false);

  const ler = useCallback(async () => {
    try {
      const r = await fetch(`${url}?para-cliente=1`, { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as EstadoParaCliente & { mensagem?: string };
      if (!r.ok) throw new Error(d.mensagem ?? "Não deu para abrir.");
      setFase({ k: "pronto", e: d });
    } catch (e) {
      setFase({ k: "erro", msg: e instanceof Error ? e.message : "Não deu para abrir." });
    }
  }, [url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o card e o lote uma vez, ao abrir
    void ler();
  }, [ler]);

  async function enviar() {
    setIndo(true);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "cliente", n, clienteId: cliente || null }),
      });
      const d = (await r.json().catch(() => ({}))) as { url?: string; novo?: boolean; mensagem?: string };
      if (!r.ok || !d.url) throw new Error(d.mensagem ?? "Não deu para mandar.");
      setFase({ k: "enviado", url: d.url, novo: !!d.novo });
      aoEnviar();
      try {
        await navigator.clipboard.writeText(d.url);
        setCopiado(true);
      } catch {}
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu para mandar.");
    } finally {
      setIndo(false);
    }
  }

  async function ligarCard() {
    if (!card) return;
    setIndo(true);
    setMsg(null);
    const m = await ligar(card);
    setIndo(false);
    if (m) return setMsg(m);
    setFase({ k: "lendo" });
    void ler();
  }

  const erro = msg ? (
    <p className="sutil" role="alert">
      {msg}
    </p>
  ) : null;

  if (fase.k === "lendo")
    return (
      <p className="sutil" role="status">
        Abrindo o card…
      </p>
    );
  if (fase.k === "erro")
    return (
      <p className="sutil" role="alert">
        {fase.msg}
      </p>
    );
  if (fase.k === "enviado")
    return (
      <div className="cr-cliente cr-cliente--feito" aria-live="polite">
        <p className="cr-cliente__feito">
          <Icone nome="check" size={18} /> <b>{fase.novo ? `A v${n} está com o cliente.` : `A v${n} já estava com o cliente.`}</b>
        </p>
        <p className="cr-cliente__link">
          <span className="num">{fase.url.replace(/^https?:\/\//, "")}</span>
        </p>
        <div className="cr-enviar__acoes">
          <button
            type="button"
            className="glass-btn glass-btn--ink"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(fase.url);
                setCopiado(true);
              } catch {
                setMsg("Não deu para copiar. Selecione o link acima.");
              }
            }}
          >
            <Icone nome="copiar" size={16} /> {copiado ? "Copiado" : "Copiar link"}
          </button>
          <a className="glass-btn" href={fase.url} target="_blank" rel="noreferrer noopener">
            <Icone nome="externo" size={16} /> Ver como o cliente
          </a>
        </div>
        {erro}
      </div>
    );

  const e = fase.e;
  if (!e.card)
    return (
      <div className="cr-cliente">
        <p className="cr-enviar__apoio">O cliente aprova pelo link do card. Ligue o roteiro a um.</p>
        {cards.length ? (
          <>
            <label className="cr-cliente__campo">
              <span className="sr-only">Card</span>
              <select value={card} onChange={(x) => setCard(x.target.value)} aria-label="Card">
                <option value="">Escolha o card</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tema}
                  </option>
                ))}
              </select>
            </label>
            <div className="cr-enviar__acoes">
              <button type="button" className="glass-btn glass-btn--ink" disabled={!card || indo} onClick={() => void ligarCard()}>
                <Icone nome="link" size={16} /> Ligar ao card
              </button>
            </div>
          </>
        ) : (
          <p className="sutil">Nenhum card para ligar ainda.</p>
        )}
        {erro}
      </div>
    );

  const jaVai = e.enviada === n;
  const destino = e.lote ? e.lote.titulo : e.cliente ? `um link novo para ${e.cliente.nome}` : null;
  return (
    <div className="cr-cliente">
      <p className="cr-cliente__card">
        <Icone nome="quadro" size={15} /> <b>{e.card.tema}</b>
        {e.enviada ? <span className="sutil"> · com o cliente: v{e.enviada}</span> : null}
      </p>
      <p className="cr-enviar__apoio">{jaVai ? "Esta versão já está no link do card." : destino ? `Vai para ${destino}.` : "Para qual cliente?"}</p>
      {!e.lote && !e.cliente ? (
        <label className="cr-cliente__campo">
          <span className="sr-only">Cliente</span>
          <select value={cliente} onChange={(x) => setCliente(x.target.value)} aria-label="Cliente">
            <option value="">Escolha o cliente</option>
            {e.clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="cr-enviar__acoes">
        <button type="button" className="glass-btn glass-btn--ink" disabled={indo || (!e.lote && !e.cliente && !cliente)} onClick={() => void enviar()}>
          <Icone nome={jaVai ? "copiar" : "aprovacoes"} size={16} /> {indo ? "Mandando…" : jaVai ? "Copiar o link" : `Mandar a v${n}`}
        </button>
        {e.lote ? (
          <Link className="glass-btn" href={`/app/aprovacoes/${e.lote.id}`}>
            Ver o lote
          </Link>
        ) : null}
      </div>
      {erro}
    </div>
  );
}

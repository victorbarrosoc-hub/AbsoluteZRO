"use client";
/**
 * Exportar o Fluxo (plano da Criação §6.2, fase F6): o menu (popover no computador, folha no iPhone), os links de
 * compartilhar (criar, copiar, revogar) e "Mandar para um card". O fluxo é privado: "Copiar para IA", JSON, PDF e o
 * pacote saem sem link; o link só existe quando administração ou gestão cria, e as imagens só vão para a IA por um
 * link vivo sem PIN, quando a pessoa pede ("Imagens pelo link").
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { linkParaIa, OPCOES_DIAS, PIN_LINK, vencimento, type LinkDoFluxo } from "@/lib/criacao/fluxo/compartilhar";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone, type NomeIcone } from "@/components/icones";
import type { CardEscolha } from "./folhas";

const ENDERECO = "/api/criacao/fluxo/links";

/** Copia texto (a API do navegador; sem ela, o jeito antigo). */
export async function copiarTexto(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const a = document.createElement("textarea");
      a.value = t;
      a.setAttribute("readonly", "");
      a.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(a);
      a.select();
      const ok = document.execCommand("copy");
      a.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Baixa um texto como arquivo (o JSON do fluxo). */
export function baixarTexto(nome: string, texto: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Os links vivos do fluxo (só para quem pode criar: administração e gestão). */
export function useLinks(fluxoId: string, ativo: boolean) {
  const [links, setLinks] = useState<LinkDoFluxo[] | null>(ativo ? null : []);
  const carregar = useCallback(async () => {
    if (!ativo) return;
    try {
      const r = await fetch(`${ENDERECO}?fluxo=${encodeURIComponent(fluxoId)}`, { cache: "no-store" });
      if (r.ok) setLinks(((await r.json()) as { links: LinkDoFluxo[] }).links);
      else setLinks((l) => l ?? []);
    } catch {
      setLinks((l) => l ?? []);
    }
  }, [fluxoId, ativo]);
  useEffect(() => {
    // primeira leitura ao abrir o fluxo (depois, só ao criar e revogar)
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const criar = useCallback(
    async (dias: number, pin: string): Promise<{ link: LinkDoFluxo } | { mensagem: string }> => {
      try {
        const r = await fetch(ENDERECO, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "criar", fluxo: fluxoId, dias, pin: pin || null }),
        });
        const c = (await r.json().catch(() => ({}))) as { link?: LinkDoFluxo; mensagem?: string };
        if (!r.ok || !c.link) return { mensagem: c.mensagem ?? "Não deu para criar o link." };
        setLinks((l) => [c.link!, ...(l ?? [])]);
        return { link: c.link };
      } catch {
        return { mensagem: "Sem conexão. Tente de novo." };
      }
    },
    [fluxoId],
  );

  const revogar = useCallback(async (id: string): Promise<string | null> => {
    try {
      const r = await fetch(ENDERECO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "revogar", id }) });
      if (!r.ok) return ((await r.json().catch(() => ({}))) as { mensagem?: string }).mensagem ?? "Não deu para revogar.";
      setLinks((l) => (l ?? []).filter((x) => x.id !== id));
      return null;
    } catch {
      return "Sem conexão. Tente de novo.";
    }
  }, []);

  return { links, carregar, criar, revogar };
}

/* ───────────── o menu ───────────── */

export type AcaoExportar = "ia" | "link" | "links" | "card" | "pacote" | "json" | "pdf";

type Item = { a: AcaoExportar; nome: string; dica: string; icone: NomeIcone; desligado?: string; grupo: 1 | 2 };

export type MenuExportarProps = {
  podeEnviar: boolean;
  podeEditar: boolean;
  naLixeira: boolean;
  temImagens: boolean;
  links: LinkDoFluxo[] | null;
  incluirImagens: boolean;
  setIncluirImagens: (v: boolean) => void;
  aoEscolher: (a: AcaoExportar) => void;
};

function itens(p: MenuExportarProps): Item[] {
  const vivos = p.links?.length ?? 0;
  return [
    { a: "ia", nome: "Copiar para IA", dica: "Markdown", icone: "copiar", grupo: 1 },
    vivos
      ? { a: "links", nome: "Links", dica: vivos === 1 ? "1 ativo" : `${vivos} ativos`, icone: "link", grupo: 1 }
      : {
          a: "link",
          nome: "Criar link",
          dica: "7 dias · revogável",
          icone: "link",
          grupo: 1,
          desligado: !p.podeEnviar ? "Só administração e gestão criam links." : p.naLixeira ? "Tire o fluxo da lixeira antes." : undefined,
        },
    {
      a: "card",
      nome: "Mandar para um card",
      dica: "Quadro",
      icone: "quadro",
      grupo: 1,
      desligado: !p.podeEditar ? "Seu papel só lê." : undefined,
    },
    { a: "pacote", nome: "Baixar pacote", dica: ".md + imagens", icone: "baixar", grupo: 2 },
    { a: "json", nome: "JSON", dica: "maestro.fluxo/1", icone: "documento", grupo: 2 },
    { a: "pdf", nome: "PDF", dica: "imprimir", icone: "imprimir", grupo: 2 },
  ];
}

/** As linhas do menu (as mesmas no popover e na folha). */
function Linhas(p: MenuExportarProps & { depois?: () => void }) {
  const lista = itens(p);
  const linkIa = p.links ? linkParaIa(p.links, new Date()) : null;
  const botao = (i: Item) => (
    <button
      key={i.a}
      type="button"
      role="menuitem"
      className="fx-exp__item"
      disabled={!!i.desligado}
      title={i.desligado}
      onClick={() => {
        p.aoEscolher(i.a);
        p.depois?.();
      }}
    >
      <Icone nome={i.icone} size={17} />
      <span className="fx-exp__nome">{i.nome}</span>
      <span className="fx-exp__dica">{i.desligado ? "" : i.dica}</span>
    </button>
  );
  return (
    <>
      {botao(lista[0])}
      {p.temImagens && linkIa ? (
        <label className="fx-exp__opcao" title="As imagens vão pelo endereço do link mais novo sem PIN.">
          <input type="checkbox" checked={p.incluirImagens} onChange={(e) => p.setIncluirImagens(e.currentTarget.checked)} />
          <span>Imagens pelo link</span>
        </label>
      ) : null}
      {lista
        .slice(1)
        .filter((i) => i.grupo === 1)
        .map(botao)}
      <hr className="fx-exp__linha" />
      {lista.filter((i) => i.grupo === 2).map(botao)}
      <p className="fx-exp__nota">Ninguém de fora vê sem um link. O link não aparece em buscadores.</p>
    </>
  );
}

/** Computador: o popover sob "Exportar". */
export function PopoverExportar(p: MenuExportarProps & { fechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && p.fechar();
    const fora = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".fx-exp")) p.fechar();
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("pointerdown", fora);
    };
  }, [p]);
  return (
    <div className="fx-exp__painel" role="menu" aria-label="Exportar">
      <Linhas {...p} depois={p.fechar} />
    </div>
  );
}

function LinhasNaFolha(p: MenuExportarProps) {
  const fechar = useFecharFolha();
  return (
    <div className="fx-folha fx-exp fx-exp--folha" role="menu" aria-label="Exportar">
      <h2 className="fx-folha__titulo fx-folha__titulo--esq">Exportar</h2>
      <Linhas
        {...p}
        aoEscolher={(a) => {
          fechar();
          // copiar e baixar na hora (o Safari só deixa copiar dentro do toque); abrir outra folha ou imprimir, depois
          // que esta fecha (ela devolve o foco a quem abriu)
          if (a === "ia" || a === "json" || a === "pacote") p.aoEscolher(a);
          else setTimeout(() => p.aoEscolher(a), 240);
        }}
      />
    </div>
  );
}

/** iPhone: a folha com as mesmas linhas. */
export function FolhaExportar(p: MenuExportarProps & { aoFechar: () => void }) {
  return (
    <Folha rotulo="Exportar" aoFechar={p.aoFechar} tamanho="acao">
      <LinhasNaFolha {...p} />
    </Folha>
  );
}

/* ───────────── links ───────────── */

const quando = (iso: string | null) => {
  if (!iso) return null;
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 2) return "visto agora";
  if (min < 60) return `visto há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `visto há ${h} h`;
  return `visto há ${Math.round(h / 24)} d`;
};

function LinhaLink({ l, avisar, revogar }: { l: LinkDoFluxo; avisar: (t: string, tom?: "erro") => void; revogar: (id: string) => Promise<string | null> }) {
  const [confirmar, setConfirmar] = useState(false);
  const [indo, setIndo] = useState(false);
  const detalhes = [l.temPin ? "PIN" : null, l.visitas === 1 ? "1 visita" : `${l.visitas} visitas`, quando(l.vistoEm)].filter(Boolean).join(" · ");
  return (
    <li className="fx-links__item" data-link={l.id}>
      <span className="fx-links__icone" aria-hidden="true">
        <Icone nome={l.temPin ? "cadeado" : "link"} size={16} />
      </span>
      <span className="fx-folha__miolo">
        <strong>{vencimento(l.expira, new Date())}</strong>
        <small>{detalhes}</small>
      </span>
      {confirmar ? (
        <span className="fx-links__acoes">
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => setConfirmar(false)}>
            Manter
          </button>
          <button
            type="button"
            className="glass-btn glass-btn--sm fx-folha__apagar"
            disabled={indo}
            onClick={async () => {
              setIndo(true);
              const e = await revogar(l.id);
              setIndo(false);
              if (e) avisar(e, "erro");
              else avisar("Link revogado. Quem abrir agora não vê mais nada.");
            }}
          >
            Revogar
          </button>
        </span>
      ) : (
        <span className="fx-links__acoes">
          <button
            type="button"
            className="fx-redondo"
            aria-label="Copiar link"
            title="Copiar link"
            disabled={!l.url}
            onClick={async () => avisar((await copiarTexto(l.url!)) ? "Link copiado." : "Não deu para copiar.", undefined)}
          >
            <Icone nome="copiar" size={16} />
          </button>
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => setConfirmar(true)}>
            Revogar
          </button>
        </span>
      )}
    </li>
  );
}

function CriarLink({
  criar,
  avisar,
}: {
  criar: (dias: number, pin: string) => Promise<{ link: LinkDoFluxo } | { mensagem: string }>;
  avisar: (t: string, tom?: "erro") => void;
}) {
  const [dias, setDias] = useState<number>(7);
  const [pin, setPin] = useState("");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState<LinkDoFluxo | null>(null);
  const pinOk = !pin || PIN_LINK.test(pin);
  if (novo?.url)
    return (
      <div className="fx-links__novo" role="status">
        <span className="fx-links__selo" aria-hidden="true">
          <Icone nome="check" size={18} />
        </span>
        <p>Link criado{novo.temPin ? ", com PIN" : ""}.</p>
        <input className="fx-links__url" readOnly value={novo.url} aria-label="Endereço do link" onFocus={(e) => e.currentTarget.select()} />
        <div className="fx-folha__acoes">
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => setNovo(null)}>
            Outro link
          </button>
          <button
            type="button"
            className="glass-btn glass-btn--sm glass-btn--ink"
            onClick={async () => avisar((await copiarTexto(novo.url!)) ? "Link copiado." : "Não deu para copiar.")}
          >
            <Icone nome="copiar" size={15} /> Copiar
          </button>
        </div>
      </div>
    );
  return (
    <form
      className="fx-links__form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pinOk) return;
        setIndo(true);
        setErro(null);
        const r = await criar(dias, pin);
        setIndo(false);
        if ("mensagem" in r) return setErro(r.mensagem);
        setPin("");
        setNovo(r.link);
        if (r.link.url && (await copiarTexto(r.link.url))) avisar("Link criado e copiado.");
      }}
    >
      <div className="fx-seg fx-seg--cheio" role="radiogroup" aria-label="Validade">
        {OPCOES_DIAS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={dias === d} onClick={() => setDias(d)}>
            {d === 1 ? "1 dia" : `${d} dias`}
          </button>
        ))}
      </div>
      <label className="fx-folha__campo">
        <span>PIN (opcional)</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, ""))}
          placeholder="4 a 8 números"
          aria-invalid={!pinOk || undefined}
        />
      </label>
      {erro ? (
        <p className="fx-folha__previa" data-erro role="alert">
          {erro}
        </p>
      ) : null}
      <div className="fx-folha__acoes">
        <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={indo || !pinOk}>
          {indo ? "Criando…" : "Criar link"}
        </button>
      </div>
    </form>
  );
}

/** Os links do fluxo: os ativos (copiar, revogar) e criar outro. */
export function FolhaLinks(p: {
  aoFechar: () => void;
  links: LinkDoFluxo[] | null;
  criar: (dias: number, pin: string) => Promise<{ link: LinkDoFluxo } | { mensagem: string }>;
  revogar: (id: string) => Promise<string | null>;
  avisar: (t: string, tom?: "erro") => void;
  naLixeira: boolean;
}) {
  const vivos = useMemo(() => p.links ?? [], [p.links]);
  return (
    <Folha rotulo="Links do fluxo" aoFechar={p.aoFechar} tamanho="acao">
      <div className="fx-folha fx-links">
        <h2 className="fx-folha__titulo fx-folha__titulo--esq">Link</h2>
        <p className="fx-folha__apoio">Ninguém de fora vê sem um link. O link não aparece em buscadores.</p>
        {vivos.length ? (
          <ul className="fx-links__lista" aria-label="Links ativos">
            {vivos.map((l) => (
              <LinhaLink key={l.id} l={l} avisar={p.avisar} revogar={p.revogar} />
            ))}
          </ul>
        ) : null}
        {p.naLixeira ? <p className="fx-folha__nada">Tire o fluxo da lixeira para criar um link.</p> : <CriarLink criar={p.criar} avisar={p.avisar} />}
      </div>
    </Folha>
  );
}

/* ───────────── mandar para um card ───────────── */

function EscolherCard({
  cards,
  atual,
  aoEscolher,
}: {
  cards: CardEscolha[];
  atual: { id: string; titulo: string | null } | null;
  aoEscolher: (c: CardEscolha | null) => void;
}) {
  const fechar = useFecharFolha();
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  const cs = cards.filter((c) => c.id !== atual?.id && (!q || c.titulo.toLocaleLowerCase("pt-BR").includes(q) || c.id.toLowerCase().includes(q))).slice(0, 60);
  const escolher = (c: CardEscolha | null) => {
    aoEscolher(c);
    fechar();
  };
  let conteudo: ReactNode;
  if (cs.length)
    conteudo = cs.map((c) => (
      <li key={c.id}>
        <button type="button" onClick={() => escolher(c)}>
          <span className="fx-ref__letra" data-tipo="card" aria-hidden="true">
            C
          </span>
          <span className="fx-folha__miolo">
            <strong>{c.titulo || "Card sem título"}</strong>
            <small>{c.coluna ?? "Card"}</small>
          </span>
        </button>
      </li>
    ));
  else conteudo = <li className="fx-folha__nada">{q ? "Nenhum card com esse nome." : "Nenhum card ainda."}</li>;
  return (
    <div className="fx-folha">
      <h2 className="fx-folha__titulo fx-folha__titulo--esq">Mandar para um card</h2>
      <p className="fx-folha__apoio">O card mostra este fluxo na ficha.</p>
      {atual ? (
        <div className="fx-card-atual">
          <Icone nome="check" size={16} />
          <span className="fx-folha__miolo">
            <strong>{atual.titulo || "Card"}</strong>
            <small>Neste card agora</small>
          </span>
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => escolher(null)}>
            Tirar
          </button>
        </div>
      ) : null}
      <label className="fx-folha__campo fx-folha__campo--busca">
        <Icone nome="busca" size={16} />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar card" aria-label="Buscar card" />
      </label>
      <ul className="fx-folha__lista">{conteudo}</ul>
    </div>
  );
}

export function FolhaCard(p: {
  aoFechar: () => void;
  cards: CardEscolha[];
  atual: { id: string; titulo: string | null } | null;
  aoEscolher: (c: CardEscolha | null) => void;
}) {
  return (
    <Folha rotulo="Mandar para um card" aoFechar={p.aoFechar} tamanho="acao">
      <EscolherCard cards={p.cards} atual={p.atual} aoEscolher={p.aoEscolher} />
    </Folha>
  );
}

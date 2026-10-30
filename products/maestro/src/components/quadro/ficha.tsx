"use client";
/**
 * A ficha do card: tudo o que se edita, um campo por vez (cada mudança grava só aquele campo, com a versão que a
 * pessoa viu). No modo "novo" é um rascunho que vira card em "Criar card" (Enter no título; ⌘/Ctrl + Enter no
 * briefing). Leitura vê tudo, sem editar. Abre na folha do Maestro (components/folha.tsx).
 *
 * Forma (plano v2 §9): título grande; a coluna como pílulas com a cor de cada uma; responsável, cliente e projeto como
 * listas do sistema com o avatar ou a sigla de quem está escolhido; o prazo como pílula amigável ("amanhã", "sexta")
 * com atalhos e o seletor de data do sistema por baixo; o briefing cresce com o texto.
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  LIMITE_BRIEFING,
  LIMITE_TEMA,
  PRIORIDADES,
  hoje,
  proximoPasso,
  rotuloDia,
  somaDias,
  type CampoEditavel,
  type CardQ,
  type ColunaId,
  type DadosCard,
} from "@/lib/quadro/metodo";
import { nomeDaColuna, type Coluna } from "@/lib/quadro/colunas";
import type { Referencias } from "@/lib/quadro/servidor";
import { Icone } from "@/components/icones";
import { Folha, useFecharFolha } from "@/components/folha";
import { AvatarPessoa, iniciaisDe } from "./pecas";
import { VersoesDoCard } from "./versoes";
import { CriacaoDoCard } from "@/components/criacao/do-card";

type Props = {
  card: CardQ | null;
  /** Coluna e cliente iniciais do rascunho (modo novo). */
  novo: { coluna: ColunaId; cliente?: string; projeto?: string } | null;
  refs: Referencias;
  /** As colunas vivas da produtora, na ordem do Quadro (nome e cor de cada uma). */
  colunas: Coluna[];
  podeEscrever: boolean;
  focar?: string | null;
  mudar: (id: string, campos: Partial<Record<CampoEditavel, unknown>>) => Promise<boolean>;
  criar: (dados: Partial<DadosCard> & { tema: string }) => Promise<string | null>;
  apagar: (id: string) => void;
  fechar: () => void;
  /** O card nasceu: o Quadro o leva da folha até a coluna (a origem é o título da folha). */
  aoCriar: (id: string, origem: DOMRect | null, coluna: ColunaId) => void;
};

/** Texto que grava ao sair do campo; o que chega do banco só entra quando a pessoa não está digitando ali. */
function CampoTexto({
  valor,
  aoSalvar,
  multilinha,
  titulo,
  limite,
  ...resto
}: { valor: string; aoSalvar: (v: string) => void; multilinha?: boolean; titulo?: boolean; limite: number } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onBlur" | "value"
>) {
  const [v, setV] = useState(valor);
  const [focado, setFocado] = useState(false);
  const [visto, setVisto] = useState(valor);
  if (!focado && valor !== visto) {
    setVisto(valor);
    setV(valor);
  }
  const props = {
    value: v,
    maxLength: limite,
    onFocus: () => setFocado(true),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.currentTarget.value),
    onBlur: () => {
      setFocado(false);
      if (v !== valor) aoSalvar(v);
    },
  };
  // o título quebra a linha em vez de cortar (celular); Enter termina, não pula linha
  if (titulo)
    return (
      <textarea
        {...(resto as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        {...props}
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
    );
  if (multilinha)
    return (
      <textarea
        {...(resto as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        {...props}
        rows={3}
        onKeyDown={(e) => {
          // ⌘/Ctrl + Enter: termina o briefing (grava ao sair do campo)
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
        }}
      />
    );
  return <input {...resto} {...props} />;
}

/** Uma lista do sistema com a marca do escolhido à esquerda (avatar, sigla ou ponto). */
function Lista({ rotulo, marca, children, ...resto }: { rotulo: string; marca: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="q-campo q-lista">
      <span>{rotulo}</span>
      <span className="q-lista__caixa">
        <span className="q-lista__marca" aria-hidden="true">
          {marca}
        </span>
        <select {...resto}>{children}</select>
      </span>
    </label>
  );
}

/** Sem `field-sizing: content` (Firefox, Safari antigo), o texto cresce pela altura medida. */
function crescer(el: EventTarget | null) {
  if (!(el instanceof HTMLTextAreaElement) || CSS.supports("field-sizing", "content")) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function Sigla({ texto, vazio }: { texto: string; vazio?: boolean }) {
  return <span className={`q-sigla${vazio ? " q-sigla--vazia" : ""}`}>{vazio ? <Icone nome="mais" size={11} /> : texto}</span>;
}

/** O prazo: a pílula amigável abre o seletor de data do sistema (o campo de verdade fica por baixo); atalhos ao lado. */
function Prazo({ id, valor, aoMudar, ro }: { id: string; valor: string; aoMudar: (v: string | null) => void; ro: boolean }) {
  const campo = useRef<HTMLInputElement>(null);
  const h = hoje();
  const rotulo = valor ? rotuloDia(valor) : "Sem prazo";
  const atalhos: [string, string][] = [
    ["Hoje", h],
    ["Amanhã", somaDias(h, 1)],
    ["+1 sem.", somaDias(h, 7)],
  ];
  return (
    <div className="q-campo">
      <span id={id}>Prazo de entrega</span>
      <div className="q-prazo">
        <label className={`q-prazo__pilula${valor ? " on" : ""}`} data-atrasado={(valor && valor < h) || undefined}>
          <Icone nome="agenda" size={15} />
          <span className="q-prazo__texto">{rotulo}</span>
          <input
            ref={campo}
            type="date"
            data-campo="prazo"
            className="q-prazo__nativo"
            aria-labelledby={id}
            value={valor}
            readOnly={ro}
            onClick={(e) => {
              try {
                (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {}
            }}
            onChange={(e) => aoMudar(e.currentTarget.value || null)}
          />
        </label>
        {!ro ? (
          <div className="q-prazo__atalhos">
            {atalhos.map(([n, d]) => (
              <button key={n} type="button" aria-pressed={valor === d} onClick={() => aoMudar(valor === d ? null : d)}>
                {n}
              </button>
            ))}
            {valor ? (
              <button type="button" className="q-prazo__limpar" aria-label="Tirar o prazo" onClick={() => aoMudar(null)}>
                <Icone nome="fechar" size={12} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Ficha(props: Props) {
  const rotulo = props.card ? `Card: ${props.card.dados.tema}` : "Novo card";
  return (
    <Folha rotulo={rotulo} aoFechar={props.fechar} veuClasse="q-veu--ficha" className="q-ficha">
      <Conteudo {...props} />
    </Folha>
  );
}

function Conteudo({ card, novo, refs, colunas, podeEscrever, focar, mudar, criar, apagar, aoCriar }: Props) {
  const fechar = useFecharFolha();
  const idBase = useId();
  const caixa = useRef<HTMLFormElement>(null);
  const [rascunho, setRascunho] = useState<Partial<DadosCard>>(() => ({
    coluna: novo?.coluna ?? "pauta",
    cliente: novo?.cliente,
    projeto: novo?.projeto,
    prioridade: "normal",
  }));
  const [criando, setCriando] = useState(false);
  const [erroTema, setErroTema] = useState(false);
  const d: Partial<DadosCard> = card ? card.dados : rascunho;
  const ro = !podeEscrever;

  useEffect(() => {
    const el = focar ? caixa.current?.querySelector<HTMLElement>(`[data-campo="${focar}"]`) : caixa.current?.querySelector<HTMLElement>("[data-campo='tema']");
    el?.focus({ preventScroll: true });
    caixa.current?.querySelectorAll("textarea").forEach(crescer);
  }, [focar]);

  /** Muda um ou mais campos: no card, grava; no rascunho, só guarda. */
  const por = (campos: Partial<Record<CampoEditavel, unknown>>) => {
    if (ro) return;
    if (card) void mudar(card.id, campos);
    else setRascunho((r) => ({ ...r, ...(campos as Partial<DadosCard>) }));
  };
  const valorOuNulo = (v: string) => (v ? v : null);

  const projetosDoCliente = refs.projetos.filter((p) => !d.cliente || !p.cliente || p.cliente === d.cliente);
  const projetoAtual = d.projeto ? refs.projetos.find((p) => p.id === d.projeto) : null;
  const clienteAtual = d.cliente ? refs.clientes.find((c) => c.id === d.cliente) : null;
  const respAtual = d.resp ? (refs.pessoas.find((p) => p.sub === d.resp) ?? null) : null;
  const trocarCliente = (cliente: string) => {
    const campos: Partial<Record<CampoEditavel, unknown>> = { cliente: valorOuNulo(cliente) };
    // projeto de outro cliente sai junto (um card não fica com cliente e projeto que não combinam)
    if (projetoAtual?.cliente && cliente && projetoAtual.cliente !== cliente) campos.projeto = null;
    por(campos);
  };
  const trocarProjeto = (projeto: string) => {
    const p = refs.projetos.find((x) => x.id === projeto);
    const campos: Partial<Record<CampoEditavel, unknown>> = { projeto: valorOuNulo(projeto) };
    if (p?.cliente && !d.cliente) campos.cliente = p.cliente;
    por(campos);
  };

  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    if (card) {
      // na ficha de um card, Enter só termina o campo (ele grava ao sair)
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    if (criando) return;
    const tema = (rascunho.tema ?? "").replace(/\s+/g, " ").trim();
    if (!tema) {
      setErroTema(true);
      caixa.current?.querySelector<HTMLElement>("[data-campo='tema']")?.focus();
      return;
    }
    setCriando(true);
    const origem = caixa.current?.querySelector<HTMLElement>("[data-campo='tema']")?.getBoundingClientRect() ?? null;
    const id = await criar({ ...rascunho, tema });
    setCriando(false);
    if (id) aoCriar(id, origem, rascunho.coluna ?? "pauta");
  }

  const passo = card ? proximoPasso(card.dados) : null;
  const campo = (nome: string) => `${idBase}-${nome}`;
  const colunaAtual: ColunaId = d.coluna ?? "pauta";
  const corAtual = colunas.find((c) => c.id === colunaAtual)?.cor;

  return (
    <form
      ref={caixa}
      className="q-ficha__corpo"
      onSubmit={enviar}
      onInput={(e) => crescer(e.target)}
      onKeyDown={(e) => {
        if (!card && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void enviar();
        }
      }}
    >
      <div className="q-ficha__topo">
        <span className="q-ficha__coluna" data-col={colunaAtual} data-cor={corAtual}>
          <i className="q-ponto" aria-hidden="true" />
          {card ? nomeDaColuna(colunas, colunaAtual) : "Novo card"}
        </span>
        <button type="button" className="q-icone-btn q-ficha__fechar" onClick={fechar} aria-label="Fechar">
          <Icone nome="fechar" size={18} />
        </button>
      </div>

      <label className="sr-only" htmlFor={campo("tema")}>
        Título
      </label>
      {card ? (
        <CampoTexto
          id={campo("tema")}
          data-campo="tema"
          titulo
          className="q-ficha__tema"
          placeholder="Título do card"
          valor={card.dados.tema}
          limite={LIMITE_TEMA}
          readOnly={ro}
          aoSalvar={(v) => {
            const t = v.replace(/\s+/g, " ").trim();
            if (t) por({ tema: t });
          }}
        />
      ) : (
        <textarea
          id={campo("tema")}
          data-campo="tema"
          className={`q-ficha__tema${erroTema ? " q-campo--erro" : ""}`}
          placeholder="O que vamos fazer?"
          maxLength={LIMITE_TEMA}
          rows={1}
          autoComplete="off"
          enterKeyHint="done"
          value={rascunho.tema ?? ""}
          aria-invalid={erroTema || undefined}
          onKeyDown={(e) => {
            // Enter cria o card (o título é uma linha só; quebra de linha não entra)
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void enviar();
            }
          }}
          onChange={(e) => {
            const tema = e.currentTarget.value.replace(/\n/g, " ");
            setErroTema(false);
            setRascunho((r) => ({ ...r, tema }));
          }}
        />
      )}

      {card && passo && podeEscrever ? (
        <div className="q-ficha__passo">
          {[passo.principal, passo.outro].filter(Boolean).map((p, i) =>
            p!.acao === "mover" ? (
              <button
                key={p!.rotulo}
                type="button"
                className={`glass-btn glass-btn--sm${i === 0 ? " glass-btn--ink" : ""}`}
                onClick={() => por({ coluna: p!.para })}
              >
                {p!.rotulo}
                {i === 0 ? <Icone nome="seta" size={14} /> : null}
              </button>
            ) : (
              <button
                key={p!.rotulo}
                type="button"
                className="glass-btn glass-btn--sm glass-btn--ink"
                onClick={() => caixa.current?.querySelector<HTMLElement>("[data-campo='resp']")?.focus()}
              >
                {p!.rotulo}
              </button>
            ),
          )}
        </div>
      ) : null}

      <div className="q-campo" role="radiogroup" aria-labelledby={campo("coluna")}>
        <span id={campo("coluna")}>Coluna</span>
        <div className="q-pilulas" data-campo="coluna" tabIndex={-1}>
          {colunas.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              data-col={c.id}
              data-cor={c.cor}
              aria-checked={colunaAtual === c.id}
              disabled={ro}
              onClick={() => colunaAtual !== c.id && por({ coluna: c.id })}
            >
              <i className="q-ponto" aria-hidden="true" />
              {c.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="q-ficha__grade">
        <Lista
          rotulo="Responsável"
          marca={respAtual ? <AvatarPessoa pessoa={respAtual} tamanho={24} /> : <Sigla texto="" vazio />}
          data-campo="resp"
          value={d.resp ?? ""}
          disabled={ro}
          onChange={(e) => por({ resp: valorOuNulo(e.currentTarget.value) })}
        >
          <option value="">Ninguém ainda</option>
          {refs.pessoas.map((p) => (
            <option key={p.sub} value={p.sub}>
              {p.nome}
            </option>
          ))}
        </Lista>
        <div className="q-campo" role="radiogroup" aria-labelledby={campo("prio")}>
          <span id={campo("prio")}>Prioridade</span>
          <div className="q-segmentos" data-prio={d.prioridade ?? "normal"}>
            {PRIORIDADES.map((p) => (
              <button
                key={p.k}
                type="button"
                role="radio"
                data-prio={p.k}
                aria-checked={(d.prioridade ?? "normal") === p.k}
                disabled={ro}
                onClick={() => por({ prioridade: p.k === "normal" ? null : p.k })}
              >
                {p.k === "alta" ? <Icone nome="bandeira" size={12} /> : null}
                {p.nome}
              </button>
            ))}
          </div>
        </div>
        <Lista
          rotulo="Cliente"
          marca={<Sigla texto={iniciaisDe(clienteAtual?.nome)} vazio={!clienteAtual} />}
          data-campo="cliente"
          value={d.cliente ?? ""}
          disabled={ro}
          onChange={(e) => trocarCliente(e.currentTarget.value)}
        >
          <option value="">Sem cliente</option>
          {refs.clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Lista>
        <Lista
          rotulo="Projeto"
          marca={projetoAtual ? <span className="q-sigla q-sigla--codigo">{projetoAtual.codigo.slice(-3)}</span> : <Sigla texto="" vazio />}
          data-campo="projeto"
          value={d.projeto ?? ""}
          disabled={ro}
          onChange={(e) => trocarProjeto(e.currentTarget.value)}
        >
          <option value="">Sem projeto</option>
          {projetosDoCliente.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} · {p.titulo}
            </option>
          ))}
        </Lista>
      </div>

      <Prazo id={campo("prazo")} valor={d.prazo ?? ""} ro={ro} aoMudar={(v) => por({ prazo: v })} />

      <label className="q-campo">
        <span>Briefing</span>
        {card ? (
          <CampoTexto
            multilinha
            data-campo="briefing"
            className="q-briefing"
            placeholder="O que é, para quem, referências."
            valor={d.briefing ?? ""}
            limite={LIMITE_BRIEFING}
            readOnly={ro}
            aoSalvar={(v) => por({ briefing: v.trim() ? v : null })}
          />
        ) : (
          <textarea
            data-campo="briefing"
            className="q-briefing"
            rows={3}
            placeholder="O que é, para quem, referências."
            maxLength={LIMITE_BRIEFING}
            value={rascunho.briefing ?? ""}
            onChange={(e) => {
              const briefing = e.currentTarget.value;
              setRascunho((r) => ({ ...r, briefing: briefing.trim() ? briefing : undefined }));
            }}
          />
        )}
      </label>

      {card ? <VersoesDoCard key={card.id} card={card.id} podeEscrever={podeEscrever} /> : null}
      {card ? <CriacaoDoCard key={`cr-${card.id}`} card={card.id} podeEscrever={podeEscrever} /> : null}

      {card && (card.dados.cliente || card.dados.projeto) ? (
        <div className="q-ficha__links">
          {card.dados.cliente ? (
            <Link href={`/app/clientes/${card.dados.cliente}`}>
              <Icone nome="clientes" size={14} /> Ficha do cliente
            </Link>
          ) : null}
          {card.dados.projeto ? (
            <Link href={`/app/projetos/${card.dados.projeto}`}>
              <Icone nome="projetos" size={14} /> {projetoAtual?.codigo ?? "Projeto"}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="q-ficha__fim">
        {card ? (
          podeEscrever ? (
            <button type="button" className="q-perigo" onClick={() => apagar(card.id)}>
              <Icone nome="lixo" size={16} /> Apagar
            </button>
          ) : (
            <span className="sutil">Só leitura</span>
          )
        ) : (
          <>
            <span className="q-ficha__dica" aria-hidden="true">
              <kbd>⏎</kbd> cria
            </span>
            <button type="button" className="glass-btn glass-btn--sm" onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={criando}>
              {criando ? "Criando…" : "Criar card"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

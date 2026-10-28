"use client";
/**
 * A ficha do card: tudo o que se edita, um campo por vez (cada mudança grava só aquele campo, com a versão que a
 * pessoa viu). No modo "novo" é um rascunho que vira card em "Criar card". Leitura vê tudo, sem editar.
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  COLUNA,
  COLUNAS,
  LIMITE_BRIEFING,
  LIMITE_TEMA,
  PRIORIDADES,
  proximoPasso,
  type CampoEditavel,
  type CardQ,
  type ColunaKey,
  type DadosCard,
} from "@/lib/quadro/metodo";
import type { Referencias } from "@/lib/quadro/servidor";
import { Icone } from "@/components/icones";

type Props = {
  card: CardQ | null;
  /** Coluna e cliente iniciais do rascunho (modo novo). */
  novo: { coluna: ColunaKey; cliente?: string; projeto?: string } | null;
  refs: Referencias;
  podeEscrever: boolean;
  focar?: string | null;
  mudar: (id: string, campos: Partial<Record<CampoEditavel, unknown>>) => Promise<boolean>;
  criar: (dados: Partial<DadosCard> & { tema: string }) => Promise<string | null>;
  apagar: (id: string) => void;
  fechar: () => void;
  aoCriar: (id: string) => void;
};

/** Texto que grava ao sair do campo; o que chega do banco só entra quando a pessoa não está digitando ali. */
function CampoTexto({
  valor,
  aoSalvar,
  multilinha,
  limite,
  ...resto
}: { valor: string; aoSalvar: (v: string) => void; multilinha?: boolean; limite: number } & Omit<
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
  if (multilinha) return <textarea {...(resto as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} {...props} rows={5} />;
  return <input {...resto} {...props} />;
}

export function Ficha({ card, novo, refs, podeEscrever, focar, mudar, criar, apagar, fechar, aoCriar }: Props) {
  const idBase = useId();
  const caixa = useRef<HTMLDivElement>(null);
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
    el?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [focar, fechar]);

  /** Muda um ou mais campos: no card, grava; no rascunho, só guarda. */
  const por = (campos: Partial<Record<CampoEditavel, unknown>>) => {
    if (ro) return;
    if (card) void mudar(card.id, campos);
    else setRascunho((r) => ({ ...r, ...(campos as Partial<DadosCard>) }));
  };
  const valorOuNulo = (v: string) => (v ? v : null);

  const projetosDoCliente = refs.projetos.filter((p) => !d.cliente || !p.cliente || p.cliente === d.cliente);
  const projetoAtual = d.projeto ? refs.projetos.find((p) => p.id === d.projeto) : null;
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

  async function enviarNovo(e: React.FormEvent) {
    e.preventDefault();
    const tema = (rascunho.tema ?? "").replace(/\s+/g, " ").trim();
    if (!tema) {
      setErroTema(true);
      caixa.current?.querySelector<HTMLElement>("[data-campo='tema']")?.focus();
      return;
    }
    setCriando(true);
    const id = await criar({ ...rascunho, tema });
    setCriando(false);
    if (id) aoCriar(id);
  }

  const passo = card ? proximoPasso(card.dados) : null;
  const campo = (nome: string) => `${idBase}-${nome}`;

  return (
    <div className="q-veu q-veu--ficha" onClick={fechar}>
      <div
        ref={caixa}
        className="q-ficha"
        role="dialog"
        aria-modal="true"
        aria-label={card ? `Card: ${card.dados.tema}` : "Novo card"}
        onClick={(e) => e.stopPropagation()}
      >
        <form className="q-ficha__corpo" onSubmit={enviarNovo}>
          <div className="q-ficha__topo">
            <span className="q-ficha__coluna">{COLUNA[(d.coluna as ColunaKey) ?? "pauta"]?.nome}</span>
            <button type="button" className="q-icone-btn" onClick={fechar} aria-label="Fechar">
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
            <input
              id={campo("tema")}
              data-campo="tema"
              className={`q-ficha__tema${erroTema ? " q-campo--erro" : ""}`}
              placeholder="Título do card"
              maxLength={LIMITE_TEMA}
              value={rascunho.tema ?? ""}
              aria-invalid={erroTema || undefined}
              onChange={(e) => {
                const tema = e.currentTarget.value;
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

          <div className="q-ficha__grade">
            <label className="q-campo">
              <span>Coluna</span>
              <select data-campo="coluna" value={d.coluna ?? "pauta"} disabled={ro} onChange={(e) => por({ coluna: e.currentTarget.value })}>
                {COLUNAS.map((c) => (
                  <option key={c.k} value={c.k}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-campo">
              <span>Responsável</span>
              <select data-campo="resp" value={d.resp ?? ""} disabled={ro} onChange={(e) => por({ resp: valorOuNulo(e.currentTarget.value) })}>
                <option value="">Ninguém ainda</option>
                {refs.pessoas.map((p) => (
                  <option key={p.sub} value={p.sub}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-campo">
              <span>Cliente</span>
              <select data-campo="cliente" value={d.cliente ?? ""} disabled={ro} onChange={(e) => trocarCliente(e.currentTarget.value)}>
                <option value="">Sem cliente</option>
                {refs.clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-campo">
              <span>Projeto</span>
              <select data-campo="projeto" value={d.projeto ?? ""} disabled={ro} onChange={(e) => trocarProjeto(e.currentTarget.value)}>
                <option value="">Sem projeto</option>
                {projetosDoCliente.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.titulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-campo">
              <span>Prazo de entrega</span>
              <input type="date" data-campo="prazo" value={d.prazo ?? ""} readOnly={ro} onChange={(e) => por({ prazo: valorOuNulo(e.currentTarget.value) })} />
            </label>
            <div className="q-campo" role="group" aria-labelledby={campo("prio")}>
              <span id={campo("prio")}>Prioridade</span>
              <div className="q-segmentos">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.k}
                    type="button"
                    aria-pressed={(d.prioridade ?? "normal") === p.k}
                    disabled={ro}
                    onClick={() => por({ prioridade: p.k === "normal" ? null : p.k })}
                  >
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="q-campo">
            <span>Briefing</span>
            <CampoTexto
              multilinha
              data-campo="briefing"
              placeholder="O que é, para quem, referências."
              valor={d.briefing ?? ""}
              limite={LIMITE_BRIEFING}
              readOnly={ro}
              aoSalvar={(v) => por({ briefing: v.trim() ? v : null })}
            />
          </label>

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
      </div>
    </div>
  );
}

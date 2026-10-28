"use client";
/**
 * O Quadro: as 8 colunas do método com os cards de verdade. No computador arrasta-se o card entre (e dentro das)
 * colunas; no celular uma coluna por vez, com as abas das colunas, e o card se move por "Mover para…". Filtro por
 * cliente e responsável, busca, ficha lateral e o próximo passo de cada coluna (porte do Maestro antigo).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COLUNAS, FILTRO_VAZIO, ordemEntre, ordenarColuna, passaFiltro, proximoPasso, type CardQ, type ColunaKey, type Filtro } from "@/lib/quadro/metodo";
import type { Referencias } from "@/lib/quadro/servidor";
import { Icone } from "@/components/icones";
import { Ficha } from "./ficha";
import { AvatarPessoa, ChipPrazo, ChipPrioridade, MoverPara } from "./pecas";
import { useQuadro, type Inicial } from "./estado";

type Props = Inicial & {
  cardInicial?: string | null;
  clienteInicial?: string | null;
  novoInicial?: boolean;
  projetoInicial?: string | null;
  /** Pauta vazia: o botão "Carregar demonstração" (só administração e gestão), ao lado de "Novo card". */
  demonstracao?: ReactNode;
};
type Alvo = { col: ColunaKey; antes: string | null };
type FichaAberta = { id: string; focar?: string | null } | { novo: { coluna: ColunaKey; cliente?: string; projeto?: string } };

export function Quadro(props: Props) {
  const { cards, mudar, criar, apagar, aviso, fecharAviso } = useQuadro(props);
  const { pessoas, clientes, projetos, eu, podeEscrever } = props;
  const refs = useMemo(() => ({ pessoas, clientes, projetos }), [pessoas, clientes, projetos]);
  const [filtro, setFiltro] = useState<Filtro>(() => ({ ...FILTRO_VAZIO, cliente: props.clienteInicial ?? "todos" }));
  const [ficha, setFicha] = useState<FichaAberta | null>(() =>
    props.cardInicial
      ? { id: props.cardInicial }
      : props.novoInicial && props.podeEscrever
        ? { novo: { coluna: "pauta", cliente: props.clienteInicial ?? undefined, projeto: props.projetoInicial ?? undefined } }
        : null,
  );
  const [mover, setMover] = useState<string | null>(null);
  const [colMovel, setColMovel] = useState<ColunaKey>(() => (props.cardInicial && cards[props.cardInicial] ? cards[props.cardInicial].dados.coluna : "pauta"));
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const arraste = useRef<string | null>(null);

  const pessoa = useCallback((sub?: string) => pessoas.find((p) => p.sub === sub) ?? null, [pessoas]);
  const nomeCliente = useCallback((id?: string) => clientes.find((c) => c.id === id)?.nome ?? "", [clientes]);
  const codigoProjeto = useCallback((id?: string) => projetos.find((p) => p.id === id)?.codigo ?? "", [projetos]);

  const lista = useMemo(() => Object.values(cards), [cards]);
  const porColuna = useMemo(() => {
    const m = Object.fromEntries(COLUNAS.map((c) => [c.k, [] as CardQ[]])) as Record<ColunaKey, CardQ[]>;
    for (const c of lista) (m[c.dados.coluna] ?? m.pauta).push(c);
    for (const k of Object.keys(m) as ColunaKey[]) m[k] = ordenarColuna(k, m[k]);
    return m;
  }, [lista]);
  const visiveis = useMemo(() => {
    const m = {} as Record<ColunaKey, CardQ[]>;
    for (const c of COLUNAS) m[c.k] = porColuna[c.k].filter((x) => passaFiltro(x, filtro, eu, nomeCliente));
    return m;
  }, [porColuna, filtro, eu, nomeCliente]);
  const filtrando = filtro.busca.trim() !== "" || filtro.cliente !== "todos" || filtro.resp !== "todos";
  const totalVisivel = COLUNAS.reduce((n, c) => n + visiveis[c.k].length, 0);

  // o endereço acompanha a ficha aberta (link direto para um card)
  useEffect(() => {
    const u = new URL(window.location.href);
    if (ficha && "id" in ficha) u.searchParams.set("card", ficha.id);
    else u.searchParams.delete("card");
    u.searchParams.delete("novo");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, [ficha]);

  const fecharFicha = useCallback(() => setFicha(null), []);
  const fecharMover = useCallback(() => setMover(null), []);

  /** Move para o fim de uma coluna (Mover para…, próximo passo) ou entre dois cards (arrastar). */
  const moverPara = useCallback(
    (id: string, col: ColunaKey, antes: string | null = null) => {
      const c = cards[id];
      if (!c) return;
      const outros = porColuna[col].filter((x) => x.id !== id);
      const i = antes ? outros.findIndex((x) => x.id === antes) : outros.length;
      const pos = i < 0 ? outros.length : i;
      const ordem = ordemEntre(outros[pos - 1]?.dados ?? null, outros[pos]?.dados ?? null);
      if (c.dados.coluna === col && (c.dados.ordem ?? 0) === ordem) return;
      void mudar(id, c.dados.coluna === col ? { ordem } : { coluna: col, ordem });
    },
    [cards, porColuna, mudar],
  );

  const executar = (c: CardQ) => {
    const p = proximoPasso(c.dados)?.principal;
    if (!p) return;
    if (p.acao === "atribuir") setFicha({ id: c.id, focar: "resp" });
    else moverPara(c.id, p.para);
  };

  /* ───── arrastar (computador) ───── */
  const aoArrastarSobre = (e: React.DragEvent<HTMLElement>, col: ColunaKey) => {
    if (!arraste.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const corpo = e.currentTarget;
    const els = [...corpo.querySelectorAll<HTMLElement>("[data-card]")].filter((x) => x.dataset.card !== arraste.current);
    const depois = els.find((x) => {
      const r = x.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    const novo = { col, antes: depois?.dataset.card ?? null };
    if (!alvo || alvo.col !== novo.col || alvo.antes !== novo.antes) setAlvo(novo);
  };
  const aoSoltar = (e: React.DragEvent<HTMLElement>, col: ColunaKey) => {
    const id = arraste.current;
    if (!id) return;
    e.preventDefault();
    moverPara(id, col, alvo?.col === col ? alvo.antes : null);
    arraste.current = null;
    setArrastando(null);
    setAlvo(null);
  };
  const fimArraste = () => {
    arraste.current = null;
    setArrastando(null);
    setAlvo(null);
  };

  const cardFicha = ficha && "id" in ficha ? (cards[ficha.id] ?? null) : null;
  // card aberto que sumiu (apagado aqui ou em outro aparelho): a ficha fecha sozinha
  const fichaValida = ficha && ("novo" in ficha || cardFicha);

  const vazioDeVerdade = lista.length === 0;

  return (
    <div className="q">
      <header className="q-cabeca">
        <h1 className="atitle">
          Seu <strong>Quadro.</strong>
        </h1>
        {podeEscrever ? (
          <button
            type="button"
            className="glass-btn glass-btn--ink"
            onClick={() =>
              setFicha({ novo: { coluna: "pauta", cliente: filtro.cliente !== "todos" && filtro.cliente !== "sem" ? filtro.cliente : undefined } })
            }
          >
            <Icone nome="mais" size={18} /> Novo card
          </button>
        ) : null}
      </header>

      {vazioDeVerdade ? (
        <section className="vazio" aria-label="Pauta vazia">
          <span className="vazio__icone">
            <Icone nome="quadro" size={26} />
          </span>
          <h2>A pauta está limpa</h2>
          <p>{podeEscrever ? "Crie o primeiro card. Ele nasce na Pauta." : "Quando a equipe criar cards, eles aparecem aqui."}</p>
          {podeEscrever || props.demonstracao ? (
            <div className="acoes acoes--centro vazio__acoes">
              {podeEscrever ? (
                <button type="button" className="glass-btn glass-btn--ink" onClick={() => setFicha({ novo: { coluna: "pauta" } })}>
                  <Icone nome="mais" size={18} /> Novo card
                </button>
              ) : null}
              {props.demonstracao}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <div className="q-barra" role="search">
            <label className="q-busca">
              <Icone nome="busca" size={16} />
              <span className="sr-only">Buscar</span>
              <input type="search" placeholder="Buscar" value={filtro.busca} onChange={(e) => setFiltro({ ...filtro, busca: e.currentTarget.value })} />
            </label>
            <label className="q-filtro">
              <span className="sr-only">Cliente</span>
              <select
                value={filtro.cliente}
                onChange={(e) => setFiltro({ ...filtro, cliente: e.currentTarget.value })}
                data-ativo={filtro.cliente !== "todos" || undefined}
              >
                <option value="todos">Todos os clientes</option>
                <option value="sem">Sem cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-filtro">
              <span className="sr-only">Responsável</span>
              <select
                value={filtro.resp}
                onChange={(e) => setFiltro({ ...filtro, resp: e.currentTarget.value })}
                data-ativo={filtro.resp !== "todos" || undefined}
              >
                <option value="todos">Todas as pessoas</option>
                <option value="meus">Meus cards</option>
                <option value="ninguem">Sem responsável</option>
                {pessoas.map((p) => (
                  <option key={p.sub} value={p.sub}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            {filtrando ? (
              <button type="button" className="q-limpar" onClick={() => setFiltro(FILTRO_VAZIO)}>
                Limpar
              </button>
            ) : null}
            {filtrando ? (
              <span className="q-contagem" aria-live="polite">
                {totalVisivel === 1 ? "1 card" : `${totalVisivel} cards`}
              </span>
            ) : null}
          </div>

          <nav className="q-abas" aria-label="Colunas">
            {COLUNAS.map((c) => (
              <button
                key={c.k}
                type="button"
                className={c.k === colMovel ? "on" : undefined}
                data-col={c.k}
                aria-pressed={c.k === colMovel}
                onClick={() => setColMovel(c.k)}
              >
                <i className="q-ponto" aria-hidden="true" />
                {c.nome}
                <span>{visiveis[c.k].length}</span>
              </button>
            ))}
          </nav>

          <div
            className={`q-quadro${arrastando ? " q-quadro--arrastando" : ""}`}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setAlvo(null)}
          >
            {COLUNAS.map((col) => {
              const l = visiveis[col.k];
              const sobre = alvo?.col === col.k;
              return (
                <section key={col.k} className={`q-col${col.k === colMovel ? " on" : ""}${sobre ? " q-col--alvo" : ""}`} data-col={col.k} aria-label={col.nome}>
                  <header className="q-col__topo" title={col.desc}>
                    <i className="q-ponto" aria-hidden="true" />
                    <h2>{col.nome}</h2>
                    <span className="q-col__n">{l.length}</span>
                    {podeEscrever ? (
                      <button
                        type="button"
                        className="q-icone-btn q-col__mais"
                        aria-label={`Novo card em ${col.nome}`}
                        onClick={() => setFicha({ novo: { coluna: col.k } })}
                      >
                        <Icone nome="mais" size={16} />
                      </button>
                    ) : null}
                  </header>
                  <div className="q-col__corpo" onDragOver={(e) => aoArrastarSobre(e, col.k)} onDrop={(e) => aoSoltar(e, col.k)}>
                    {l.map((c) => (
                      <div key={c.id} className="q-lugar">
                        {sobre && alvo?.antes === c.id ? <div className="q-solta" aria-hidden="true" /> : null}
                        <Cartao
                          c={c}
                          cliente={nomeCliente(c.dados.cliente)}
                          projeto={codigoProjeto(c.dados.projeto)}
                          resp={pessoa(c.dados.resp)}
                          podeEscrever={podeEscrever}
                          arrastando={arrastando === c.id}
                          abrir={() => setFicha({ id: c.id })}
                          passo={() => executar(c)}
                          mais={() => setMover(c.id)}
                          aoArrastar={(e) => {
                            arraste.current = c.id;
                            e.dataTransfer.effectAllowed = "move";
                            try {
                              e.dataTransfer.setData("text/plain", c.id);
                            } catch {}
                            setTimeout(() => setArrastando(c.id), 0);
                          }}
                          aoSoltar={fimArraste}
                        />
                      </div>
                    ))}
                    {sobre && alvo?.antes === null ? <div className="q-solta" aria-hidden="true" /> : null}
                    {!l.length ? <p className="q-col__vazio">{filtrando ? "Nada aqui com este filtro." : col.desc}</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {fichaValida ? (
        <Ficha
          key={"id" in ficha ? ficha.id : "novo"}
          card={cardFicha}
          novo={"novo" in ficha ? ficha.novo : null}
          focar={"id" in ficha ? ficha.focar : null}
          refs={refs}
          podeEscrever={podeEscrever}
          mudar={mudar}
          criar={criar}
          apagar={(id) => {
            setFicha(null);
            void apagar(id);
          }}
          fechar={fecharFicha}
          aoCriar={(id) => {
            setFicha(null);
            const col = cards[id]?.dados.coluna;
            if (col) setColMovel(col);
          }}
        />
      ) : null}

      {mover && cards[mover] ? (
        <MoverPara
          atual={cards[mover].dados.coluna}
          aoFechar={fecharMover}
          aoEscolher={(k) => {
            moverPara(mover, k);
            setMover(null);
            setColMovel(k);
          }}
        />
      ) : null}

      {aviso ? <Aviso key={aviso.id} texto={aviso.texto} desfazer={aviso.desfazer} fechar={fecharAviso} /> : null}
    </div>
  );
}

function Cartao({
  c,
  cliente,
  projeto,
  resp,
  podeEscrever,
  arrastando,
  abrir,
  passo,
  mais,
  aoArrastar,
  aoSoltar,
}: {
  c: CardQ;
  cliente: string;
  projeto: string;
  resp: Referencias["pessoas"][number] | null;
  podeEscrever: boolean;
  arrastando: boolean;
  abrir: () => void;
  passo: () => void;
  mais: () => void;
  aoArrastar: (e: React.DragEvent<HTMLElement>) => void;
  aoSoltar: () => void;
}) {
  const d = c.dados;
  const px = podeEscrever ? proximoPasso(d)?.principal : null;
  return (
    <article
      className={`q-card${arrastando ? " q-card--arrastando" : ""}${d.prioridade === "alta" ? " q-card--alta" : ""}`}
      data-card={c.id}
      data-col={d.coluna}
      draggable={podeEscrever}
      onDragStart={aoArrastar}
      onDragEnd={aoSoltar}
    >
      <button type="button" className="q-card__abrir" onClick={abrir} aria-label={`Abrir ${d.tema}`} />
      <div className="q-card__topo">
        <span className="q-card__cliente" title={projeto ? `${cliente || "Sem cliente"} · ${projeto}` : undefined}>
          {cliente || "Sem cliente"}
        </span>
        {podeEscrever ? (
          <button type="button" className="q-icone-btn q-card__mais" aria-label="Mover para…" title="Mover para…" onClick={mais}>
            <Icone nome="pontos" size={16} />
          </button>
        ) : null}
      </div>
      <h3 className="q-card__tema">{d.tema}</h3>
      {d.prazo || d.prioridade === "alta" || resp ? (
        <div className="q-card__meta">
          <ChipPrazo d={d} />
          <ChipPrioridade p={d.prioridade} />
          {resp ? (
            <span className="q-card__fim">
              <AvatarPessoa pessoa={resp} />
            </span>
          ) : null}
        </div>
      ) : null}
      {px ? (
        <button type="button" className="q-card__passo" onClick={passo} title={px.rotulo}>
          <span>{px.rotulo}</span>
          <Icone nome="seta" size={13} />
        </button>
      ) : null}
    </article>
  );
}

function Aviso({ texto, desfazer, fechar }: { texto: string; desfazer?: () => void; fechar: () => void }) {
  useEffect(() => {
    const t = setTimeout(fechar, desfazer ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [fechar, desfazer]);
  return (
    <div className="q-aviso" role="status">
      <span>{texto}</span>
      {desfazer ? (
        <button
          type="button"
          onClick={() => {
            desfazer();
            fechar();
          }}
        >
          Desfazer
        </button>
      ) : null}
    </div>
  );
}

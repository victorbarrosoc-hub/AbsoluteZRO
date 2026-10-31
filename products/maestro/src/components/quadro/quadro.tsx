"use client";
/**
 * O Quadro: as colunas da produtora (as 8 do método e as que ela criou, drizzle/0024) com os cards de verdade. No
 * computador arrasta-se o card com o mouse entre (e dentro das) colunas (arrastar.ts) e o cabeçalho da coluna para
 * reordenar; clique duplo no nome renomeia. No celular uma coluna por vez, com as abas das colunas: desliza-se de lado para trocar de coluna e
 * segura-se o card para arrastar (gestos.ts), além do "Mover para…"; tocar na aba já escolhida renomeia. "Colunas"
 * abre a folha "Editar colunas" (colunas.tsx). Mexer nas colunas é só administração e gestão. Filtro por cliente e
 * responsável, busca, ficha lateral e o próximo passo de cada coluna (porte do Maestro antigo).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FILTRO_VAZIO,
  ordemEntre,
  ordemPorChegada,
  ordenarColuna,
  passaFiltro,
  proximoPasso,
  type CardQ,
  type ColunaId,
  type Filtro,
} from "@/lib/quadro/metodo";
import { USO_DO_PAPEL, colunasVivas, descricaoDaColuna, moverNaLista, nomeDaColuna } from "@/lib/quadro/colunas";
import type { Referencias } from "@/lib/quadro/servidor";
import { Icone } from "@/components/icones";
import { Ficha } from "./ficha";
import { AvatarPessoa, ChipPrazo, ChipPrioridade, ImagemDoCard, MarcaCliente, MoverPara, Realce, SeloDoCard } from "./pecas";
import { imagemDoCard, rotuloDoSelo, termosDaBusca, type Selo } from "@/lib/quadro/selos";
import { useQuadro, type Inicial } from "./estado";
import { useFlip } from "./flip";
import { useGestosCelular } from "./gestos";
import { useArrastoComMouse } from "./arrastar";
import { CampoNome, EditarColunas, NomeDaColuna, type AcoesDeColunas } from "./colunas";

type Props = Inicial & {
  cardInicial?: string | null;
  clienteInicial?: string | null;
  novoInicial?: boolean;
  projetoInicial?: string | null;
  /** Pauta vazia: o botão "Carregar demonstração" (só administração e gestão), ao lado de "Novo card". */
  demonstracao?: ReactNode;
};
type FichaAberta = { id: string; focar?: string | null } | { novo: { coluna: ColunaId; cliente?: string; projeto?: string } };
/** Arrastar o cabeçalho (computador): a coluna e o lugar (índice entre as vivas) onde entraria. */
type AlvoColuna = { id: ColunaId; lugar: number };

/** Onde a marca de soltar aparece ao reordenar pelo cabeçalho: antes da coluna do lugar ou depois da última. */
function marcaDeSoltar(ordem: ColunaId[], alvo: AlvoColuna | null): { lado: "antes" | "depois"; col: ColunaId } | null {
  if (!alvo) return null;
  const outras = ordem.filter((k) => k !== alvo.id);
  if (moverNaLista(ordem, alvo.id, alvo.lugar).join() === ordem.join()) return null;
  return alvo.lugar < outras.length ? { lado: "antes", col: outras[alvo.lugar] } : { lado: "depois", col: outras[outras.length - 1] };
}

/** Começa a arrastar o cabeçalho (o navegador leva o nome). Renomeando (o campo está no cabeçalho), não arrasta. */
function comecarArrasteDeColuna(e: React.DragEvent<HTMLElement>, nome: string): boolean {
  if (e.currentTarget.querySelector("input")) {
    e.preventDefault();
    return false;
  }
  e.dataTransfer.effectAllowed = "move";
  try {
    e.dataTransfer.setData("text/plain", nome);
  } catch {}
  return true;
}

export function Quadro(props: Props) {
  const q = useQuadro(props);
  const { cards, selos, mudar, criar, apagar, aviso, avisar, fecharAviso, colunas } = q;
  const { pessoas, clientes, projetos, eu, podeEscrever, podeEditarColunas } = props;
  const vivas = useMemo(() => colunasVivas(colunas), [colunas]);
  const ordemColunas = useMemo(() => vivas.map((c) => c.id), [vivas]);
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
  const [colEscolhida, setColMovel] = useState<ColunaId>(() =>
    props.cardInicial && cards[props.cardInicial] ? cards[props.cardInicial].dados.coluna : (ordemColunas[0] ?? "pauta"),
  );
  // a coluna escolhida foi arquivada (aqui ou em outro aparelho): fica a primeira
  const colMovel = ordemColunas.includes(colEscolhida) ? colEscolhida : (ordemColunas[0] ?? "pauta");
  const quadro = useRef<HTMLDivElement>(null);
  const abas = useRef<HTMLElement>(null);
  const voo = useRef<{ id: string; de: DOMRect } | null>(null);
  const fixar = useFlip(quadro, voo);
  const [editarColunas, setEditarColunas] = useState(false);
  const [renomeandoAba, setRenomeandoAba] = useState<ColunaId | null>(null);
  const [alvoColuna, setAlvoColuna] = useState<AlvoColuna | null>(null);
  const arrasteColuna = useRef<ColunaId | null>(null);
  // reordenar colunas pelo cabeçalho (arrastar do HTML) só com mouse; o card arrasta com arrastar.ts (mouse) e gestos.ts (toque)
  const [mouse, setMouse] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(hover: hover) and (pointer: fine)");
    const ver = () => setMouse(m.matches);
    ver();
    m.addEventListener("change", ver);
    return () => m.removeEventListener("change", ver);
  }, []);

  const pessoa = useCallback((sub?: string) => pessoas.find((p) => p.sub === sub) ?? null, [pessoas]);
  const nomeCliente = useCallback((id?: string) => clientes.find((c) => c.id === id)?.nome ?? "", [clientes]);
  const codigoProjeto = useCallback((id?: string) => projetos.find((p) => p.id === id)?.codigo ?? "", [projetos]);

  const lista = useMemo(() => Object.values(cards), [cards]);
  const porColuna = useMemo(() => {
    const m = Object.fromEntries(ordemColunas.map((k) => [k, [] as CardQ[]])) as Record<ColunaId, CardQ[]>;
    // card numa coluna que esta tela ainda não conhece (ou acabou de ser arquivada): fica na primeira até a lista chegar
    const primeira = m[ordemColunas[0]] ?? [];
    for (const c of lista) (m[c.dados.coluna] ?? primeira).push(c);
    for (const k of Object.keys(m)) m[k] = ordenarColuna(k, m[k]);
    return m;
  }, [lista, ordemColunas]);
  const visiveis = useMemo(() => {
    const m = {} as Record<ColunaId, CardQ[]>;
    for (const k of ordemColunas) m[k] = (porColuna[k] ?? []).filter((x) => passaFiltro(x, filtro, eu, nomeCliente, codigoProjeto));
    return m;
  }, [porColuna, ordemColunas, filtro, eu, nomeCliente, codigoProjeto]);
  const contagem = useMemo(() => Object.fromEntries(ordemColunas.map((k) => [k, porColuna[k]?.length ?? 0])), [ordemColunas, porColuna]);
  const filtrando = filtro.busca.trim() !== "" || filtro.cliente !== "todos" || filtro.resp !== "todos";
  const totalVisivel = ordemColunas.reduce((n, k) => n + (visiveis[k]?.length ?? 0), 0);
  // os termos da busca, para o realce no card (a mesma string = o card não desenha de novo)
  const realce = useMemo(() => termosDaBusca(filtro.busca).join(" "), [filtro.busca]);
  const busca = useRef<HTMLInputElement>(null);
  // "/" leva à busca (fora de campo de texto), como no Finder e nos apps da Apple na web
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      e.preventDefault();
      busca.current?.focus();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

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
    (id: string, col: ColunaId, antes: string | null = null) => {
      const c = cards[id];
      if (!c) return;
      const outros = (porColuna[col] ?? []).filter((x) => x.id !== id);
      const i = antes ? outros.findIndex((x) => x.id === antes) : outros.length;
      const pos = i < 0 ? outros.length : i;
      const ordem = ordemEntre(outros[pos - 1]?.dados ?? null, outros[pos]?.dados ?? null);
      if (c.dados.coluna === col && (c.dados.ordem ?? 0) === ordem) return;
      const de = c.dados.coluna;
      void mudar(id, de === col ? { ordem } : { coluna: col, ordem });
      // mudou de coluna: o aviso diz para onde, com "Desfazer" (volta para a coluna e o lugar de antes)
      if (de !== col)
        avisar(
          `Movido para ${nomeDaColuna(colunas, col)}.`,
          () => void mudar(id, typeof c.dados.ordem === "number" ? { coluna: de, ordem: c.dados.ordem } : { coluna: de }),
        );
    },
    [cards, porColuna, mudar, avisar, colunas],
  );

  const irParaColuna = useGestosCelular({
    quadro,
    abas,
    colunas: ordemColunas,
    coluna: colMovel,
    setColuna: setColMovel,
    podeArrastar: podeEscrever,
    mover: moverPara,
    fixar,
  });

  useArrastoComMouse({ quadro, podeArrastar: podeEscrever, mover: moverPara, fixar, ordemFixa: ordemPorChegada });

  const executar = (c: CardQ) => {
    const p = proximoPasso(c.dados)?.principal;
    if (!p) return;
    if (p.acao === "atribuir") setFicha({ id: c.id, focar: "resp" });
    else moverPara(c.id, p.para);
  };
  // as ações do card são estáveis (o card só desenha de novo quando os dados dele mudam)
  const executarAgora = useRef(executar);
  const cardsAgora = useRef(cards);
  useLayoutEffect(() => {
    executarAgora.current = executar;
    cardsAgora.current = cards;
  });
  const abrirCard = useCallback((id: string) => setFicha({ id }), []);
  const passoDoCard = useCallback((id: string) => {
    const c = cardsAgora.current[id];
    if (c) executarAgora.current(c);
  }, []);
  const moverCard = useCallback((id: string) => setMover(id), []);

  const acoesColunas: AcoesDeColunas = {
    renomear: (id, nome) => void q.renomearColuna(id, nome),
    recolorir: (id, cor) => void q.recolorirColuna(id, cor),
    ordenar: (ids) => void q.ordenarColunas(ids),
    criar: q.criarColuna,
    arquivar: q.arquivarColuna,
    restaurar: (id) => void q.restaurarColuna(id),
    padrao: () => void q.colunasDeFabrica(),
  };

  /* ───── arrastar o cabeçalho da coluna (computador): reordena ───── */
  const aoArrastarSobreQuadro = (e: React.DragEvent<HTMLElement>) => {
    const id = arrasteColuna.current;
    if (!id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cols = [...e.currentTarget.querySelectorAll<HTMLElement>(":scope > .q-col")];
    let lugar = 0;
    for (const el of cols) {
      const r = el.getBoundingClientRect();
      if (el.dataset.col !== id && e.clientX > r.left + r.width / 2) lugar++;
    }
    if (!alvoColuna || alvoColuna.id !== id || alvoColuna.lugar !== lugar) setAlvoColuna({ id, lugar });
  };
  const aoSoltarNoQuadro = (e: React.DragEvent<HTMLElement>) => {
    const id = arrasteColuna.current;
    if (!id) return;
    e.preventDefault();
    const lugar = alvoColuna?.id === id ? alvoColuna.lugar : null;
    arrasteColuna.current = null;
    setAlvoColuna(null);
    if (lugar !== null) void q.ordenarColunas(moverNaLista(ordemColunas, id, lugar));
  };
  const fimArrasteColuna = () => {
    arrasteColuna.current = null;
    setAlvoColuna(null);
  };
  // onde a marca de soltar aparece: antes da coluna `lugar` (entre as outras) ou depois da última
  const marcaColuna = marcaDeSoltar(ordemColunas, alvoColuna);

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
        {podeEscrever || podeEditarColunas ? (
          <div className="q-cabeca__acoes">
            {podeEditarColunas ? (
              <button
                type="button"
                className="glass-btn q-cabeca__colunas"
                aria-label="Editar colunas"
                title="Editar colunas"
                onClick={() => setEditarColunas(true)}
              >
                <Icone nome="colunas" size={18} />
                <span>Colunas</span>
              </button>
            ) : null}
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
          </div>
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
              <input
                ref={busca}
                type="search"
                placeholder="Buscar job, cliente ou projeto"
                value={filtro.busca}
                onChange={(e) => setFiltro({ ...filtro, busca: e.currentTarget.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && filtro.busca) {
                    e.preventDefault();
                    setFiltro({ ...filtro, busca: "" });
                  }
                }}
              />
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
              <span className="q-contagem" aria-live="polite" data-zero={totalVisivel === 0 || undefined}>
                {totalVisivel === 0 ? "Nenhum card" : totalVisivel === 1 ? "1 card" : `${totalVisivel} cards`}
              </span>
            ) : null}
            {podeEditarColunas ? (
              // no celular o botão "Colunas" mora aqui, ao lado dos filtros (o topo fica numa linha só)
              <button
                type="button"
                className="glass-btn q-barra__colunas"
                aria-label="Editar colunas"
                title="Editar colunas"
                onClick={() => setEditarColunas(true)}
              >
                <Icone nome="colunas" size={18} />
              </button>
            ) : null}
          </div>

          <nav ref={abas} className="q-abas" aria-label="Colunas" data-rolagem>
            <span className="q-abas__pilula" aria-hidden="true" />
            {vivas.map((c) =>
              renomeandoAba === c.id ? (
                <span key={c.id} className="q-abas__campo on" data-col={c.id} data-cor={c.cor}>
                  <i className="q-ponto" aria-hidden="true" />
                  <CampoNome
                    nome={c.nome}
                    rotulo={`Nome da coluna ${c.nome}`}
                    aoSalvar={(n) => {
                      setRenomeandoAba(null);
                      void q.renomearColuna(c.id, n);
                    }}
                    aoCancelar={() => setRenomeandoAba(null)}
                  />
                </span>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  className={c.id === colMovel ? "on" : undefined}
                  data-col={c.id}
                  data-cor={c.cor}
                  aria-pressed={c.id === colMovel}
                  title={c.id === colMovel && podeEditarColunas ? "Toque de novo para renomear" : undefined}
                  onClick={() => (c.id === colMovel && podeEditarColunas ? setRenomeandoAba(c.id) : irParaColuna(c.id))}
                >
                  <i className="q-ponto" aria-hidden="true" />
                  {c.nome}
                  <span>{visiveis[c.id]?.length ?? 0}</span>
                </button>
              ),
            )}
          </nav>

          {filtrando && totalVisivel === 0 ? (
            <section className="q-nada" aria-live="polite">
              <span className="q-nada__icone" aria-hidden="true">
                <Icone nome="busca" size={20} />
              </span>
              <p>{filtro.busca.trim() ? `Nada com “${filtro.busca.trim()}”.` : "Nada com este filtro."}</p>
              <button type="button" className="glass-btn glass-btn--sm" onClick={() => setFiltro(FILTRO_VAZIO)}>
                {filtro.busca.trim() ? "Limpar busca" : "Limpar filtros"}
              </button>
            </section>
          ) : null}

          <div
            ref={quadro}
            className={`q-quadro${alvoColuna ? " q-quadro--colunas" : ""}`}
            data-filtrando={filtrando || undefined}
            onDragLeave={(e) => {
              if (!arrasteColuna.current || e.currentTarget.contains(e.relatedTarget as Node)) return;
              // o Safari manda dragleave sem relatedTarget ao passar de um filho a outro: só vale saindo da área
              const r = e.currentTarget.getBoundingClientRect();
              if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) return;
              setAlvoColuna(null);
            }}
            onDragOver={aoArrastarSobreQuadro}
            onDrop={aoSoltarNoQuadro}
          >
            {vivas.map((col) => {
              const l = visiveis[col.id] ?? [];
              const desc = descricaoDaColuna(col);
              return (
                <section
                  key={col.id}
                  className={`q-col${col.id === colMovel ? " on" : ""}${alvoColuna?.id === col.id ? " q-col--erguida" : ""}`}
                  data-vazia={(filtrando && !l.length) || undefined}
                  data-col={col.id}
                  data-cor={col.cor}
                  data-marca={marcaColuna?.col === col.id ? marcaColuna.lado : undefined}
                  aria-label={col.nome}
                >
                  <header
                    className="q-col__topo"
                    title={col.papel ? `${desc} ${USO_DO_PAPEL[col.papel]}.` : desc}
                    draggable={podeEditarColunas && mouse}
                    onDragStart={(e) => {
                      if (comecarArrasteDeColuna(e, col.nome)) arrasteColuna.current = col.id;
                    }}
                    onDragEnd={fimArrasteColuna}
                  >
                    <i className="q-ponto" aria-hidden="true" />
                    <NomeDaColuna coluna={col} podeEditar={podeEditarColunas} aoRenomear={(n) => void q.renomearColuna(col.id, n)} />
                    <span className="q-col__n">{l.length}</span>
                    {podeEscrever ? (
                      <button
                        type="button"
                        className="q-icone-btn q-col__mais"
                        aria-label={`Novo card em ${col.nome}`}
                        onClick={() => setFicha({ novo: { coluna: col.id } })}
                      >
                        <Icone nome="mais" size={16} />
                      </button>
                    ) : null}
                  </header>
                  <div className="q-col__corpo">
                    {l.map((c) => (
                      <div key={c.id} className="q-lugar">
                        <Cartao
                          c={c}
                          cliente={nomeCliente(c.dados.cliente)}
                          projeto={codigoProjeto(c.dados.projeto)}
                          resp={pessoa(c.dados.resp)}
                          selo={selos[c.id]}
                          realce={realce}
                          podeEscrever={podeEscrever}
                          abrir={abrirCard}
                          passo={passoDoCard}
                          mais={moverCard}
                        />
                      </div>
                    ))}
                    {!l.length ? <p className="q-col__vazio">{filtrando ? "Nada aqui com este filtro." : desc}</p> : null}
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
          colunas={vivas}
          podeEscrever={podeEscrever}
          selo={"id" in ficha ? selos[ficha.id] : undefined}
          adotar={q.adotar}
          mudar={mudar}
          criar={criar}
          apagar={(id) => {
            setFicha(null);
            void apagar(id);
          }}
          fechar={fecharFicha}
          aoCriar={(id, origem, col) => {
            if (origem) voo.current = { id, de: origem };
            setFicha(null);
            setColMovel(col);
            avisar("Card criado.");
          }}
        />
      ) : null}

      {mover && cards[mover] ? (
        <MoverPara
          colunas={vivas}
          atual={cards[mover].dados.coluna}
          aoFechar={fecharMover}
          aoEscolher={(k) => {
            moverPara(mover, k);
            setMover(null);
            setColMovel(k);
          }}
        />
      ) : null}

      {editarColunas && podeEditarColunas ? (
        <EditarColunas colunas={colunas} contagem={contagem} acoes={acoesColunas} aoFechar={() => setEditarColunas(false)} />
      ) : null}

      {aviso ? <Aviso key={aviso.id} texto={aviso.texto} desfazer={aviso.desfazer} fechar={fecharAviso} /> : null}
    </div>
  );
}

type PropsCartao = {
  c: CardQ;
  cliente: string;
  projeto: string;
  resp: Referencias["pessoas"][number] | null;
  /** A peça e o cliente (src/lib/quadro/selos.ts); o mesmo objeto enquanto nada muda. */
  selo: Selo | undefined;
  /** Os termos da busca separados por espaço ("" = sem realce). */
  realce: string;
  podeEscrever: boolean;
  abrir: (id: string) => void;
  passo: (id: string) => void;
  mais: (id: string) => void;
};
/** A pessoa é a mesma pelo conteúdo (a página renovada pelo servidor traz objetos novos com os mesmos dados). */
const mesmoCartao = (a: PropsCartao, b: PropsCartao) =>
  a.c === b.c &&
  a.cliente === b.cliente &&
  a.projeto === b.projeto &&
  a.selo === b.selo &&
  a.realce === b.realce &&
  a.podeEscrever === b.podeEscrever &&
  a.abrir === b.abrir &&
  a.passo === b.passo &&
  a.mais === b.mais &&
  (a.resp === b.resp || (!!a.resp && !!b.resp && a.resp.sub === b.resp.sub && a.resp.nome === b.resp.nome && a.resp.foto === b.resp.foto));

/**
 * Um card. Só desenha de novo quando os dados dele mudam: arrastar, a volta de 5 s, a ficha e a página renovada pelo
 * servidor depois de gravar não redesenham os outros.
 */
const Cartao = memo(function Cartao({ c, cliente, projeto, resp, selo, realce, podeEscrever, abrir, passo, mais }: PropsCartao) {
  const d = c.dados;
  const px = podeEscrever ? proximoPasso(d)?.principal : null;
  const imagem = imagemDoCard(c.id, d.capa, selo);
  const termos = realce ? realce.split(" ") : [];
  const dica = rotuloDoSelo(selo)?.dica;
  return (
    <article className={`q-card${d.prioridade === "alta" ? " q-card--alta" : ""}${imagem ? " q-card--imagem" : ""}`} data-card={c.id} data-col={d.coluna}>
      <button type="button" className="q-card__abrir" onClick={() => abrir(c.id)} aria-label={`Abrir ${[d.tema, cliente, dica].filter(Boolean).join(", ")}`} />
      {imagem ? <ImagemDoCard key={imagem.src} src={imagem.src} origem={imagem.origem} /> : null}
      <div className="q-card__topo">
        <span className="q-card__cliente" title={projeto ? `${cliente || "Sem cliente"} · ${projeto}` : cliente || undefined}>
          <MarcaCliente id={d.cliente} nome={cliente} />
          <span className="q-card__cliente-nome">{cliente ? <Realce texto={cliente} termos={termos} /> : "Sem cliente"}</span>
        </span>
        {podeEscrever ? (
          <button type="button" className="q-icone-btn q-card__mais" aria-label="Mover para…" title="Mover para…" onClick={() => mais(c.id)}>
            <Icone nome="pontos" size={16} />
          </button>
        ) : null}
      </div>
      <h3 className="q-card__tema">
        <Realce texto={d.tema} termos={termos} />
      </h3>
      {d.prazo || d.prioridade === "alta" || resp || selo ? (
        <div className="q-card__meta">
          <ChipPrazo d={d} />
          <ChipPrioridade p={d.prioridade} />
          <SeloDoCard selo={selo} aoTocar={() => abrir(c.id)} />
          {resp ? (
            <span className="q-card__fim">
              <AvatarPessoa pessoa={resp} />
            </span>
          ) : null}
        </div>
      ) : null}
      {px ? (
        <button type="button" className="q-card__passo" onClick={() => passo(c.id)} title={px.rotulo}>
          <span>{px.rotulo}</span>
          <Icone nome="seta" size={13} />
        </button>
      ) : null}
    </article>
  );
}, mesmoCartao);

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

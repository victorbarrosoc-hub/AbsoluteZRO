"use client";
/**
 * As colunas do Quadro na tela (drizzle/0024, só administração e gestão mudam; o banco confere de novo):
 * - `CampoNome`: o nome editável no lugar (Enter ou sair salva; Esc desiste; vazio não vale; até 30 letras);
 * - `NomeDaColuna`: o título da coluna no computador (clique duplo renomeia);
 * - `EditarColunas`: a folha "Editar colunas" (a mesma `Folha` da ficha) com renomear, cor, reordenar (alça: com o
 *   mouse arrasta na hora; no toque, segura 280 ms como o card; setas do teclado também), arquivar levando os cards,
 *   "Nova coluna", as arquivadas para restaurar e "Restaurar padrão".
 * As 8 colunas do método mostram um cadeado discreto com o porquê (`USO_DO_PAPEL`) no lugar de "Arquivar".
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  CORES_COLUNA,
  LIMITE_NOME_COLUNA,
  USO_DO_PAPEL,
  colunasArquivadas,
  colunasVivas,
  moverNaLista,
  nomeDeColuna,
  type Coluna,
  type CorColuna,
} from "@/lib/quadro/colunas";
import type { ColunaId } from "@/lib/quadro/metodo";
import { Icone } from "@/components/icones";
import { Folha, useFecharFolha } from "@/components/folha";

const SEGURAR_MS = 280;
const vibrar = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

/** O nome no lugar: Enter ou sair salva, Esc desiste. Vazio não salva (Enter avisa; sair desiste). */
export function CampoNome({
  nome,
  aoSalvar,
  aoCancelar,
  rotulo,
  className = "",
}: {
  nome: string;
  aoSalvar: (nome: string) => void;
  aoCancelar: () => void;
  rotulo: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState(nome);
  const [erro, setErro] = useState(false);
  const feito = useRef(false);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);
  const terminar = (salvar: boolean) => {
    if (feito.current) return;
    const n = nomeDeColuna(valor);
    if (salvar && !n) {
      setErro(true);
      return;
    }
    feito.current = true;
    if (salvar && n && n !== nome) aoSalvar(n);
    else aoCancelar();
  };
  return (
    <input
      ref={ref}
      className={`q-nome-campo ${className}`.trim()}
      aria-label={rotulo}
      aria-invalid={erro || undefined}
      value={valor}
      maxLength={LIMITE_NOME_COLUNA}
      enterKeyHint="done"
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => {
        setErro(false);
        setValor(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          terminar(true);
        } else if (e.key === "Escape") {
          // Esc só desiste do nome (a folha em volta não fecha)
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          terminar(false);
        }
      }}
      onBlur={() => {
        // sair com o campo vazio desiste (nada de coluna sem nome)
        if (!nomeDeColuna(valor)) terminar(false);
        else terminar(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}

/** O título da coluna no computador: clique duplo renomeia (administração e gestão). */
export function NomeDaColuna({ coluna, podeEditar, aoRenomear }: { coluna: Coluna; podeEditar: boolean; aoRenomear: (nome: string) => void }) {
  const [editando, setEditando] = useState(false);
  if (editando)
    return (
      <CampoNome
        nome={coluna.nome}
        rotulo={`Nome da coluna ${coluna.nome}`}
        className="q-col__nome"
        aoSalvar={(n) => {
          setEditando(false);
          aoRenomear(n);
        }}
        aoCancelar={() => setEditando(false)}
      />
    );
  return (
    <h2 onDoubleClick={podeEditar ? () => setEditando(true) : undefined} title={podeEditar ? "Clique duas vezes para renomear" : undefined}>
      {coluna.nome}
    </h2>
  );
}

export type AcoesDeColunas = {
  renomear: (id: ColunaId, nome: string) => void;
  recolorir: (id: ColunaId, cor: CorColuna) => void;
  ordenar: (ids: ColunaId[]) => void;
  criar: (nome: string, cor: CorColuna) => Promise<ColunaId | null>;
  arquivar: (id: ColunaId, destino: ColunaId) => Promise<boolean>;
  restaurar: (id: ColunaId) => void;
  padrao: () => void;
};

function BotaoPronto() {
  const fechar = useFecharFolha();
  return (
    <button type="button" className="glass-btn glass-btn--ink qc-pronto" onClick={fechar}>
      Pronto
    </button>
  );
}

/** A folha "Editar colunas". `contagem`: quantos cards (vivos) há em cada coluna. */
export function EditarColunas({
  colunas,
  contagem,
  acoes,
  aoFechar,
}: {
  colunas: Coluna[];
  contagem: Record<string, number>;
  acoes: AcoesDeColunas;
  aoFechar: () => void;
}) {
  return (
    <Folha rotulo="Editar colunas" aoFechar={aoFechar} tamanho="acao" className="q-folha qc-folha">
      <Lista colunas={colunas} contagem={contagem} acoes={acoes} />
    </Folha>
  );
}

type Arrasto = {
  id: ColunaId;
  li: HTMLElement;
  itens: HTMLElement[];
  tops: number[];
  alturas: number[];
  de: number;
  para: number;
  y0: number;
  passo: number;
};

function Lista({ colunas, contagem, acoes }: { colunas: Coluna[]; contagem: Record<string, number>; acoes: AcoesDeColunas }) {
  const vivas = colunasVivas(colunas);
  const arquivadas = colunasArquivadas(colunas);
  const ids = vivas.map((c) => c.id);
  const lista = useRef<HTMLOListElement>(null);
  const [paleta, setPaleta] = useState<ColunaId | null>(null);
  const [arquivando, setArquivando] = useState<ColunaId | null>(null);
  const [nova, setNova] = useState(false);
  const [confirmarPadrao, setConfirmarPadrao] = useState(false);
  const [focoAlca, setFocoAlca] = useState<ColunaId | null>(null);
  const arr = useRef<Arrasto | null>(null);
  const espera = useRef<{ timer: number; x: number; y: number } | null>(null);
  const idTitulo = useId();

  // depois de mover pelo teclado, o foco volta para a alça da mesma coluna
  useLayoutEffect(() => {
    if (!focoAlca) return;
    lista.current?.querySelector<HTMLElement>(`[data-alca="${focoAlca}"]`)?.focus({ preventScroll: true });
  }, [focoAlca, colunas]);

  const soltar = (gravar: boolean) => {
    const a = arr.current;
    arr.current = null;
    const el = lista.current;
    if (!a || !el) return;
    el.dataset.semMola = "";
    for (const it of a.itens) it.style.transform = "";
    delete a.li.dataset.erguida;
    delete el.dataset.arrastando;
    requestAnimationFrame(() => delete el.dataset.semMola);
    if (gravar && a.para !== a.de) acoes.ordenar(moverNaLista(ids, a.id, a.para));
  };

  const erguer = (id: ColunaId, alca: HTMLElement, pid: number, y0: number) => {
    const el = lista.current;
    const li = alca.closest<HTMLElement>("li[data-col]");
    if (!el || !li) return;
    const itens = [...el.querySelectorAll<HTMLElement>(":scope > li[data-col]")];
    const rects = itens.map((x) => x.getBoundingClientRect());
    const de = itens.indexOf(li);
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
    arr.current = { id, li, itens, tops: rects.map((r) => r.top), alturas: rects.map((r) => r.height), de, para: de, y0, passo: rects[de].height + gap };
    try {
      alca.setPointerCapture(pid);
    } catch {}
    li.dataset.erguida = "";
    el.dataset.arrastando = "";
    setPaleta(null);
    setArquivando(null);
    vibrar(10);
  };

  const mover = (y: number) => {
    const a = arr.current;
    if (!a) return;
    const dy = y - a.y0;
    a.li.style.transform = `translateY(${dy}px)`;
    const centro = a.tops[a.de] + a.alturas[a.de] / 2 + dy;
    let para = 0;
    a.itens.forEach((_, i) => {
      if (i !== a.de && a.tops[i] + a.alturas[i] / 2 < centro) para++;
    });
    a.para = para;
    a.itens.forEach((it, i) => {
      if (i === a.de) return;
      let d = 0;
      if (a.de < para && i > a.de && i <= para) d = -a.passo;
      else if (para < a.de && i >= para && i < a.de) d = a.passo;
      it.style.transform = d ? `translateY(${d}px)` : "";
    });
  };

  const aoDescerNaAlca = (e: React.PointerEvent<HTMLButtonElement>, id: ColunaId) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const alca = e.currentTarget;
    const { pointerId: pid, clientY: y, clientX: x } = e;
    if (e.pointerType === "mouse") {
      e.preventDefault();
      erguer(id, alca, pid, y);
      return;
    }
    // no toque, segurar 280 ms ergue (como o card); mexer antes é rolar a lista
    const timer = window.setTimeout(() => {
      espera.current = null;
      erguer(id, alca, pid, y);
    }, SEGURAR_MS);
    espera.current = { x, y, timer };
  };
  const aoMoverNaAlca = (e: React.PointerEvent<HTMLButtonElement>) => {
    const w = espera.current;
    if (w && Math.hypot(e.clientX - w.x, e.clientY - w.y) > 8) {
      clearTimeout(w.timer);
      espera.current = null;
    }
    if (arr.current) mover(e.clientY);
  };
  const aoSubirNaAlca = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (espera.current) {
      clearTimeout(espera.current.timer);
      espera.current = null;
    }
    soltar(e.type === "pointerup");
  };
  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current.timer);
    },
    [],
  );

  const moverPeloTeclado = (e: React.KeyboardEvent, id: ColunaId) => {
    const i = ids.indexOf(id);
    const para = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
    if (para === null) return;
    e.preventDefault();
    if (para < 0 || para >= ids.length) return;
    setFocoAlca(id);
    acoes.ordenar(moverNaLista(ids, id, para));
  };

  return (
    <div className="q-folha__corpo qc">
      <h2 className="q-folha__titulo" id={idTitulo}>
        Editar colunas
      </h2>
      <ol ref={lista} className="qc-lista" aria-labelledby={idTitulo}>
        {vivas.map((c) => (
          <li key={c.id} data-col={c.id} data-cor={c.cor} data-sistema={c.papel ? "" : undefined}>
            <div className="qc-linha">
              <button
                type="button"
                className="qc-alca"
                data-alca={c.id}
                aria-label={`Mover ${c.nome}`}
                title="Arraste para mudar a ordem"
                onPointerDown={(e) => aoDescerNaAlca(e, c.id)}
                onPointerMove={aoMoverNaAlca}
                onPointerUp={aoSubirNaAlca}
                onPointerCancel={aoSubirNaAlca}
                onKeyDown={(e) => moverPeloTeclado(e, c.id)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Icone nome="alca" size={18} />
              </button>
              <button
                type="button"
                className="qc-cor"
                aria-label={`Cor de ${c.nome}`}
                aria-expanded={paleta === c.id}
                onClick={() => {
                  setArquivando(null);
                  setPaleta((p) => (p === c.id ? null : c.id));
                }}
              >
                <i className="q-ponto" aria-hidden="true" />
              </button>
              <NomeNaLista key={c.nome} coluna={c} aoSalvar={(n) => acoes.renomear(c.id, n)} />
              {c.papel ? (
                <span className="qc-selo" title={USO_DO_PAPEL[c.papel]}>
                  <Icone nome="cadeado" size={14} />
                  <span className="sr-only">{USO_DO_PAPEL[c.papel]}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="q-icone-btn qc-arquivar"
                  aria-label={`Arquivar ${c.nome}`}
                  title="Arquivar"
                  aria-expanded={arquivando === c.id}
                  onClick={() => {
                    setPaleta(null);
                    setArquivando((a) => (a === c.id ? null : c.id));
                  }}
                >
                  <Icone nome="arquivar" size={17} />
                </button>
              )}
            </div>
            {paleta === c.id ? <Paleta atual={c.cor} nome={c.nome} aoEscolher={(cor) => acoes.recolorir(c.id, cor)} /> : null}
            {arquivando === c.id ? (
              <Arquivar
                coluna={c}
                n={contagem[c.id] ?? 0}
                outras={vivas.filter((o) => o.id !== c.id)}
                aoCancelar={() => setArquivando(null)}
                aoArquivar={async (destino) => {
                  if (await acoes.arquivar(c.id, destino)) setArquivando(null);
                }}
              />
            ) : null}
          </li>
        ))}
      </ol>

      {nova ? (
        <div className="qc-nova">
          <CampoNome
            nome=""
            rotulo="Nome da nova coluna"
            aoCancelar={() => setNova(false)}
            aoSalvar={async (n) => {
              setNova(false);
              const usadas = new Set(vivas.map((c) => c.cor));
              const cor = CORES_COLUNA.find((x) => !usadas.has(x.k))?.k ?? "grafite";
              await acoes.criar(n, cor);
            }}
          />
        </div>
      ) : (
        <button type="button" className="glass-btn qc-nova-btn" onClick={() => setNova(true)}>
          <Icone nome="mais" size={16} /> Nova coluna
        </button>
      )}

      {arquivadas.length ? (
        <section className="qc-arquivadas" aria-label="Arquivadas">
          <h3>Arquivadas</h3>
          <ul>
            {arquivadas.map((c) => (
              <li key={c.id} data-cor={c.cor}>
                <i className="q-ponto" aria-hidden="true" />
                <span>{c.nome}</span>
                <button type="button" className="glass-btn glass-btn--sm" onClick={() => acoes.restaurar(c.id)} aria-label={`Restaurar ${c.nome}`}>
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="qc-pe">
        {confirmarPadrao ? (
          <div className="qc-confirma" role="group" aria-label="Restaurar padrão">
            <p>Nomes, cores e ordem do método voltam. Nenhum card muda.</p>
            <div className="acoes">
              <button
                type="button"
                className="glass-btn glass-btn--sm glass-btn--ink"
                onClick={() => {
                  setConfirmarPadrao(false);
                  acoes.padrao();
                }}
              >
                Restaurar
              </button>
              <button type="button" className="glass-btn glass-btn--sm" onClick={() => setConfirmarPadrao(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="q-limpar qc-padrao" onClick={() => setConfirmarPadrao(true)}>
            Restaurar padrão
          </button>
        )}
        <BotaoPronto />
      </div>
    </div>
  );
}

/** O nome na lista da folha: um campo sempre à mão (grava ao sair ou com Enter; Esc volta ao nome de antes). */
function NomeNaLista({ coluna, aoSalvar }: { coluna: Coluna; aoSalvar: (n: string) => void }) {
  const [valor, setValor] = useState(coluna.nome);
  const [erro, setErro] = useState(false);
  const voltar = useRef(false);
  return (
    <input
      className="q-nome-campo qc-nome"
      aria-label={`Nome da coluna ${coluna.nome}`}
      aria-invalid={erro || undefined}
      value={valor}
      maxLength={LIMITE_NOME_COLUNA}
      enterKeyHint="done"
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => {
        setErro(false);
        setValor(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (!nomeDeColuna(valor)) setErro(true);
          else e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          voltar.current = true;
          setValor(coluna.nome);
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const n = nomeDeColuna(valor);
        if (voltar.current || !n) {
          voltar.current = false;
          setErro(false);
          setValor(coluna.nome);
          return;
        }
        setValor(n);
        if (n !== coluna.nome) aoSalvar(n);
      }}
    />
  );
}

function Paleta({ atual, nome, aoEscolher }: { atual: CorColuna; nome: string; aoEscolher: (c: CorColuna) => void }) {
  return (
    <div className="qc-paleta" role="radiogroup" aria-label={`Cor de ${nome}`}>
      {CORES_COLUNA.map((c) => (
        <button
          key={c.k}
          type="button"
          role="radio"
          data-cor={c.k}
          aria-checked={c.k === atual}
          aria-label={c.nome}
          title={c.nome}
          onClick={() => aoEscolher(c.k)}
        >
          <i aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function Arquivar({
  coluna,
  n,
  outras,
  aoCancelar,
  aoArquivar,
}: {
  coluna: Coluna;
  n: number;
  outras: Coluna[];
  aoCancelar: () => void;
  aoArquivar: (destino: ColunaId) => void;
}) {
  const [destino, setDestino] = useState<ColunaId>(outras[0]?.id ?? "pauta");
  const [indo, setIndo] = useState(false);
  const id = useId();
  return (
    <div className="qc-arquivar-painel" role="group" aria-label={`Arquivar ${coluna.nome}`}>
      {n ? <label htmlFor={id}>{n === 1 ? "Levar o card para" : `Levar os ${n} cards para`}</label> : <p>Sem cards. Os que chegarem antes vão para:</p>}
      <select id={id} value={destino} onChange={(e) => setDestino(e.currentTarget.value)} aria-label="Levar os cards para">
        {outras.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      <div className="acoes">
        <button
          type="button"
          className="glass-btn glass-btn--sm glass-btn--ink"
          disabled={indo}
          onClick={() => {
            setIndo(true);
            aoArquivar(destino);
            setTimeout(() => setIndo(false), 1200);
          }}
        >
          Arquivar
        </button>
        <button type="button" className="glass-btn glass-btn--sm" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

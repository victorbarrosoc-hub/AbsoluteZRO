"use client";
/**
 * O editor do Roteiro (plano da Criação §4.3, fase F2): título, selo do estado, medidor de tempo contra o alvo, o
 * seletor de vistas (Literário · Técnico · Teleprompter · Edição, todas do mesmo documento) e uma ação principal:
 * "Enviar" para administração e gestão (TPeasy, PDF para a edição, PDF; sempre de uma versão salva, `enviar.tsx`) e
 * "Salvar versão" para o resto da equipe (e ao lado do Enviar). Grava sozinho (`useGravacao`: 600 ms, `rev`, junção no conflito, poll de 5 s). No iPhone: uma cena por
 * vez, o "+" abre os tipos em ícones grandes, segurar 280 ms arrasta; a prévia do Teleprompter lê bem no preto.
 * Trocar de vista é um cross-fade curto (nada com "reduzir movimento").
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { resumoDoBloco } from "@/lib/criacao/roteiro/comparar";
import { acharBloco, inserirNoFim, novaCena } from "@/lib/criacao/roteiro/editar";
import type { Conflito } from "@/lib/criacao/roteiro/juntar";
import { NOME_TIPO_BLOCO, type Bloco, type Roteiro, type TipoBloco, TIPOS_BLOCO } from "@/lib/criacao/roteiro/modelo";
import { NOME_ESTADO_ROTEIRO, type EstadoRoteiro } from "@/lib/criacao/roteiro/nomes";
import type { RoteiroCompleto, VersaoLista } from "@/lib/criacao/roteiro/servidor";
import { formatarTempo, linhaDoTempo, medidor } from "@/lib/criacao/roteiro/tempo";
import { COLUNAS_TECNICO, type ColunaTecnico, VISTAS, type Vista } from "@/lib/criacao/roteiro/vistas";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { FolhaAjustes } from "./ajustes";
import { STATUS_DO_ESTADO, textoAlvo } from "./comum";
import { Contexto, type EditorCtx, type Foco, ICONE_TIPO, type Operacoes } from "./contexto";
import { useGravacao } from "./gravacao";
import { type DestinoEnvio, FolhaEnviar, FolhaMenuEnviar, MenuEnviar } from "./enviar";
import { ListaEdicao, PreviaTeleprompter } from "./leitura";
import { VistaLiterarioEditor } from "./literario";
import type { OpcoesVinculo } from "./novo";
import { VistaTecnicoEditor } from "./tecnico";
import { FolhaVersoes } from "./versoes";

type Props = {
  inicial: RoteiroCompleto;
  versoes: VersaoLista[];
  opcoes: OpcoesVinculo;
  editavel: boolean;
  podeEstado: boolean;
  /** Administração e gestão: "Enviar" (podeEnviarCriacao). */
  podeEnviar: boolean;
  /** O AEON está aberto para a pessoa (podeMandarParaAeon): só então a opção aparece. */
  aeon: boolean;
  vistaInicial: Vista;
  eu: string;
  nomes: Record<string, string>;
};

const CURTO: Record<Vista, string> = { literario: "Literário", tecnico: "Técnico", teleprompter: "TP", edicao: "Edição" };
const CHAVE_COLUNAS = "maestro:criacao:colunas-ocultas";
const TEXTO_GRAVACAO = { salvo: "Salvo", pendente: "Editando…", salvando: "Salvando…", offline: "Sem conexão", erro: "Não salvou" } as const;

/**
 * Folha "Adicionar" do iPhone: os tipos em ícones grandes e "Cena nova". O bloco nasce depois que a folha fecha (ao
 * fechar, a folha devolve o foco a quem a abriu; o bloco novo precisa ficar com ele).
 */
function FolhaAdicionar({ aoEscolher, aoFechar }: { aoEscolher: (t: TipoBloco | "cena") => void; aoFechar: () => void }) {
  const escolhido = useRef<TipoBloco | "cena" | null>(null);
  return (
    <Folha
      rotulo="Adicionar"
      aoFechar={() => {
        aoFechar();
        const t = escolhido.current;
        if (t) setTimeout(() => aoEscolher(t), 40);
      }}
      tamanho="acao"
      className="cr-mais-folha"
    >
      <Grade aoEscolher={(t) => (escolhido.current = t)} />
    </Folha>
  );
}
function Grade({ aoEscolher }: { aoEscolher: (t: TipoBloco | "cena") => void }) {
  const fechar = useFecharFolha();
  return (
    <div className="cr-mais-grade">
      {[...TIPOS_BLOCO, "cena" as const].map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            aoEscolher(t);
            fechar();
          }}
        >
          <Icone nome={t === "cena" ? "cena" : ICONE_TIPO[t]} size={26} />
          <span>{t === "cena" ? "Cena nova" : NOME_TIPO_BLOCO[t]}</span>
        </button>
      ))}
    </div>
  );
}

/** O que mudou dos dois lados ao mesmo tempo: as duas versões e "Ficar com o meu". */
function FolhaConflitos({
  conflitos,
  quem,
  roteiro,
  mudar,
  aoFechar,
}: {
  conflitos: Conflito[];
  quem: string;
  roteiro: Roteiro;
  mudar: (fn: (r: Roteiro) => Roteiro) => void;
  aoFechar: () => void;
}) {
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const blocos = conflitos.filter((c): c is Extract<Conflito, { tipo: "bloco" }> => c.tipo === "bloco");
  const outros = conflitos.length - blocos.length;
  const resumo = (b: Bloco | null) => (b ? resumoDoBloco(roteiro, b) : null);
  const ficarComOMeu = (c: Extract<Conflito, { tipo: "bloco" }>) => {
    mudar((r) => {
      if (!c.meu) return { ...r, cenas: r.cenas.map((x) => ({ ...x, blocos: x.blocos.filter((b) => b.id !== c.id) })) };
      if (!acharBloco(r, c.id)) return r;
      return { ...r, cenas: r.cenas.map((x) => ({ ...x, blocos: x.blocos.map((b) => (b.id === c.id ? c.meu! : b)) })) };
    });
    setFeitos((s) => new Set(s).add(c.id));
  };
  return (
    <Folha rotulo="Mudou ao mesmo tempo" aoFechar={aoFechar} tamanho="acao" className="cr-conflitos">
      <h2 className="cr-folha__titulo">{quem} mudou ao mesmo tempo</h2>
      <ul className="cr-conflitos__lista">
        {blocos.map((c) => {
          const m = resumo(c.meu);
          const d = resumo(c.deles);
          return (
            <li key={c.id}>
              <b>{(d ?? m)?.rotulo}</b>
              <p>
                <span className="sutil">{quem}:</span> {d ? d.texto || "(vazio)" : "apagou"}
              </p>
              <p>
                <span className="sutil">Você:</span> {m ? m.texto || "(vazio)" : "apagou"}
              </p>
              {feitos.has(c.id) ? (
                <span className="sutil">Ficou o seu.</span>
              ) : (
                <button type="button" className="glass-btn glass-btn--sm" onClick={() => ficarComOMeu(c)}>
                  Ficar com o meu
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {outros ? (
        <p className="sutil">
          Mais {outros} ajuste(s) de cena, elenco ou formato ficaram como {quem} deixou.
        </p>
      ) : null}
    </Folha>
  );
}

export function EditorRoteiro({ inicial, versoes, opcoes, editavel, podeEstado, podeEnviar, aeon, vistaInicial, nomes }: Props) {
  const router = useRouter();
  const url = `/api/criacao/roteiros/${inicial.id}`;
  const g = useGravacao(inicial.id, inicial, editavel);
  const { roteiro } = g;
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [cena, setCena] = useState(0);
  const [pessoaTp, setPessoaTp] = useState<string | null>(null);
  const [ocultar, setOcultar] = useState<ColunaTecnico[]>([]);
  const [folha, setFolha] = useState<null | "versoes" | "ajustes" | "adicionar" | "conflitos" | "menu">(null);
  const [envio, setEnvio] = useState<DestinoEnvio | null>(null);
  const [lista, setLista] = useState(versoes);
  const [vinculo, setVinculo] = useState({ projetoId: inicial.projetoId, cardId: inicial.cardId, projeto: inicial.projeto, card: inicial.card });
  const foco = useRef<Foco | null>(null);
  const [tique, setTique] = useState(0);
  const roteiroRef = useRef(roteiro);
  useEffect(() => {
    roteiroRef.current = roteiro;
  });

  // colunas escondidas do Técnico: preferência de quem vê (só neste aparelho)
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_COLUNAS) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê a preferência do aparelho depois de montar
      if (Array.isArray(v)) setOcultar(v.filter((x): x is ColunaTecnico => COLUNAS_TECNICO.includes(x)));
    } catch {}
  }, []);
  const alternarColuna = (c: ColunaTecnico) =>
    setOcultar((o) => {
      const n = o.includes(c) ? o.filter((x) => x !== c) : [...o, c];
      try {
        localStorage.setItem(CHAVE_COLUNAS, JSON.stringify(n));
      } catch {}
      return n;
    });

  const { mudar: mudarDoc } = g;
  const ops = useMemo<Operacoes>(
    () => ({
      mudar: (fn, f) => {
        mudarDoc(fn);
        if (f) {
          foco.current = f;
          setTique((t) => t + 1);
        }
      },
      focar: (f) => {
        foco.current = f;
        setTique((t) => t + 1);
      },
      adicionar: () => setFolha("adicionar"),
    }),
    [mudarDoc],
  );
  const ctx = useMemo<EditorCtx>(() => ({ ops, pessoas: roteiro.pessoas, editavel }), [ops, roteiro.pessoas, editavel]);

  const total = roteiro.cenas.length;
  const atual = Math.min(cena, total - 1);

  // foco pedido por uma operação (bloco novo, tipo trocado): depois do desenho; no iPhone, vai para a cena dele
  useLayoutEffect(() => {
    const f = foco.current;
    if (!f) return;
    const onde = acharBloco(roteiroRef.current, f.id);
    if (onde && onde.cena !== atual && vista === "literario") {
      setCena(onde.cena);
      return;
    }
    const el = document.querySelector<HTMLTextAreaElement>(`textarea[data-campo="${CSS.escape(f.id)}"]`);
    if (!el) return;
    foco.current = null;
    el.focus({ preventScroll: true });
    const p = f.onde === "inicio" ? 0 : el.value.length;
    el.setSelectionRange(p, p);
    el.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [tique, roteiro, atual, vista]);

  const tempo = useMemo(() => linhaDoTempo(roteiro), [roteiro]);
  const m = medidor(tempo.totalSeg, roteiro.alvo);

  const trocarVista = (v: Vista) => {
    setVista(v);
    const q = new URL(window.location.href);
    q.searchParams.set("vista", v);
    window.history.replaceState(window.history.state, "", q);
  };

  const adicionarNoFim = useCallback(
    (cenaId: string, tipo: TipoBloco) => {
      let id = "";
      ops.mudar((r) => {
        const x = inserirNoFim(r, cenaId, tipo);
        id = x.id;
        return x.roteiro;
      });
      if (id) ops.focar({ id, onde: "inicio" });
    },
    [ops],
  );

  const escolherNoMais = (t: TipoBloco | "cena") => {
    if (t === "cena") {
      let id = "";
      ops.mudar((r) => {
        const x = novaCena(r, r.cenas[atual]?.id ?? null);
        id = x.blocoId;
        return x.roteiro;
      });
      setCena(atual + 1);
      if (id) ops.focar({ id });
      return;
    }
    const c = roteiro.cenas[atual];
    if (c) adicionarNoFim(c.id, t);
  };

  async function post(corpo: Record<string, unknown>) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const d = (await r.json().catch(() => ({}))) as { mensagem?: string; roteiro?: RoteiroCompleto };
    return { ok: r.ok, ...d };
  }

  const imprimir = async () => {
    await g.gravar();
    const v = vista;
    const q = new URLSearchParams({ vista: v });
    if (v === "teleprompter" && pessoaTp) q.set("pessoa", pessoaTp);
    if (v === "tecnico" && ocultar.length) q.set("ocultar", ocultar.join(","));
    router.push(`/app/criacao/roteiros/${inicial.id}/imprimir?${q}`);
  };

  const ligacao = [vinculo.projeto, vinculo.card].filter(Boolean).join(" · ");
  const quem = g.aviso?.quem ? (nomes[g.aviso.quem] ?? "Outra pessoa") : "Outra pessoa";

  return (
    <Contexto.Provider value={ctx}>
      <div className="pagina pagina--larga cr-editor" data-vista={vista}>
        <div className="cr-topo">
          <Link className="voltar" href="/app/criacao" onClick={() => void g.gravar()}>
            <Icone nome="voltar" size={16} /> Criação
          </Link>
          <span className="cr-topo__acoes">
            {podeEnviar ? (
              <button type="button" className="glass-btn glass-btn--icone glass-btn--ink cr-so-celular" onClick={() => setFolha("menu")} aria-label="Enviar">
                <Icone nome="compartilhar" size={18} />
              </button>
            ) : null}
            <button
              type="button"
              className="glass-btn glass-btn--icone cr-so-celular"
              onClick={() => setFolha("versoes")}
              aria-label={editavel ? "Salvar versão" : "Versões"}
            >
              <Icone nome="versoes" size={18} />
            </button>
            <button
              type="button"
              className="glass-btn glass-btn--icone cr-so-celular"
              onClick={() => void imprimir()}
              aria-label="Imprimir ou PDF"
              title="Imprimir ou PDF"
            >
              <Icone nome="imprimir" size={18} />
            </button>
            <button type="button" className="glass-btn glass-btn--icone cr-so-celular" onClick={() => setFolha("ajustes")} aria-label="Ajustes do roteiro">
              <Icone nome="pontos" size={20} />
            </button>
          </span>
        </div>

        <header className="cr-cabeca">
          <div className="cr-cabeca__miolo">
            <input
              className="cr-titulo"
              value={g.titulo}
              onChange={(e) => g.mudarTitulo(e.target.value)}
              onBlur={() => void g.gravar()}
              readOnly={!editavel}
              maxLength={200}
              aria-label="Título do roteiro"
              placeholder="Título"
            />
            <div className="cr-cabeca__meta">
              <span className="selo" data-status={STATUS_DO_ESTADO[g.meta.estado]}>
                <i aria-hidden="true" />
                {g.meta.versaoAtual ? `v${g.meta.versaoAtual} · ` : ""}
                {NOME_ESTADO_ROTEIRO[g.meta.estado as EstadoRoteiro]}
              </span>
              <span className="cr-cabeca__formato">{[roteiro.formato, textoAlvo(roteiro.alvo)].filter(Boolean).join(" · ")}</span>
              <span className="cr-medidor cr-medidor--topo" data-estado={m.estado} aria-hidden="true">
                <i style={{ width: `${Math.round(m.fracao * 100)}%` }} />
              </span>
              <b className="cr-cabeca__total num" title="Duração estimada" data-estado={m.estado}>
                {formatarTempo(tempo.totalSeg)}
              </b>
              {ligacao ? (
                <span className="cr-cabeca__ligacao">
                  <Icone nome="link" size={13} /> {vinculo.projetoId ? <Link href={`/app/projetos/${vinculo.projetoId}`}>{ligacao}</Link> : ligacao}
                </span>
              ) : null}
              {editavel ? (
                <span className="cr-gravacao" data-estado={g.estado} role="status" aria-live="polite" title={g.mensagem ?? undefined}>
                  {g.estado === "erro" && g.mensagem ? g.mensagem : TEXTO_GRAVACAO[g.estado]}
                </span>
              ) : (
                <span className="cr-gravacao">Só leitura</span>
              )}
            </div>
          </div>
          <div className="cr-cabeca__lado">
            <div className="q-segmentos cr-vistas" role="radiogroup" aria-label="Vista">
              {VISTAS.map((v) => (
                <button key={v.k} type="button" role="radio" aria-checked={vista === v.k} aria-label={v.nome} onClick={() => trocarVista(v.k)}>
                  <span className="cr-vistas__longo">{v.nome}</span>
                  <span className="cr-vistas__curto" aria-hidden="true">
                    {CURTO[v.k]}
                  </span>
                </button>
              ))}
            </div>
            <div className="acoes cr-cabeca__acoes">
              {podeEnviar ? <MenuEnviar aeon={aeon} escolher={setEnvio} salvarVersao={() => setFolha("versoes")} /> : null}
              <button type="button" className={`glass-btn${podeEnviar ? "" : " glass-btn--ink"}`} onClick={() => setFolha("versoes")}>
                <Icone nome="versoes" size={17} /> {editavel ? "Salvar versão" : "Versões"}
              </button>
              <button
                type="button"
                className="glass-btn glass-btn--icone cr-so-computador"
                onClick={() => void imprimir()}
                aria-label="Imprimir ou PDF"
                title="Imprimir ou PDF"
              >
                <Icone nome="imprimir" size={18} />
              </button>
              <button
                type="button"
                className="glass-btn glass-btn--icone cr-so-computador"
                onClick={() => setFolha("ajustes")}
                aria-label="Ajustes do roteiro"
                title="Ajustes do roteiro"
              >
                <Icone nome="pontos" size={20} />
              </button>
            </div>
          </div>
        </header>

        {g.aviso ? (
          <div className="cr-aviso" role="status">
            <Icone nome="alerta" size={16} />
            <span>
              {quem} mudou {g.aviso.conflitos.length === 1 ? "um trecho" : `${g.aviso.conflitos.length} trechos`} ao mesmo tempo. Ficou o dele.
            </span>
            <button type="button" className="glass-btn glass-btn--sm" onClick={() => setFolha("conflitos")}>
              Ver
            </button>
            <button type="button" className="cr-icone" onClick={() => g.setAviso(null)} aria-label="Fechar aviso">
              <Icone nome="fechar" size={15} />
            </button>
          </div>
        ) : null}

        <div className="cr-corpo" key={vista}>
          {vista === "literario" ? (
            <VistaLiterarioEditor cenas={roteiro.cenas} tempos={tempo.cenas} atual={atual} irPara={setCena} adicionarNoFim={adicionarNoFim} />
          ) : vista === "tecnico" ? (
            <VistaTecnicoEditor roteiro={roteiro} tempos={tempo.cenas} ocultar={ocultar} alternar={alternarColuna} adicionarNoFim={adicionarNoFim} />
          ) : vista === "teleprompter" ? (
            <PreviaTeleprompter roteiro={roteiro} pessoa={pessoaTp} escolher={setPessoaTp} />
          ) : (
            <ListaEdicao roteiro={roteiro} />
          )}
        </div>

        {editavel && vista === "literario" ? (
          <button type="button" className="cr-fab" onClick={() => setFolha("adicionar")} aria-label="Adicionar bloco">
            <Icone nome="mais" size={26} />
          </button>
        ) : null}

        {folha === "adicionar" ? <FolhaAdicionar aoEscolher={escolherNoMais} aoFechar={() => setFolha(null)} /> : null}
        {folha === "versoes" ? (
          <FolhaVersoes
            url={url}
            versoes={lista}
            setVersoes={setLista}
            roteiro={roteiro}
            editavel={editavel}
            antes={async () => {
              await g.gravar();
              return g.rev();
            }}
            aoRestaurar={(r) => g.adotar(r)}
            aoSalvar={(n) => g.setMeta((x) => ({ ...x, versaoAtual: n }))}
            nomes={nomes}
            aoFechar={() => setFolha(null)}
          />
        ) : null}
        {folha === "menu" ? (
          <FolhaMenuEnviar
            aeon={aeon}
            escolher={setEnvio}
            salvarVersao={() => setFolha("versoes")}
            aoFechar={() => setFolha((f) => (f === "menu" ? null : f))}
          />
        ) : null}
        {envio ? (
          <FolhaEnviar
            key={envio}
            destino={envio}
            url={url}
            roteiroId={inicial.id}
            roteiro={roteiro}
            titulo={g.titulo}
            versoes={lista}
            setVersoes={setLista}
            antes={() => g.gravar()}
            aoSalvar={(n) => g.setMeta((x) => ({ ...x, versaoAtual: n }))}
            pessoa={pessoaTp}
            aoFechar={() => setEnvio(null)}
          />
        ) : null}
        {folha === "ajustes" ? (
          <FolhaAjustes
            roteiro={roteiro}
            mudar={(fn) => ops.mudar(fn)}
            editavel={editavel}
            podeEstado={podeEstado}
            estado={g.meta.estado}
            mudarEstado={async (e) => {
              const r = await post({ op: "estado", estado: e });
              if (r.ok) g.setMeta((x) => ({ ...x, estado: e }));
              return r.ok ? null : (r.mensagem ?? "Não deu para mudar o estado.");
            }}
            vinculo={vinculo}
            ligar={async (v) => {
              const r = await post({ op: "ligar", ...v });
              if (r.ok && r.roteiro) setVinculo({ projetoId: r.roteiro.projetoId, cardId: r.roteiro.cardId, projeto: r.roteiro.projeto, card: r.roteiro.card });
              return r.ok ? null : (r.mensagem ?? "Não deu para ligar.");
            }}
            opcoes={opcoes}
            lixeira={async () => {
              await g.gravar();
              const r = await post({ op: "lixeira", apagar: true });
              if (r.ok) {
                router.push("/app/criacao");
                router.refresh();
                return null;
              }
              return r.mensagem ?? "Não deu para mandar para a lixeira.";
            }}
            aoFechar={() => setFolha(null)}
          />
        ) : null}
        {folha === "conflitos" && g.aviso ? (
          <FolhaConflitos
            conflitos={g.aviso.conflitos}
            quem={quem}
            roteiro={roteiro}
            mudar={(fn) => ops.mudar(fn)}
            aoFechar={() => {
              setFolha(null);
              g.setAviso(null);
            }}
          />
        ) : null}
      </div>
    </Contexto.Provider>
  );
}

"use client";
/**
 * "Tempo": quanto cada tipo de vídeo leva (drizzle/0038). Um cartão por tipo com a média em destaque, a faixa típica
 * (p25–p75) e a mediana numa régua comum a todos os tipos (dá para comparar de olho), o número de vídeos, as horas e a
 * tendência da média por semana ou mês. A cor é a do tipo, sempre com o nome escrito; texto só em grafite/branco e
 * cinza. Filtros numa linha: período, cliente e pessoa (só administração e gestão veem o time). Cada marca tem a dica
 * com o valor. Os cartões e as barras entram uma vez (CSS), parados com "reduzir movimento".
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CORES_COLUNA } from "@/lib/quadro/colunas";
import { duracaoFalada, MIN, type EstatisticaTipo } from "@/lib/tempo/calculo";
import type { PainelTipos, Periodo } from "@/lib/tempo/servidor";
import { tiposParaEscolher, type TipoVideo } from "@/lib/tempo/tipos";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";

const PERIODOS: { k: Periodo; nome: string }[] = [
  { k: "30d", nome: "30 dias" },
  { k: "90d", nome: "90 dias" },
  { k: "12m", nome: "12 meses" },
  { k: "tudo", nome: "Tudo" },
];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloDoPeriodo = (p: string) => (p.length === 7 ? `${MES[Number(p.slice(5, 7)) - 1]}/${p.slice(2, 4)}` : `${Number(p.slice(8))}/${p.slice(5, 7)}`);
const horas = (ms: number) => {
  const h = ms / 3_600_000;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1).replace(".", ",")}h`;
};

export function PainelDeTempo({
  inicial,
  clientes,
  pessoas,
  tipos: tiposIniciais,
  time,
  podeMudarTipos,
  podeArquivarTipos,
}: {
  inicial: PainelTipos | null;
  clientes: { id: string; nome: string }[];
  pessoas: { sub: string; nome: string }[];
  tipos: TipoVideo[];
  time: boolean;
  podeMudarTipos: boolean;
  podeArquivarTipos: boolean;
}) {
  const [painel, setPainel] = useState(inicial);
  const [periodo, setPeriodo] = useState<Periodo>(inicial?.periodo ?? "90d");
  const [cliente, setCliente] = useState("");
  const [quem, setQuem] = useState(time ? "time" : "eu");
  const [carregando, setCarregando] = useState(false);
  const [tipos, setTipos] = useState(tiposIniciais);
  const [editar, setEditar] = useState(false);
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    let vivo = true;
    setCarregando(true);
    const q = new URLSearchParams({ tipos: "1", periodo, quem });
    if (cliente) q.set("cliente", cliente);
    fetch(`/api/tempo?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && d && setPainel(d))
      .catch(() => {})
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [periodo, cliente, quem, tipos]);

  const nomeTipo = (id: string | null) => (id ? (tipos.find((t) => t.id === id)?.nome ?? painel?.nomes.tipos[id]?.nome ?? "Tipo") : "Sem tipo");
  const corTipo = (id: string | null) => (id ? (tipos.find((t) => t.id === id)?.cor ?? painel?.nomes.tipos[id]?.cor) : "grafite");
  const lista = painel?.tipos ?? [];
  // a régua comum: do zero até um pouco além do maior p75 (ou da maior média)
  const teto = Math.max(60 * MIN, ...lista.map((t) => Math.max(t.p75Ms, t.mediaMs))) * 1.08;
  const totalVideos = lista.reduce((a, t) => a + t.videos, 0);
  const totalMs = lista.reduce((a, t) => a + t.totalMs, 0);

  return (
    <div className="pagina tp-pagina" aria-busy={carregando || undefined}>
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Tempo <strong>por tipo.</strong>
        </h1>
        {podeMudarTipos ? (
          <button type="button" className="glass-btn" onClick={() => setEditar(true)}>
            <Icone nome="editar" size={16} /> Tipos
          </button>
        ) : null}
      </header>

      <div className="tp-filtros">
        <div className="tp-seg" role="radiogroup" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.k} type="button" role="radio" aria-checked={periodo === p.k} onClick={() => setPeriodo(p.k)}>
              {p.nome}
            </button>
          ))}
        </div>
        <label className="q-filtro tp-filtro">
          <span className="sr-only">Cliente</span>
          <select value={cliente} data-ativo={cliente ? "" : undefined} onChange={(e) => setCliente(e.currentTarget.value)}>
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        {time ? (
          <label className="q-filtro tp-filtro">
            <span className="sr-only">Pessoa</span>
            <select value={quem} data-ativo={quem !== "time" ? "" : undefined} onChange={(e) => setQuem(e.currentTarget.value)}>
              <option value="time">O time todo</option>
              <option value="eu">Só eu</option>
              {pessoas.map((p) => (
                <option key={p.sub} value={p.sub}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {lista.length ? (
        <>
          <p className="tp-pagina__resumo">
            <strong>{totalVideos}</strong> {totalVideos === 1 ? "vídeo concluído" : "vídeos concluídos"} · <strong>{horas(totalMs)}</strong>
          </p>
          <div className="tp-cartoes">
            {lista.map((t, i) => (
              <CartaoTipo
                key={t.tipo ?? "sem"}
                e={t}
                nome={nomeTipo(t.tipo)}
                cor={corTipo(t.tipo) ?? "grafite"}
                teto={teto}
                i={i}
                granularidade={painel!.granularidade}
              />
            ))}
          </div>
          <p className="tp-sutil tp-pagina__nota">Só vídeos aprovados ou entregues, com tempo no cronômetro.</p>
        </>
      ) : (
        <div className="vazio tp-pagina__vazio">
          <span className="tp-vazio__icone" aria-hidden="true">
            <Icone nome="cronometro" size={22} />
          </span>
          <p>Nenhum vídeo concluído com tempo{periodo === "tudo" ? "" : " nesse período"}.</p>
          <Link className="glass-btn glass-btn--sm glass-btn--ink" href="/app/quadro">
            Abrir o Quadro
          </Link>
        </div>
      )}

      {editar ? <EditarTipos tipos={tipos} podeArquivar={podeArquivarTipos} aoMudar={setTipos} aoFechar={() => setEditar(false)} /> : null}
    </div>
  );
}

function CartaoTipo({
  e,
  nome,
  cor,
  teto,
  i,
  granularidade,
}: {
  e: EstatisticaTipo;
  nome: string;
  cor: string;
  teto: number;
  i: number;
  granularidade: "semana" | "mes";
}) {
  const pc = (ms: number) => `${Math.min(100, (ms / teto) * 100)}%`;
  const trend = e.tendencia.slice(-(granularidade === "semana" ? 13 : 12));
  const maxT = Math.max(...trend.map((p) => p.mediaMs ?? 0), 1);
  const faixa = `${duracaoFalada(e.p25Ms)}–${duracaoFalada(e.p75Ms)}`;
  return (
    <article
      className="tp-cartao"
      data-cor={cor}
      style={{ "--i": i } as CSSProperties}
      aria-label={`${nome}: em média ${duracaoFalada(e.mediaMs)}, ${faixa}, ${e.videos} vídeos`}
    >
      <header className="tp-cartao__topo">
        <span className="tp-cartao__nome">
          <i className="tp-tipo__ponto" data-cor={cor} aria-hidden="true" />
          {nome}
        </span>
        <span className="tp-cartao__n">
          {e.videos} {e.videos === 1 ? "vídeo" : "vídeos"}
        </span>
      </header>
      <p className="tp-cartao__media">
        <strong>{duracaoFalada(e.mediaMs)}</strong>
        <span>em média</span>
      </p>
      <p className="tp-cartao__faixa">
        {faixa} <span>· mediana {duracaoFalada(e.medianaMs)}</span>
      </p>
      <div className="tp-regua" role="img" aria-label={`Faixa típica ${faixa}, mediana ${duracaoFalada(e.medianaMs)}`}>
        <span className="tp-regua__trilho" />
        <span className="tp-regua__faixa" style={{ left: pc(e.p25Ms), width: `calc(${pc(e.p75Ms)} - ${pc(e.p25Ms)})` }} title={`Faixa típica: ${faixa}`} />
        <span className="tp-regua__mediana" style={{ left: pc(e.medianaMs) }} title={`Mediana: ${duracaoFalada(e.medianaMs)}`} />
        <span className="tp-regua__media" style={{ left: pc(e.mediaMs) }} title={`Média: ${duracaoFalada(e.mediaMs)}`} />
      </div>
      <div className="tp-tendencia" role="img" aria-label={`Média por ${granularidade === "semana" ? "semana" : "mês"}`}>
        {trend.map((p, k) => (
          <span
            key={p.periodo}
            className="tp-tendencia__barra"
            style={{ "--k": k } as CSSProperties}
            title={`${rotuloDoPeriodo(p.periodo)} · ${p.mediaMs === null ? "sem vídeo" : `${duracaoFalada(p.mediaMs)} · ${p.videos} ${p.videos === 1 ? "vídeo" : "vídeos"}`}`}
          >
            <i style={{ height: p.mediaMs === null ? 0 : `${Math.max(6, (p.mediaMs / maxT) * 100)}%` }} data-vazio={p.mediaMs === null || undefined} />
          </span>
        ))}
      </div>
      <footer className="tp-cartao__fim">
        <span>{horas(e.totalMs)} no período</span>
        <span>{granularidade === "semana" ? "por semana" : "por mês"}</span>
      </footer>
    </article>
  );
}

/* ───────────── editar os tipos ───────────── */

function EditarTipos({
  tipos,
  podeArquivar,
  aoMudar,
  aoFechar,
}: {
  tipos: TipoVideo[];
  podeArquivar: boolean;
  aoMudar: (t: TipoVideo[]) => void;
  aoFechar: () => void;
}) {
  return (
    <Folha rotulo="Tipos de vídeo" aoFechar={aoFechar} tamanho="acao" className="tp-editar">
      <CorpoEditar tipos={tipos} podeArquivar={podeArquivar} aoMudar={aoMudar} />
    </Folha>
  );
}

function CorpoEditar({ tipos, podeArquivar, aoMudar }: { tipos: TipoVideo[]; podeArquivar: boolean; aoMudar: (t: TipoVideo[]) => void }) {
  const fechar = useFecharFolha();
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const vivos = useMemo(() => tiposParaEscolher(tipos), [tipos]);
  const arquivados = tipos.filter((t) => t.arquivado);
  const pedir = async (corpo: Record<string, unknown>) => {
    setErro(null);
    const r = await fetch("/api/tempo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setErro(d.mensagem ?? "Não deu agora.");
      return false;
    }
    aoMudar(d.tipos);
    return true;
  };
  return (
    <div className="tp-editar__corpo">
      <h2>Tipos de vídeo</h2>
      <ul className="tp-editar__lista">
        {vivos.map((t) => (
          <li key={t.id} data-cor={t.cor}>
            <i className="tp-tipo__ponto" data-cor={t.cor} aria-hidden="true" />
            <input
              defaultValue={t.nome}
              maxLength={40}
              aria-label={`Nome de ${t.nome}`}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (v && v !== t.nome) void pedir({ op: "tipo_mudar", id: t.id, nome: v });
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <details className="tp-cores">
              <summary aria-label={`Cor de ${t.nome}`}>
                <i className="tp-tipo__ponto" data-cor={t.cor} />
              </summary>
              <div className="tp-cores__grade">
                {CORES_COLUNA.map((c) => (
                  <button
                    key={c.k}
                    type="button"
                    data-cor={c.k}
                    aria-label={c.nome}
                    aria-pressed={c.k === t.cor}
                    onClick={(e) => {
                      (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                      void pedir({ op: "tipo_mudar", id: t.id, cor: c.k });
                    }}
                  >
                    <i className="tp-tipo__ponto" data-cor={c.k} />
                  </button>
                ))}
              </div>
            </details>
            {podeArquivar ? (
              <button
                type="button"
                className="q-icone-btn"
                aria-label={`Arquivar ${t.nome}`}
                title="Arquivar"
                onClick={() => void pedir({ op: "tipo_arquivar", id: t.id })}
              >
                <Icone nome="arquivar" size={15} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="tp-editar__novo"
        onSubmit={async (e) => {
          e.preventDefault();
          if (novo.trim() && (await pedir({ op: "tipo_criar", nome: novo.trim(), cor: CORES_COLUNA[vivos.length % CORES_COLUNA.length].k }))) setNovo("");
        }}
      >
        <input value={novo} maxLength={40} placeholder="Novo tipo (ex.: Vlog)" aria-label="Novo tipo" onChange={(e) => setNovo(e.currentTarget.value)} />
        <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={!novo.trim()}>
          <Icone nome="mais" size={14} /> Criar
        </button>
      </form>
      {erro ? (
        <p className="tp-erro" role="alert">
          {erro}
        </p>
      ) : null}
      {arquivados.length && podeArquivar ? (
        <details className="tp-editar__arquivados">
          <summary>Arquivados ({arquivados.length})</summary>
          <ul>
            {arquivados.map((t) => (
              <li key={t.id}>
                <span>{t.nome}</span>
                <button type="button" className="tp-link" onClick={() => void pedir({ op: "tipo_restaurar", id: t.id })}>
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <button type="button" className="glass-btn glass-btn--sm tp-ajustar__pronto" onClick={fechar}>
        Pronto
      </button>
    </div>
  );
}

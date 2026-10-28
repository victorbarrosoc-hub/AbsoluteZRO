"use client";
/**
 * A mesa de revisão, igual para a equipe e para o cliente: o player grande com os pinos, a régua com os marcadores, o
 * transporte (tocar, quadro a quadro, tempo), o comentário no ponto (tempo, intervalo e pino) e a conversa ao lado.
 * Atalhos: espaço/K tocar e pausar, J e L 5 s, ← → um quadro (só <video>; nos outros, 1 s), C comentar aqui.
 * "Antes | Agora" troca entre as duas versões mais novas (o cliente vê os comentários da volta anterior).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { NOME_DA_FONTE, type Capacidades } from "@/lib/revisao/fontes/detectar";
import { FPS_PADRAO, formatarTempo, lerTempo, timecode } from "@/lib/revisao/tempo";
import type { ComentarioVisto, VersaoVista } from "@/lib/revisao/tipos";
import { Icone } from "@/components/icones";
import { Player, type Controle } from "./player";

export type NovoComentario = {
  texto: string;
  t: number | null;
  tFim: number | null;
  digitado: boolean;
  x: number | null;
  y: number | null;
  pai: string | null;
  idem: string;
};

type Filtro = "todos" | "abertos" | "resolvidos" | "cliente";

const novoIdem = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const SEM_TEMPO: Capacidades = { tempo: false, quadro: false, velocidade: false };

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** A régua: a duração inteira, a agulha e um marcador por comentário com tempo (cascata de 30 ms ao surgir). */
function Regua({
  duracao,
  tempo,
  comentarios,
  ativo,
  aoPular,
  aoEscolher,
}: {
  duracao: number;
  tempo: number;
  comentarios: ComentarioVisto[];
  ativo: string | null;
  aoPular: (ms: number) => void;
  aoEscolher: (c: ComentarioVisto) => void;
}) {
  const pos = (ms: number) => `${Math.min(100, Math.max(0, (ms / duracao) * 100))}%`;
  return (
    <div className="rv-regua">
      <button
        type="button"
        className="rv-regua__trilho"
        aria-label={`Linha do tempo, ${formatarTempo(tempo)} de ${formatarTempo(duracao)}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          aoPular(Math.round(((e.clientX - r.left) / r.width) * duracao));
        }}
      >
        <span className="rv-regua__feito" style={{ width: pos(tempo) }} />
        <span className="rv-regua__agulha" style={{ left: pos(tempo) }} />
      </button>
      {comentarios
        .filter((c) => c.t !== null && !c.pai)
        .map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="rv-marca"
            data-autor={c.autor}
            data-resolvido={c.resolvido || undefined}
            aria-current={ativo === c.id ? "true" : undefined}
            style={{ left: pos(c.t!), "--i": i, ...(c.tFim ? { width: pos(c.tFim - c.t!) } : {}) } as CSSProperties}
            title={`${formatarTempo(c.t)} · ${c.texto.slice(0, 80)}`}
            aria-label={`Comentário em ${formatarTempo(c.t)}`}
            onClick={() => aoEscolher(c)}
          />
        ))}
    </div>
  );
}

function Nota({
  c,
  respostas,
  ativo,
  modo,
  aoEscolher,
  aoResolver,
  aoResponder,
}: {
  c: ComentarioVisto;
  respostas: ComentarioVisto[];
  ativo: boolean;
  modo: "equipe" | "cliente";
  aoEscolher: (c: ComentarioVisto) => void;
  aoResolver?: (c: ComentarioVisto) => void;
  aoResponder?: (c: ComentarioVisto) => void;
}) {
  const nome = (x: ComentarioVisto) => x.nome ?? (x.autor === "equipe" ? "Equipe" : "Cliente");
  return (
    <li className="rv-nota" data-autor={c.autor} data-resolvido={c.resolvido || undefined} aria-current={ativo ? "true" : undefined}>
      <div className="rv-nota__topo">
        <span className="rv-nota__av" aria-hidden="true">
          {nome(c).slice(0, 1).toUpperCase()}
        </span>
        <b>{nome(c)}</b>
        <time dateTime={c.em}>{quando(c.em)}</time>
        {c.resolvido ? <span className="rv-nota__ok">Resolvido</span> : null}
      </div>
      <button type="button" className="rv-nota__corpo" onClick={() => aoEscolher(c)}>
        {c.t !== null ? (
          <span className="rv-tc" title={c.digitado ? "Tempo digitado" : undefined}>
            {formatarTempo(c.t)}
            {c.tFim ? `–${formatarTempo(c.tFim)}` : ""}
            {c.digitado ? "*" : ""}
          </span>
        ) : null}
        {c.x !== null ? <Icone nome="alvo" size={14} className="rv-nota__pino" /> : null}
        <span className="rv-nota__texto">{c.texto}</span>
      </button>
      {respostas.length ? (
        <ul className="rv-respostas">
          {respostas.map((r) => (
            <li key={r.id} data-autor={r.autor}>
              <b>{nome(r)}</b> {r.texto}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rv-nota__acoes">
        {aoResponder ? (
          <button type="button" onClick={() => aoResponder(c)}>
            Responder
          </button>
        ) : null}
        {modo === "equipe" && aoResolver ? (
          <button type="button" onClick={() => aoResolver(c)}>
            {c.resolvido ? "Reabrir" : "Resolver"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

type PropsRevisor = {
  /** Mais nova primeiro. */
  versoes: VersaoVista[];
  modo: "equipe" | "cliente";
  podeComentar: boolean;
  aoComentar: (versao: VersaoVista, c: NovoComentario) => Promise<string | null>;
  aoResolver?: (c: ComentarioVisto) => Promise<void>;
  /** Cliente: o nome vai junto do primeiro comentário. */
  pedirNome?: { valor: string; mudar: (v: string) => void };
  /** O que fica logo abaixo do player (a decisão do cliente). */
  abaixo?: ReactNode;
};

export function Revisor(props: PropsRevisor) {
  const { versoes } = props;
  const nova = versoes[0]?.id ?? "";
  const [qual, setQual] = useState(nova);
  const [vistaNova, setVistaNova] = useState(nova);
  // Chegou versão nova: a mesa vai para ela (ajuste durante o render, sem efeito).
  if (vistaNova !== nova) {
    setVistaNova(nova);
    setQual(nova);
  }
  const versao = versoes.find((v) => v.id === qual) ?? versoes[0];
  if (!versao) return null;
  // Cada versão tem a sua mesa: trocar de versão começa do zero (tempo, rascunho, pinos).
  return <Mesa key={versao.id} {...props} versao={versao} aoTrocar={setQual} />;
}

function Mesa({
  versoes,
  versao,
  aoTrocar: setQual,
  modo,
  podeComentar,
  aoComentar,
  aoResolver,
  pedirNome,
  abaixo,
}: PropsRevisor & { versao: VersaoVista; aoTrocar: (id: string) => void }) {
  const ehAtual = versao.id === versoes[0]?.id;
  const controle = useRef<Controle | null>(null);
  const aoControle = useCallback((c: Controle | null) => {
    controle.current = c;
  }, []);
  const [tempo, setTempo] = useState(0);
  const [duracao, setDuracao] = useState<number | null>(versao.duracaoMs);
  const [caps, setCaps] = useState<Capacidades>(SEM_TEMPO);
  const [proporcao, setProporcao] = useState(16 / 9);
  const [tocando, setTocando] = useState(false);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(modo === "equipe" ? "abertos" : "todos");
  // rascunho do comentário
  const [texto, setTexto] = useState("");
  const [t, setT] = useState<number | null>(null);
  const [tFim, setTFim] = useState<number | null>(null);
  const [tDigitado, setTDigitado] = useState("");
  const [pino, setPino] = useState<{ x: number; y: number } | null>(null);
  const [marcando, setMarcando] = useState(false);
  const [pai, setPai] = useState<ComentarioVisto | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const idem = useRef(novoIdem());

  const aoTempo = useCallback((ms: number) => setTempo(ms), []);
  const aoDuracao = useCallback((ms: number) => setDuracao(ms), []);
  const aoTocando = useCallback((v: boolean) => setTocando(v), []);
  const aoCapacidades = useCallback((c: Capacidades) => setCaps(c), []);
  const aoProporcao = useCallback((r: number) => setProporcao(Math.min(2.4, Math.max(0.5, r))), []);

  const comentarios = useMemo(() => versao.comentarios, [versao]);
  const raiz = comentarios.filter((c) => !c.pai);
  const visiveis = raiz.filter((c) =>
    filtro === "abertos" ? !c.resolvido : filtro === "resolvidos" ? c.resolvido : filtro === "cliente" ? c.autor === "cliente" : true,
  );
  const ordenados = [...visiveis].sort((a, b) => (a.t ?? Number.MAX_SAFE_INTEGER) - (b.t ?? Number.MAX_SAFE_INTEGER) || a.em.localeCompare(b.em));
  const pinos = comentarios.filter(
    (c) => c.x !== null && c.y !== null && !c.pai && (c.id === ativo || !caps.tempo || c.t === null || Math.abs((c.t ?? 0) - tempo) <= 1500),
  );

  const prender = useCallback(() => {
    if (!caps.tempo) return;
    controle.current?.pausar();
    const agora = controle.current?.tempo() ?? tempo;
    setT((v) => (v === null ? agora : v));
  }, [caps.tempo, tempo]);

  const comentarAqui = useCallback(() => {
    if (!podeComentar || !ehAtual) return;
    if (caps.tempo) {
      controle.current?.pausar();
      setT(controle.current?.tempo() ?? tempo);
      setTFim(null);
    }
    caixa.current?.focus();
  }, [podeComentar, ehAtual, caps.tempo, tempo]);

  // Atalhos (fora dos campos de texto).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)) return;
      const c = controle.current;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        if (!c) return;
        e.preventDefault();
        if (k === "k") c.pausar();
        else c.alternar();
      } else if (k === "j" || k === "l") {
        if (!c) return;
        const agora = c.tempo() ?? tempo;
        c.pular(Math.max(0, agora + (k === "j" ? -5000 : 5000)));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!c || !caps.tempo) return;
        e.preventDefault();
        const d = e.key === "ArrowLeft" ? -1 : 1;
        if (caps.quadro) c.passo(d);
        else c.pular(Math.max(0, (c.tempo() ?? tempo) + d * 1000));
      } else if (k === "c") {
        e.preventDefault();
        comentarAqui();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [caps, tempo, comentarAqui]);

  const escolher = useCallback(
    (c: ComentarioVisto) => {
      setAtivo(c.id);
      if (c.t !== null && caps.tempo) {
        controle.current?.pausar();
        controle.current?.pular(c.t);
        setTempo(c.t);
      }
    },
    [caps.tempo],
  );

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const limpo = texto.trim();
    if (!limpo) {
      setErro("Escreva o comentário.");
      return;
    }
    let tempoFinal = caps.tempo ? t : null;
    let digitado = false;
    if (!caps.tempo && tDigitado.trim()) {
      const lido = lerTempo(tDigitado);
      if (lido === null) {
        setErro("Confira o tempo (ex.: 1:23).");
        return;
      }
      tempoFinal = lido;
      digitado = true;
    }
    if (pedirNome && pedirNome.valor.trim().length < 2) {
      setErro("Escreva seu nome.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const falha = await aoComentar(versao, {
      texto: limpo,
      t: pai ? null : tempoFinal,
      tFim: pai ? null : tFim,
      digitado,
      x: pai ? null : (pino?.x ?? null),
      y: pai ? null : (pino?.y ?? null),
      pai: pai?.id ?? null,
      idem: idem.current,
    });
    setEnviando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    idem.current = novoIdem();
    setTexto("");
    setT(null);
    setTFim(null);
    setTDigitado("");
    setPino(null);
    setMarcando(false);
    setPai(null);
  }

  const fps = versao.fps ?? FPS_PADRAO;
  const n = (f: Filtro) =>
    raiz.filter((c) => (f === "abertos" ? !c.resolvido : f === "resolvidos" ? c.resolvido : f === "cliente" ? c.autor === "cliente" : true)).length;

  return (
    <div className="rv">
      <div className="rv-mesa">
        {versoes.length > 1 ? (
          <div className="rv-versoes" role="tablist" aria-label="Versões">
            {modo === "cliente"
              ? versoes.slice(0, 2).map((v, i) => (
                  <button key={v.id} type="button" role="tab" aria-selected={v.id === versao.id} onClick={() => setQual(v.id)}>
                    {i === 0 ? "Agora" : "Antes"}
                  </button>
                ))
              : versoes.map((v) => (
                  <button key={v.id} type="button" role="tab" aria-selected={v.id === versao.id} onClick={() => setQual(v.id)}>
                    v{v.n}
                  </button>
                ))}
          </div>
        ) : null}

        <div className="rv-palco" style={{ "--proporcao": proporcao } as CSSProperties} data-fonte={versao.fonte}>
          <Player
            key={versao.id}
            versao={versao}
            aoControle={aoControle}
            aoTempo={aoTempo}
            aoDuracao={aoDuracao}
            aoTocando={aoTocando}
            aoCapacidades={aoCapacidades}
            aoProporcao={aoProporcao}
          />
          <div
            className="rv-pinos"
            data-marcando={marcando || undefined}
            onClick={(e) => {
              if (!marcando) return;
              const r = e.currentTarget.getBoundingClientRect();
              setPino({ x: Math.round(((e.clientX - r.left) / r.width) * 10000) / 100, y: Math.round(((e.clientY - r.top) / r.height) * 10000) / 100 });
              setMarcando(false);
              prender();
              caixa.current?.focus();
            }}
            aria-hidden={!marcando}
          >
            {pinos.map((c) => (
              <span key={c.id} className="rv-pino" data-autor={c.autor} data-ativo={c.id === ativo || undefined} style={{ left: `${c.x}%`, top: `${c.y}%` }} />
            ))}
            {pino ? <span className="rv-pino rv-pino--novo" style={{ left: `${pino.x}%`, top: `${pino.y}%` }} /> : null}
            {marcando ? <span className="rv-pinos__dica">Toque no ponto do quadro</span> : null}
          </div>
        </div>

        <div className="rv-transporte">
          {caps.tempo ? (
            <>
              <button type="button" className="rv-btn" onClick={() => controle.current?.alternar()} aria-label={tocando ? "Pausar" : "Tocar"} title="Espaço">
                <Icone nome={tocando ? "pausa" : "tocar"} size={18} />
              </button>
              {caps.quadro ? (
                <>
                  <button type="button" className="rv-btn" onClick={() => controle.current?.passo(-1)} aria-label="Quadro anterior" title="←">
                    <Icone nome="quadroAnterior" size={18} />
                  </button>
                  <button type="button" className="rv-btn" onClick={() => controle.current?.passo(1)} aria-label="Próximo quadro" title="→">
                    <Icone nome="quadroProximo" size={18} />
                  </button>
                </>
              ) : null}
              <span className="rv-relogio" aria-live="off">
                <span className="rv-tc">{caps.quadro ? timecode(tempo, fps) : formatarTempo(tempo)}</span>
                {duracao ? <span className="rv-relogio__total"> / {formatarTempo(duracao)}</span> : null}
              </span>
            </>
          ) : (
            <span className="rv-semtempo" title={NOME_DA_FONTE[versao.fonte]}>
              <Icone nome="relogio" size={15} /> {NOME_DA_FONTE[versao.fonte]} · tempo digitado
            </span>
          )}
          {podeComentar && ehAtual ? (
            <button type="button" className="glass-btn glass-btn--sm rv-aqui" onClick={comentarAqui} title="C">
              <Icone nome="balao" size={16} /> Comentar aqui
            </button>
          ) : null}
        </div>

        {caps.tempo && duracao ? (
          <Regua duracao={duracao} tempo={tempo} comentarios={comentarios} ativo={ativo} aoPular={(ms) => controle.current?.pular(ms)} aoEscolher={escolher} />
        ) : null}
        {abaixo}
      </div>

      <aside className="rv-conversa" aria-label="Comentários">
        {podeComentar && ehAtual ? (
          <form className="rv-compor" onSubmit={enviar} aria-label="Novo comentário">
            {pai ? (
              <div className="rv-compor__fio">
                Respondendo a {pai.nome ?? (pai.autor === "equipe" ? "Equipe" : "Cliente")}
                <button type="button" onClick={() => setPai(null)} aria-label="Cancelar resposta">
                  <Icone nome="fechar" size={14} />
                </button>
              </div>
            ) : (
              <div className="rv-compor__linha">
                {caps.tempo ? (
                  <>
                    <button
                      type="button"
                      className="rv-chip"
                      data-on={t !== null || undefined}
                      onClick={() => (t === null ? setT(controle.current?.tempo() ?? tempo) : setT(null))}
                      title={t === null ? "Prender no tempo atual" : "Comentar sem tempo"}
                    >
                      <Icone nome="relogio" size={14} /> {t === null ? "Sem tempo" : formatarTempo(t)}
                      {tFim ? `–${formatarTempo(tFim)}` : ""}
                    </button>
                    {t !== null ? (
                      <button
                        type="button"
                        className="rv-chip"
                        data-on={tFim !== null || undefined}
                        onClick={() => {
                          const agora = controle.current?.tempo() ?? tempo;
                          setTFim(tFim === null && agora > (t ?? 0) ? agora : null);
                        }}
                        title="Marcar até onde vai (o vídeo precisa ter andado)"
                      >
                        Até aqui
                      </button>
                    ) : null}
                  </>
                ) : (
                  <label className="rv-chip rv-chip--campo">
                    <Icone nome="relogio" size={14} />
                    <span className="sr-only">Tempo no vídeo</span>
                    <input inputMode="numeric" placeholder="1:23" value={tDigitado} onChange={(e) => setTDigitado(e.target.value)} maxLength={10} />
                  </label>
                )}
                <button
                  type="button"
                  className="rv-chip"
                  data-on={!!pino || marcando || undefined}
                  onClick={() => (pino ? setPino(null) : setMarcando((m) => !m))}
                  title="Marcar um ponto no quadro"
                >
                  <Icone nome="alvo" size={14} /> {pino ? "Ponto marcado" : marcando ? "Toque no vídeo" : "Ponto"}
                </button>
              </div>
            )}
            {pedirNome ? (
              <input
                className="rv-compor__nome"
                placeholder="Seu nome"
                aria-label="Seu nome"
                value={pedirNome.valor}
                maxLength={80}
                autoComplete="name"
                onChange={(e) => pedirNome.mudar(e.target.value)}
              />
            ) : null}
            <textarea
              ref={caixa}
              rows={2}
              maxLength={2000}
              placeholder={caps.tempo ? "Comente neste ponto…" : "Escreva o comentário…"}
              aria-label="Comentário"
              value={texto}
              onFocus={() => !texto && !pai && prender()}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar(e);
              }}
            />
            {erro ? (
              <p className="rv-erro" role="alert">
                {erro}
              </p>
            ) : null}
            <button type="submit" className="glass-btn glass-btn--ink glass-btn--sm" disabled={enviando || !texto.trim()}>
              {enviando ? "Enviando…" : pai ? "Responder" : "Comentar"}
            </button>
          </form>
        ) : null}

        {modo === "equipe" && raiz.length ? (
          <div className="rv-filtros" role="radiogroup" aria-label="Filtrar comentários">
            {(
              [
                ["abertos", "Abertos"],
                ["cliente", "Do cliente"],
                ["resolvidos", "Resolvidos"],
                ["todos", "Todos"],
              ] as [Filtro, string][]
            ).map(([k, nome]) => (
              <button key={k} type="button" role="radio" aria-checked={filtro === k} onClick={() => setFiltro(k)}>
                {nome} <span>{n(k)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {ordenados.length ? (
          <ol className="rv-notas" aria-label="Comentários desta versão">
            {ordenados.map((c) => (
              <Nota
                key={c.id}
                c={c}
                respostas={comentarios.filter((r) => r.pai === c.id)}
                ativo={ativo === c.id}
                modo={modo}
                aoEscolher={escolher}
                aoResolver={aoResolver ? (x) => void aoResolver(x) : undefined}
                aoResponder={
                  podeComentar && ehAtual
                    ? (x) => {
                        setPai(x);
                        caixa.current?.focus();
                      }
                    : undefined
                }
              />
            ))}
          </ol>
        ) : (
          <p className="rv-vazio">{raiz.length ? "Nada neste filtro." : ehAtual ? "Nenhum comentário ainda." : "Nenhum comentário nesta versão."}</p>
        )}
      </aside>
    </div>
  );
}

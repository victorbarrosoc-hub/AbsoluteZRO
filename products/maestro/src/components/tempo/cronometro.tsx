"use client";
/**
 * O cronômetro do Maestro em toda tela (drizzle/0038): a pílula de vidro (tarefa + tempo + pausar, como uma Live
 * Activity) que no computador se arrasta para os cantos e no iPhone fica acima da barra; tocar abre o painel (gaveta à
 * direita no computador, folha de baixo no iPhone). Aqui também moram: o título da aba com o tempo, o atalho ⌥T/Alt+T,
 * a pergunta do parado ("Manter ou descartar?") e o relógio do Pomodoro (avisa no fim do foco e da pausa).
 *
 * Movimento: entrada e saída por CSS (mola), troca de tarefa refaz só a entrada do título, arrastar mexe só no
 * `transform` e assenta no canto com FLIP. Tudo parado com "reduzir movimento".
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { duracaoMs, paradoParaPerguntar, pausaDepois, tituloDaAba, duracaoCurta, MIN } from "@/lib/tempo/calculo";
import { Icone } from "@/components/icones";
import { Contador } from "./contador";
import {
  abrirPainel,
  agoraServidor,
  alternarPainel,
  cardDoTempo,
  fecharAviso,
  iniciar,
  lerEstado,
  ligarLoja,
  marcarParado,
  pausar,
  resolverParado,
  useTempo,
} from "./loja";
import { lerPomodoroAtual, mudarPomodoro, notificar, usePomodoro } from "./pomodoro";
import { Painel } from "./painel";

const nada = () => () => {};
const useNoNavegador = () =>
  useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );
const calmo = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Mostra enquanto `visivel` e segura `ms` na saída (a animação de sair). Com "reduzir movimento", some na hora. */
function useSaida(visivel: boolean, ms = 220): { montado: boolean; saindo: boolean } {
  const [antes, setAntes] = useState(visivel);
  const [saindo, setSaindo] = useState(false);
  // a troca de `visivel` muda o estado já no desenho (sem efeito em cascata)
  if (antes !== visivel) {
    setAntes(visivel);
    setSaindo(!visivel && typeof window !== "undefined" && !calmo());
  }
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => setSaindo(false), ms);
    return () => clearTimeout(t);
  }, [saindo, ms]);
  return { montado: visivel || saindo, saindo };
}

export function Cronometro() {
  const noNavegador = useNoNavegador();
  useEffect(() => ligarLoja(), []);
  useTitulo();
  useAtalho();
  useOcioso();
  useRelogioDoPomodoro();
  const pode = useTempo((e) => e.pode);
  const aberto = useTempo((e) => e.aberto);
  if (!noNavegador || !pode) return null;
  return createPortal(
    <>
      <Pilula />
      <GavetaDoPainel aberto={aberto} />
      <PerguntaDoParado />
      <AvisoDoTempo />
    </>,
    document.body,
  );
}

/* ───────────── a pílula ───────────── */

type Canto = "tl" | "tr" | "bl" | "br";
const CHAVE_CANTO = "mae:cronometro:canto";
const lerCanto = (): Canto => {
  try {
    const v = localStorage.getItem(CHAVE_CANTO);
    return v === "tl" || v === "tr" || v === "bl" || v === "br" ? v : "br";
  } catch {
    return "br";
  }
};

function Pilula() {
  const rodando = useTempo((e) => e.rodando);
  const ultimo = useTempo((e) => e.ultimo);
  const hoje = useTempo((e) => e.hoje);
  const troca = useTempo((e) => e.troca);
  const aberto = useTempo((e) => e.aberto);
  const fase = usePomodoro((p) => p.fase);
  const modo = useTempo((e) => e.modo);
  // "Esconder" vale para a sessão que acabou: uma sessão nova (outro play) traz a pílula de volta
  const [dispensado, setDispensado] = useState<string | null>(null);
  // a pílula só nasce no navegador (portal depois de montar): o canto guardado já vale no primeiro desenho
  const [canto, setCanto] = useState<Canto>(lerCanto);
  const caixa = useRef<HTMLDivElement>(null);
  const engoleClique = useRef(false);

  const card = rodando?.card ?? ultimo;
  const pausadoHoje = !rodando && !!ultimo && hoje.some((r) => r.card === ultimo);
  const emPausaDoPomodoro = !rodando && modo === "pomodoro" && (fase === "pausa" || fase === "longa");
  const ultimaSessao = hoje.length ? hoje[hoje.length - 1].id : null;
  const visivel = !aberto && (!!rodando || ((pausadoHoje || emPausaDoPomodoro) && dispensado !== ultimaSessao));
  const { montado, saindo } = useSaida(visivel);
  if (!montado || !card) return null;
  const info = cardDoTempo(card);
  const tema = info?.tema || "Tarefa";
  // hoje neste card (o que roda conta ao vivo)
  const base = hoje.filter((r) => r.card === card && r.fim).reduce((a, r) => a + duracaoMs(r, 0), 0);
  const de = rodando && rodando.card === card ? Date.parse(rodando.inicio) : null;

  /* arrastar para os cantos (só mouse: no toque a pílula fica fixa) */
  const aoPegar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !caixa.current) return;
    if ((e.target as HTMLElement).closest(".tp-pilula__acao")) return;
    const el = caixa.current;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let arrastando = false;
    const mover = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!arrastando && Math.hypot(dx, dy) < 5) return;
      if (!arrastando) {
        arrastando = true;
        el.dataset.arrasto = "";
      }
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      if (!arrastando) return;
      engoleClique.current = true;
      setTimeout(() => (engoleClique.current = false), 0);
      const antes = el.getBoundingClientRect();
      const novo: Canto = `${ev.clientY < window.innerHeight / 2 ? "t" : "b"}${ev.clientX < window.innerWidth / 2 ? "l" : "r"}` as Canto;
      el.style.transform = "";
      delete el.dataset.arrasto;
      el.dataset.canto = novo;
      // FLIP: de onde soltou até o canto, com a mola do CSS
      const depois = el.getBoundingClientRect();
      if (!calmo()) {
        el.animate([{ transform: `translate(${antes.left - depois.left}px, ${antes.top - depois.top}px)` }, { transform: "none" }], {
          duration: 420,
          easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        });
      }
      setCanto(novo);
      try {
        localStorage.setItem(CHAVE_CANTO, novo);
      } catch {}
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  };

  const rotulo = rodando ? `Cronômetro: ${tema}. Abrir o painel.` : `Pausado: ${tema}. Abrir o painel.`;
  return (
    <div
      ref={caixa}
      className="tp-pilula"
      data-canto={canto}
      data-estado={rodando ? "rodando" : "pausado"}
      data-saindo={saindo || undefined}
      onPointerDown={aoPegar}
    >
      <button
        type="button"
        className="tp-pilula__abrir"
        aria-label={rotulo}
        title="Abrir o cronômetro (⌥T)"
        onClick={() => {
          if (engoleClique.current) return;
          abrirPainel("agora");
        }}
      >
        <i className="tp-pilula__ponto" aria-hidden="true" />
        <span key={troca} className="tp-pilula__tema">
          {tema}
        </span>
        {emPausaDoPomodoro ? <ContagemDaPausa /> : <Contador de={de} base={base} rolar className="tp-pilula__tempo" />}
      </button>
      <button
        type="button"
        className="tp-pilula__acao"
        aria-label={rodando ? "Pausar" : "Retomar"}
        title={rodando ? "Pausar" : "Retomar"}
        onClick={() => void (rodando ? pausar() : iniciar(card))}
      >
        <Icone nome={rodando ? "pausa" : "tocar"} size={14} />
      </button>
      {!rodando ? (
        <button type="button" className="tp-pilula__fechar" aria-label="Esconder" title="Esconder" onClick={() => setDispensado(ultimaSessao)}>
          <Icone nome="fechar" size={12} />
        </button>
      ) : null}
    </div>
  );
}

function ContagemDaPausa() {
  const de = usePomodoro((p) => p.pausaDe);
  const ms = usePomodoro((p) => p.pausaMs);
  return <Contador de={de} regressivo={ms} formato="contagem" rolar className="tp-pilula__tempo" />;
}

/* ───────────── a gaveta (computador) e a folha (iPhone) ───────────── */

function GavetaDoPainel({ aberto }: { aberto: boolean }) {
  const { montado, saindo } = useSaida(aberto, 260);
  const caixa = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const antes = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => caixa.current?.focus({ preventScroll: true }));
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".m-veu")) {
        e.preventDefault();
        alternarPainel();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      if (antes?.isConnected) antes.focus({ preventScroll: true });
    };
  }, [aberto]);
  if (!montado) return null;
  return (
    <>
      <div className="tp-veu" data-saindo={saindo || undefined} onPointerDown={() => alternarPainel()} aria-hidden="true" />
      <aside
        ref={caixa}
        className="tp-painel"
        role="dialog"
        aria-label="Cronômetro"
        tabIndex={-1}
        data-saindo={saindo || undefined}
        onKeyDown={(e) => {
          // espaço pausa e retoma com o painel em foco (fora de campo e de botão, que já usam o espaço)
          if (e.key !== " " || e.repeat) return;
          const alvo = e.target as HTMLElement;
          if (alvo.closest("input, textarea, select, button, a, [contenteditable='true'], summary")) return;
          e.preventDefault();
          const s = lerEstado();
          if (s.rodando) void pausar();
          else if (s.ultimo) void iniciar(s.ultimo);
        }}
      >
        <Painel />
      </aside>
    </>
  );
}

/* ───────────── o parado ───────────── */

function PerguntaDoParado() {
  const parado = useTempo((e) => e.parado);
  if (!parado) return null;
  const min = Math.max(1, Math.round((parado.ate - parado.desde) / MIN));
  return (
    <div className="tp-parado" role="alertdialog" aria-label="Você ficou parado">
      <span className="tp-parado__icone" aria-hidden="true">
        <Icone nome="cronometro" size={18} />
      </span>
      <p>
        <strong>Parado {duracaoCurta(min * MIN)}.</strong>
        <span>Manter esse tempo?</span>
      </p>
      <button type="button" className="glass-btn glass-btn--sm" onClick={() => void resolverParado(false)}>
        Manter
      </button>
      <button type="button" className="glass-btn glass-btn--sm glass-btn--ink" onClick={() => void resolverParado(true)} autoFocus>
        Descartar {min} min
      </button>
    </div>
  );
}

function AvisoDoTempo() {
  const aviso = useTempo((e) => e.aviso);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(fecharAviso, aviso.desfazer ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  if (!aviso) return null;
  return (
    <div className="q-aviso tp-aviso" role="status" key={aviso.id}>
      <span>{aviso.texto}</span>
      {aviso.desfazer ? (
        <button
          type="button"
          onClick={() => {
            aviso.desfazer?.();
            fecharAviso();
          }}
        >
          Desfazer
        </button>
      ) : null}
    </div>
  );
}

/* ───────────── título da aba, atalho, parado e Pomodoro ───────────── */

const PREFIXO = /^▶ \d{2}:\d{2} · /;

function useTitulo() {
  const rodando = useTempo((e) => e.rodando);
  useEffect(() => {
    if (!rodando) return;
    let base = PREFIXO.test(document.title) ? "" : document.title;
    const escrever = () => {
      if (!PREFIXO.test(document.title)) base = document.title;
      const tema = cardDoTempo(rodando.card)?.tema || "Tarefa";
      const s = lerEstado();
      const hojeNoCard = s.hoje.filter((r) => r.card === rodando.card && r.fim).reduce((a, r) => a + duracaoMs(r, 0), 0);
      document.title = tituloDaAba(hojeNoCard + Math.max(0, agoraServidor() - Date.parse(rodando.inicio)), tema);
    };
    escrever();
    const t = setInterval(escrever, 1000);
    return () => {
      clearInterval(t);
      if (base) document.title = base;
    };
  }, [rodando]);
}

function useAtalho() {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // ⌥T no Mac (o code, porque a letra vira "†") e Alt+T no Windows
      if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== "KeyT") return;
      e.preventDefault();
      alternarPainel();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
}

/**
 * O parado: o último gesto (mouse, teclado, toque, rolagem) e um batimento de 15 s (se o batimento falhou por mais de
 * um minuto, o computador dormiu: conta desde o último batimento). Ao voltar, com o cronômetro rodando desde antes, e
 * parado passou do limite, pergunta.
 */
function useOcioso() {
  const rodando = useTempo((e) => e.rodando);
  const limite = usePomodoro((p) => p.ociosoMin);
  useEffect(() => {
    if (!rodando || !limite) return;
    let ultima = agoraServidor();
    let batida = ultima;
    const conferir = () => {
      const agora = agoraServidor();
      const s = lerEstado();
      if (s.rodando && !s.parado) {
        const desde = paradoParaPerguntar({ inicio: Date.parse(s.rodando.inicio), ultimaAtividade: ultima, agora, limiteMin: limite });
        if (desde !== null) marcarParado({ desde, ate: agora, registro: s.rodando.id });
      }
      ultima = agora;
    };
    let ultimoGesto = 0;
    const gesto = () => {
      const t = Date.now();
      if (t - ultimoGesto < 1000) return;
      ultimoGesto = t;
      conferir();
    };
    const bater = setInterval(() => {
      const agora = agoraServidor();
      // computador dormiu (o intervalo não rodou): o parado começa na última batida
      if (agora - batida > 60_000 && batida > ultima) ultima = batida;
      batida = agora;
    }, 15_000);
    const eventos = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const ev of eventos) window.addEventListener(ev, gesto, { passive: true });
    const vis = () => document.visibilityState === "visible" && conferir();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(bater);
      for (const ev of eventos) window.removeEventListener(ev, gesto);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [rodando, limite]);
}

/**
 * O relógio do Pomodoro (a cada segundo, sem estado do React): fim do foco pausa o cronômetro e começa a pausa (curta
 * ou longa); fim da pausa avisa e deixa "Focar" pronto. Pausar no meio do foco guarda o que já foi feito.
 */
function useRelogioDoPomodoro() {
  const rodando = useTempo((e) => e.rodando);
  const anterior = useRef(rodando);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = rodando;
    const p = lerPomodoroAtual();
    if (antes && !rodando && antes.modo === "pomodoro" && p.fase === "foco") {
      // pausou no meio do foco: guarda o feito
      mudarPomodoro({ acumulado: p.acumulado + Math.max(0, agoraServidor() - Date.parse(antes.inicio)), fase: "pronto" });
    }
    if (rodando?.modo === "pomodoro" && p.fase !== "foco") mudarPomodoro({ fase: "foco", pausaDe: null });
  }, [rodando]);
  useEffect(() => {
    const t = setInterval(() => {
      const s = lerEstado();
      const p = lerPomodoroAtual();
      const agora = agoraServidor();
      if (p.fase === "foco" && s.rodando?.modo === "pomodoro") {
        const feito = p.acumulado + (agora - Date.parse(s.rodando.inicio));
        if (feito >= p.config.focoMin * MIN) {
          const feitos = p.feitos + 1;
          const pausa = pausaDepois(feitos, p.config);
          mudarPomodoro({ fase: pausa.tipo, feitos, acumulado: 0, pausaDe: agora, pausaMs: pausa.ms });
          void pausar();
          notificar("Foco feito.", pausa.tipo === "longa" ? `Pausa longa de ${p.config.longaMin} min.` : `Pausa de ${p.config.pausaMin} min.`);
        }
      } else if ((p.fase === "pausa" || p.fase === "longa") && p.pausaDe !== null && agora - p.pausaDe >= p.pausaMs) {
        mudarPomodoro({ fase: "pronto", pausaDe: null });
        notificar("Pausa acabou.", "Pronto para focar.");
        abrirPainel("agora");
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);
}

"use client";
/**
 * O painel do cronômetro (a gaveta à direita no computador, a folha de baixo no iPhone): Agora (o cronômetro grande,
 * Livre/Pomodoro, Ajustar, Zerar e o próximo passo do card), Hoje (os cards em que trabalhou, com o seletor de dias, e
 * as Concluídas) e Semana (o resumo). Pouco texto: o número é o protagonista.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { duracaoCurta, duracaoMs, MIN, NOMES_DIAS, diaLocal, saiuDaMao, segundaDaSemana, somarDias, type Semana } from "@/lib/tempo/calculo";
import { proximoPasso } from "@/lib/quadro/metodo";
import { Icone } from "@/components/icones";
import { Contador } from "./contador";
import {
  agoraServidor,
  avisar,
  carregar,
  cardDoTempo,
  escolherAba,
  fecharPainel,
  iniciar,
  nomeDoCliente,
  pausar,
  trocarModo,
  useTempo,
  zerarCard,
  type AbaPainel,
} from "./loja";
import { mudarPomodoro, pedirNotificacao, usePomodoro } from "./pomodoro";
import { Ajustar } from "./ajustar";
import { ResumoDaSemana, useSemana } from "./semana";

const ABAS: { k: AbaPainel; nome: string }[] = [
  { k: "agora", nome: "Agora" },
  { k: "hoje", nome: "Hoje" },
  { k: "semana", nome: "Semana" },
];

export function Painel() {
  const aba = useTempo((e) => e.aba);
  return (
    <div className="tp-painel__corpo">
      <div className="tp-painel__topo">
        <h2 className="tp-painel__titulo">
          <Icone nome="cronometro" size={18} /> Cronômetro
        </h2>
        <button type="button" className="q-icone-btn" onClick={fecharPainel} aria-label="Fechar" title="Fechar (Esc)">
          <Icone nome="fechar" size={18} />
        </button>
      </div>
      <div className="tp-abas" role="tablist" aria-label="Cronômetro">
        {ABAS.map((a) => (
          <button key={a.k} type="button" role="tab" aria-selected={aba === a.k} onClick={() => escolherAba(a.k)}>
            {a.nome}
          </button>
        ))}
      </div>
      <div className="tp-painel__aba" role="tabpanel" key={aba}>
        {aba === "agora" ? <Agora /> : aba === "hoje" ? <Hoje /> : <SemanaDoPainel />}
      </div>
    </div>
  );
}

/* ───────────── Agora ───────────── */

function Agora() {
  const rodando = useTempo((e) => e.rodando);
  const ultimo = useTempo((e) => e.ultimo);
  const hoje = useTempo((e) => e.hoje);
  const modo = useTempo((e) => e.modo);
  const fase = usePomodoro((p) => p.fase);
  const config = usePomodoro((p) => p.config);
  const acumulado = usePomodoro((p) => p.acumulado);
  const feitos = usePomodoro((p) => p.feitos);
  const pausaDe = usePomodoro((p) => p.pausaDe);
  const pausaMs = usePomodoro((p) => p.pausaMs);
  const [ajustar, setAjustar] = useState(false);
  const [confirmarZerar, setConfirmarZerar] = useState(false);
  useEffect(() => {
    if (!confirmarZerar) return;
    const t = setTimeout(() => setConfirmarZerar(false), 4000);
    return () => clearTimeout(t);
  }, [confirmarZerar]);

  const card = rodando?.card ?? ultimo;
  const info = cardDoTempo(card);
  if (!card)
    return (
      <div className="tp-vazio">
        <span className="tp-vazio__icone" aria-hidden="true">
          <Icone nome="tocar" size={22} />
        </span>
        <p>Toque no play de um card.</p>
        <Link className="glass-btn glass-btn--sm glass-btn--ink" href="/app/quadro" onClick={fecharPainel}>
          Abrir o Quadro
        </Link>
      </div>
    );
  const base = hoje.filter((r) => r.card === card && r.fim).reduce((a, r) => a + duracaoMs(r, 0), 0);
  const de = rodando?.card === card ? Date.parse(rodando.inicio) : null;
  const emPausa = modo === "pomodoro" && !rodando && (fase === "pausa" || fase === "longa");
  const passo = info ? proximoPasso({ coluna: info.coluna, resp: "x" })?.principal : null;
  const cliente = nomeDoCliente(info?.cliente);

  return (
    <div className="tp-agora" data-modo={modo} data-rodando={!!rodando || undefined}>
      <div className="tp-agora__tarefa">
        <strong key={card}>{info?.tema || "Tarefa"}</strong>
        {cliente ? <span>{cliente}</span> : null}
      </div>

      <div className="tp-modos" role="radiogroup" aria-label="Modo">
        {(["livre", "pomodoro"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modo === m}
            onClick={() => {
              if (m === "pomodoro") pedirNotificacao();
              void trocarModo(m);
            }}
          >
            {m === "livre" ? "Livre" : "Pomodoro"}
          </button>
        ))}
      </div>

      <div className="tp-grande" aria-live="off">
        {modo === "livre" ? (
          <Contador de={de} base={base} rolar className="tp-grande__num" />
        ) : emPausa ? (
          <Contador de={pausaDe} regressivo={pausaMs} formato="contagem" rolar className="tp-grande__num" />
        ) : (
          <Contador de={de} base={acumulado} regressivo={config.focoMin * MIN} formato="contagem" rolar className="tp-grande__num" />
        )}
        <span className="tp-grande__legenda">
          {modo === "livre"
            ? rodando
              ? "hoje neste card"
              : "pausado"
            : emPausa
              ? fase === "longa"
                ? "pausa longa"
                : "pausa"
              : rodando
                ? "foco"
                : "pronto para focar"}
        </span>
        {modo === "pomodoro" ? (
          <span className="tp-ciclos" aria-label={`${feitos % config.ciclos} de ${config.ciclos} focos`}>
            {Array.from({ length: config.ciclos }, (_, i) => (
              <i key={i} data-feito={i < feitos % config.ciclos || undefined} />
            ))}
          </span>
        ) : null}
      </div>

      <div className="tp-acoes">
        {emPausa ? (
          <button type="button" className="glass-btn glass-btn--ink tp-principal" onClick={() => mudarPomodoro({ fase: "pronto", pausaDe: null })}>
            Pular pausa
          </button>
        ) : (
          <button
            type="button"
            className="glass-btn glass-btn--ink tp-principal"
            onClick={() => void (rodando ? pausar() : iniciar(card, modo))}
            aria-label={rodando ? "Pausar" : "Iniciar"}
          >
            <Icone nome={rodando ? "pausa" : "tocar"} size={16} />
            {rodando ? "Pausar" : modo === "pomodoro" ? "Focar" : "Iniciar"}
          </button>
        )}
        <button type="button" className="glass-btn glass-btn--sm" onClick={() => setAjustar(true)}>
          Ajustar
        </button>
        {confirmarZerar ? (
          <button
            type="button"
            className="glass-btn glass-btn--sm tp-perigo"
            onClick={() => {
              setConfirmarZerar(false);
              void zerarCard(card);
            }}
          >
            Zerar mesmo?
          </button>
        ) : (
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => setConfirmarZerar(true)} title="Tira todo o seu tempo deste card">
            Zerar
          </button>
        )}
      </div>

      {passo && passo.acao === "mover" ? (
        <button type="button" className="tp-passo" onClick={() => void concluir(card, passo.para, passo.rotulo)} title="Pausa e leva o card adiante no Quadro">
          <Icone nome="check" size={14} />
          <span>{passo.rotulo}</span>
          <Icone nome="seta" size={13} />
        </button>
      ) : null}

      <Preferencias />
      {ajustar ? <Ajustar card={card} tema={info?.tema || "Tarefa"} aoFechar={() => setAjustar(false)} /> : null}
    </div>
  );
}

/** Concluir: pausa e leva o card ao próximo passo pelo Quadro (a mesma gravação por campo; o poll leva às outras telas). */
async function concluir(card: string, para: string, rotulo: string) {
  await pausar();
  try {
    const r = await fetch("/api/quadro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "mudar", id: card, campos: { coluna: para } }),
    });
    if (!r.ok) throw new Error();
    avisar(`${rotulo}. Feito.`);
    await carregar();
  } catch {
    avisar("Não deu para mover o card agora.");
  }
}

function Preferencias() {
  const config = usePomodoro((p) => p.config);
  const ocioso = usePomodoro((p) => p.ociosoMin);
  const campo = (rotulo: string, valor: number, min: number, max: number, mudar: (n: number) => void) => (
    <label className="tp-pref">
      <span>{rotulo}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isInteger(n) && n >= min && n <= max) mudar(n);
        }}
      />
      <span className="tp-pref__un">min</span>
    </label>
  );
  return (
    <details className="tp-prefs">
      <summary>Preferências</summary>
      <div className="tp-prefs__grade">
        {campo("Foco", config.focoMin, 5, 120, (n) => mudarPomodoro({ config: { ...config, focoMin: n } }))}
        {campo("Pausa", config.pausaMin, 1, 30, (n) => mudarPomodoro({ config: { ...config, pausaMin: n } }))}
        {campo("Pausa longa", config.longaMin, 5, 60, (n) => mudarPomodoro({ config: { ...config, longaMin: n } }))}
        {campo("Perguntar parado após", ocioso, 0, 120, (n) => mudarPomodoro({ ociosoMin: n }))}
      </div>
    </details>
  );
}

/* ───────────── Hoje ───────────── */

const CHAVE_LIMPAS = "mae:cronometro:limpas";
function lerLimpas(dia: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_LIMPAS) ?? "{}") as { dia?: string; ids?: string[] };
    return v.dia === dia && Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function Hoje() {
  const hoje = useTempo((e) => e.hoje);
  const rodando = useTempo((e) => e.rodando);
  const totais = useTempo((e) => e.totais);
  // os cards mudam de coluna no servidor: a lista de Concluídas acompanha
  useTempo((e) => e.cards);
  const diaHoje = diaLocal(agoraServidor());
  const [dia, setDia] = useState(diaHoje);
  const segunda = segundaDaSemana(diaHoje);
  const { semana } = useSemana(dia === diaHoje ? null : dia, "eu");
  // o painel só nasce no navegador: o que foi limpo hoje já vale no primeiro desenho
  const [limpas, setLimpas] = useState<string[]>(() => lerLimpas(diaHoje));

  const lista = useMemo(() => {
    if (dia !== diaHoje) return (semana?.cardsPorDia[dia] ?? []).map((x) => ({ card: x.card, ms: x.ms, de: null as number | null }));
    const m = new Map<string, { base: number; de: number | null; ultimo: number }>();
    for (const r of hoje) {
      const v = m.get(r.card) ?? { base: 0, de: null, ultimo: 0 };
      if (r.fim) v.base += duracaoMs(r, 0);
      else v.de = Date.parse(r.inicio);
      v.ultimo = Math.max(v.ultimo, Date.parse(r.inicio));
      m.set(r.card, v);
    }
    return [...m.entries()].sort((a, b) => b[1].ultimo - a[1].ultimo).map(([card, v]) => ({ card, ms: v.base, de: v.de }));
  }, [dia, diaHoje, hoje, semana]);

  const fazendo = lista.filter((x) => !saiuDaMao(cardDoTempo(x.card)?.coluna) || x.de !== null);
  const feitas = lista.filter((x) => saiuDaMao(cardDoTempo(x.card)?.coluna) && x.de === null && !limpas.includes(x.card));
  const totalDia = lista.reduce((a, x) => a + x.ms, 0);

  return (
    <div className="tp-hoje">
      <div className="tp-dias" role="radiogroup" aria-label="Dia">
        {NOMES_DIAS.map((n, i) => {
          const d = somarDias(segunda, i);
          const futuro = d > diaHoje;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={dia === d}
              disabled={futuro}
              onClick={() => setDia(d)}
              data-hoje={d === diaHoje || undefined}
            >
              <span>{n}</span>
              <b>{d.slice(8)}</b>
            </button>
          );
        })}
      </div>
      <p className="tp-hoje__total">
        <Contador de={dia === diaHoje && rodando ? Date.parse(rodando.inicio) : null} base={totalDia} formato="curto" />
        <span>{dia === diaHoje ? "hoje" : "nesse dia"}</span>
      </p>

      {fazendo.length ? (
        <ul className="tp-lista">
          {fazendo.map((x) => (
            <LinhaDoCard key={x.card} card={x.card} ms={x.ms} de={x.de} />
          ))}
        </ul>
      ) : (
        <p className="tp-sutil">{dia === diaHoje ? "Nada cronometrado ainda." : "Nada nesse dia."}</p>
      )}

      {feitas.length ? (
        <section className="tp-feitas">
          <div className="tp-feitas__topo">
            <h3>Concluídas</h3>
            <button
              type="button"
              className="tp-link"
              onClick={() => {
                const ids = [...limpas, ...feitas.map((x) => x.card)];
                setLimpas(ids);
                try {
                  localStorage.setItem(CHAVE_LIMPAS, JSON.stringify({ dia: diaHoje, ids }));
                } catch {}
              }}
            >
              Limpar
            </button>
          </div>
          <ul className="tp-lista tp-lista--feitas">
            {feitas.map((x) => (
              <li key={x.card} className="tp-linha">
                <Icone nome="check" size={14} className="tp-linha__check" />
                <span className="tp-linha__tema">{cardDoTempo(x.card)?.tema ?? "Card"}</span>
                <span className="tp-linha__levou">levou {duracaoCurta(totais[x.card] ?? x.ms)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function LinhaDoCard({ card, ms, de }: { card: string; ms: number; de: number | null }) {
  const rodando = useTempo((e) => e.rodando?.card === card);
  const info = cardDoTempo(card);
  const cliente = nomeDoCliente(info?.cliente);
  return (
    <li className="tp-linha" data-rodando={rodando || undefined}>
      <button
        type="button"
        className="tp-play"
        aria-pressed={rodando}
        aria-label={rodando ? `Pausar ${info?.tema ?? "card"}` : `Retomar ${info?.tema ?? "card"}`}
        onClick={() => void (rodando ? pausar() : iniciar(card))}
      >
        <span className="tp-play__icone" aria-hidden="true">
          <Icone nome={rodando ? "pausa" : "tocar"} size={12} />
        </span>
      </button>
      <span className="tp-linha__texto">
        <span className="tp-linha__tema">{info?.tema ?? "Card"}</span>
        {cliente ? <span className="tp-linha__cliente">@{cliente}</span> : null}
      </span>
      <Contador de={de} base={ms} formato="curto" className="tp-linha__tempo" />
    </li>
  );
}

/* ───────────── Semana ───────────── */

function SemanaDoPainel() {
  const time = useTempo((e) => e.time);
  const [quem, setQuem] = useState<"eu" | "time">("eu");
  const [dia, setDia] = useState(() => diaLocal(agoraServidor()));
  const { semana, nomes, carregando } = useSemana(dia, quem);
  return (
    <div className="tp-semana">
      <div className="tp-semana__nav">
        <button type="button" className="q-icone-btn" aria-label="Semana anterior" onClick={() => setDia((d) => somarDias(segundaDaSemana(d), -7))}>
          <Icone nome="voltar" size={16} />
        </button>
        <span>{semana ? rotuloDaSemana(semana) : "…"}</span>
        <button
          type="button"
          className="q-icone-btn"
          aria-label="Próxima semana"
          disabled={segundaDaSemana(dia) >= segundaDaSemana(diaLocal(agoraServidor()))}
          onClick={() => setDia((d) => somarDias(segundaDaSemana(d), 7))}
        >
          <Icone nome="seta" size={16} />
        </button>
        {time ? (
          <div className="tp-quem" role="radiogroup" aria-label="De quem">
            {(["eu", "time"] as const).map((q) => (
              <button key={q} type="button" role="radio" aria-checked={quem === q} onClick={() => setQuem(q)}>
                {q === "eu" ? "Eu" : "Time"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {semana && nomes ? <ResumoDaSemana semana={semana} nomes={nomes} compacto carregando={carregando} /> : <p className="tp-sutil">Carregando…</p>}
      <Link className="tp-mais" href="/app/tempo" onClick={fecharPainel}>
        <Icone nome="numeros" size={15} /> Tempo por tipo de vídeo
        <Icone nome="seta" size={13} />
      </Link>
    </div>
  );
}

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function rotuloDaSemana(s: Pick<Semana, "segunda">): string {
  const fim = somarDias(s.segunda, 6);
  const f = (d: string) => `${Number(d.slice(8))} ${MES[Number(d.slice(5, 7)) - 1]}`;
  return `${f(s.segunda)} – ${f(fim)}`;
}

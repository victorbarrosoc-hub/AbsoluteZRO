"use client";
/**
 * Ajustar o tempo de um card (folha por cima do painel): somar tempo esquecido (atalhos de 5 a 60 min, com motivo) e
 * corrigir o início ou o fim de cada sessão minha. Só o meu tempo: o banco recusa mexer no de outra pessoa.
 */
import { useEffect, useState } from "react";
import { duracaoCurta, duracaoMs, type Registro } from "@/lib/tempo/calculo";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { adicionarTempo, agoraServidor, ajustarSessao, apagarSessao, useTempo } from "./loja";

const ATALHOS = [5, 15, 30, 60];

/** ISO → valor de <input type="datetime-local"> no horário de quem vê. */
function paraCampo(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const doCampo = (v: string) => (v ? new Date(v).toISOString() : null);

export function Ajustar({ card, tema, aoFechar }: { card: string; tema: string; aoFechar: () => void }) {
  return (
    <Folha rotulo={`Ajustar o tempo de ${tema}`} aoFechar={aoFechar} tamanho="acao" className="tp-ajustar">
      <Corpo card={card} tema={tema} />
    </Folha>
  );
}

function Corpo({ card, tema }: { card: string; tema: string }) {
  const fechar = useFecharFolha();
  const [sessoes, setSessoes] = useState<Registro[] | null>(null);
  const [minutos, setMinutos] = useState(15);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState(false);
  const versao = useTempo((e) => `${e.hoje.length}:${e.rodando?.id ?? ""}:${e.totais[card] ?? 0}`);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/tempo?card=${encodeURIComponent(card)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { sessoes: [] }))
      .then((d) => vivo && setSessoes(d.sessoes ?? []))
      .catch(() => vivo && setSessoes([]));
    return () => {
      vivo = false;
    };
  }, [card, versao]);

  const total = (sessoes ?? []).reduce((a, r) => a + duracaoMs(r, agoraServidor()), 0);
  return (
    <div className="tp-ajustar__corpo">
      <div className="tp-ajustar__topo">
        <h2>Ajustar</h2>
        <span>{tema}</span>
      </div>
      <p className="tp-ajustar__total">
        <strong>{duracaoCurta(total)}</strong> seu tempo aqui
      </p>

      <form
        className="tp-somar"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!motivo.trim()) {
            setErro(true);
            return;
          }
          if (await adicionarTempo(card, minutos, motivo.trim())) {
            setMotivo("");
            setErro(false);
          }
        }}
      >
        <span className="tp-somar__rotulo">Somar</span>
        <div className="tp-chips" role="radiogroup" aria-label="Quanto somar">
          {ATALHOS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={minutos === m} onClick={() => setMinutos(m)}>
              +{m < 60 ? `${m}min` : "1h"}
            </button>
          ))}
          <label className="tp-chips__outro">
            <span className="sr-only">Minutos</span>
            <input
              type="number"
              min={1}
              max={1440}
              inputMode="numeric"
              value={minutos}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isInteger(n) && n >= 1 && n <= 1440) setMinutos(n);
              }}
            />
            <span>min</span>
          </label>
        </div>
        <input
          className={`tp-motivo${erro ? " q-campo--erro" : ""}`}
          placeholder="Motivo (ex.: esqueci de ligar)"
          maxLength={200}
          value={motivo}
          aria-invalid={erro || undefined}
          aria-label="Motivo"
          onChange={(e) => {
            setMotivo(e.currentTarget.value);
            setErro(false);
          }}
        />
        <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink">
          Somar {duracaoCurta(minutos * 60_000)}
        </button>
      </form>

      <section className="tp-sessoes">
        <h3>Sessões</h3>
        {sessoes === null ? (
          <p className="tp-sutil">Carregando…</p>
        ) : !sessoes.length ? (
          <p className="tp-sutil">Nenhuma ainda.</p>
        ) : (
          <ul>
            {sessoes.slice(0, 12).map((s) => (
              <li key={s.id} data-origem={s.origem}>
                <input
                  type="datetime-local"
                  aria-label="Início"
                  defaultValue={paraCampo(s.inicio)}
                  onBlur={(e) => {
                    const v = doCampo(e.currentTarget.value);
                    if (v && v !== s.inicio) void ajustarSessao(s.id, { inicio: v });
                  }}
                />
                <span aria-hidden="true">→</span>
                {s.fim ? (
                  <input
                    type="datetime-local"
                    aria-label="Fim"
                    defaultValue={paraCampo(s.fim)}
                    onBlur={(e) => {
                      const v = doCampo(e.currentTarget.value);
                      if (v && v !== s.fim) void ajustarSessao(s.id, { fim: v });
                    }}
                  />
                ) : (
                  <span className="tp-sessoes__agora">agora</span>
                )}
                <b>{duracaoCurta(duracaoMs(s, agoraServidor()))}</b>
                <button
                  type="button"
                  className="q-icone-btn"
                  aria-label="Tirar esta sessão"
                  title={s.motivo ?? "Tirar"}
                  onClick={() => void apagarSessao(s.id)}
                >
                  <Icone nome="lixo" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <button type="button" className="glass-btn glass-btn--sm tp-ajustar__pronto" onClick={fechar}>
        Pronto
      </button>
    </div>
  );
}

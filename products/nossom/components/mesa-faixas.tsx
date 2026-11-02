'use client';
// A mesa de faixas (prévia aprovada pelo titular em 02/11/2026): o tratamento visto como numa DAW. Cada passo que levou
// à versão aberta é uma faixa com a onda dele; "Ouvir" troca o som no mesmo ponto (A · B · C); o mixer mostra o volume
// e o pico medidos de cada passo; a cadeia mostra o que a Z e a Quasar Presence fizeram. Toca no player da plataforma.
import { memo, useEffect, useMemo, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { player, usePlayer } from '@/lib/player';
import { formatTime } from '@/lib/audio';
import {
  bandasPresence,
  cadeia,
  nomeCurto,
  nomeDaFaixa,
  papel,
  resumoDaZ,
  umaCasa,
  type PapelFaixa,
} from '@/lib/mesa';
import type { Version } from '@/lib/storage';

const COR: Record<PapelFaixa, string> = {
  original: 'var(--mesa-original)',
  z: 'var(--mesa-z)',
  presence: 'var(--mesa-presence)',
  ajuste: 'var(--mesa-ajuste)',
};

/** A onda medida (240 picos) desenhada uma vez por tamanho; nada por quadro. */
const Onda = memo(function Onda({ wave, cor }: { wave: number[]; cor: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const desenhar = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('color') || cor;
      const meio = height / 2,
        passo = width / Math.max(1, wave.length);
      for (let i = 0; i < wave.length; i++) {
        const a = Math.min(1, wave[i]) * meio * 0.92;
        ctx.fillRect(
          i * passo,
          meio - Math.max(0.5, a),
          Math.max(1, passo * 0.62),
          Math.max(1, a * 2),
        );
      }
    };
    desenhar();
    const observador = new ResizeObserver(desenhar);
    observador.observe(canvas);
    return () => observador.disconnect();
  }, [wave, cor]);
  return <canvas ref={ref} className="mesa-onda-canvas" aria-hidden="true" />;
});

const medida = (n: number | null) => (n === null ? '—' : umaCasa(n));

export default function MesaFaixas({
  versions,
  activeId,
  projeto,
}: {
  versions: Version[];
  activeId: string;
  projeto: { id: string; nome: string; dono: string };
}) {
  const faixas = useMemo(() => cadeia(versions, activeId), [versions, activeId]);
  const p = usePlayer();
  const daqui = !!p.faixa && p.faixa.projectId === projeto.id;
  const ouvindo = faixas.find((v) => daqui && p.faixa?.chave === v.id) ?? null;
  const duracao = faixas[0]?.info.duration || 1;
  const tempo = ouvindo ? p.tempo : 0;
  const resumo = resumoDaZ(faixas);
  const papeis = faixas.map(papel);
  if (faixas.length < 2) return null;

  const carregar = (v: Version, tocar: boolean, em = tempo) =>
    player.carregar(
      {
        chave: v.id,
        titulo: v === faixas[0] ? 'Arquivo original' : v.label,
        projeto: projeto.nome,
        projectId: projeto.id,
        dono: projeto.dono,
        duracao: v.info.duration,
      },
      v.blob,
      { em, tocar },
    );
  // Trocar de faixa troca o som no mesmo ponto, tocando ou não.
  const ouvir = (v: Version) => {
    if (ouvindo?.id === v.id) return player.alternar();
    void carregar(v, ouvindo ? p.tocando : true);
  };
  const alternar = () =>
    ouvindo ? player.alternar() : void carregar(faixas[faixas.length - 1], true);
  const buscar = (e: React.MouseEvent<HTMLDivElement>, v: Version) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.info.duration;
    if (ouvindo) player.buscar(t);
    else void carregar(v, false, t);
  };
  const final = faixas[faixas.length - 1];
  const temZ = papeis.includes('z'),
    temPresence = papeis.includes('presence');
  const presence = faixas.find((v, i) => papel(v, i) === 'presence');
  const bandas = bandasPresence(presence?.processing?.broadcast);

  return (
    <section className="mesa" aria-label="Faixas do tratamento">
      <header className="mesa-topo">
        <button
          className="mesa-play"
          onClick={alternar}
          aria-label={ouvindo && p.tocando ? 'Pausar' : 'Tocar'}
        >
          {ouvindo && p.tocando ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="mesa-tempo" aria-label="Tempo">
          {formatTime(tempo)}
          <small> / {formatTime(duracao)}</small>
        </span>
        {resumo && (
          <div className="mesa-z">
            <span className="mesa-zsim" aria-hidden="true">
              Z
            </span>
            <p>{resumo.frase}</p>
          </div>
        )}
        {resumo && resumo.chips.length > 0 && (
          <ul className="mesa-chips" aria-label="Medições do resultado">
            {resumo.chips.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </header>

      <div className="mesa-faixas" role="group" aria-label="Faixas">
        {faixas.map((v, i) => {
          const pp = papeis[i];
          const nome = nomeDaFaixa(v, i);
          const ativa = ouvindo ? ouvindo.id === v.id : i === faixas.length - 1;
          return (
            <div
              key={v.id}
              className={`mesa-faixa${ativa ? ' is-ativa' : ''}`}
              style={{ '--c': COR[pp] } as React.CSSProperties}
            >
              <div className="mesa-cab">
                <strong>{nome}</strong>
                <button
                  className="mesa-ouvir"
                  aria-pressed={!!ouvindo && ouvindo.id === v.id}
                  aria-label={`Ouvir ${nome}`}
                  onClick={() => ouvir(v)}
                >
                  {ouvindo?.id === v.id && p.tocando ? 'Tocando' : 'Ouvir'}
                </button>
              </div>
              <div className="mesa-onda" onClick={(e) => buscar(e, v)}>
                <Onda wave={v.info.wave} cor={COR[pp]} />
              </div>
            </div>
          );
        })}
        <span
          className="mesa-cabeca"
          aria-hidden="true"
          style={{ '--t': Math.min(1, tempo / duracao) } as React.CSSProperties}
        />
      </div>

      <div className="mesa-baixo">
        <div className="mesa-mixer" role="group" aria-label="Mixer">
          {faixas.map((v, i) => (
            <Canal key={v.id} nome={nomeCurto(v, i)} cor={COR[papeis[i]]} v={v} />
          ))}
          <Canal nome="Saída" cor="var(--mesa-saida)" v={final} saida />
        </div>
        {(temZ || temPresence) && (
          <ol className="mesa-cadeia" aria-label="Cadeia">
            {temZ && (
              <li style={{ '--c': COR.z } as React.CSSProperties}>
                <header>
                  <i aria-hidden="true" />
                  <strong>Melhorar com a Z</strong>
                  <small>
                    {faixas.some((v) => v.processing?.iaAvancada) ? 'avançada' : 'automático'}
                  </small>
                </header>
              </li>
            )}
            {temPresence && (
              <li style={{ '--c': COR.presence } as React.CSSProperties}>
                <header>
                  <i aria-hidden="true" />
                  <strong>Quasar Presence</strong>
                  <small>4 bandas</small>
                </header>
                <ul className="mesa-bandas">
                  {bandas.map((b) => (
                    <li
                      key={b.nome}
                      title={`${b.faixa} · limiar ${b.threshold} dB · razão ${b.ratio}:1`}
                      style={
                        { '--h': Math.min(1, Math.abs(b.threshold) / 30) } as React.CSSProperties
                      }
                    >
                      <span aria-hidden="true" />
                      {b.nome}
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {temPresence && (
              <li style={{ '--c': COR.presence } as React.CSSProperties}>
                <header>
                  <i aria-hidden="true" />
                  <strong>Limite</strong>
                  <small>−3 dB</small>
                </header>
              </li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}

function Canal({
  nome,
  cor,
  v,
  saida = false,
}: {
  nome: string;
  cor: string;
  v: Version;
  saida?: boolean;
}) {
  // A barra é o volume medido (LUFS de −40 a 0), não um nível ao vivo.
  const nivel = v.metrics.lufs === null ? 0 : Math.max(0, Math.min(1, (v.metrics.lufs + 40) / 40));
  return (
    <div
      className={`mesa-canal${saida ? ' is-saida' : ''}`}
      style={{ '--c': cor, '--m': nivel } as React.CSSProperties}
      title={`${nome}: ${medida(v.metrics.lufs)} LUFS · pico ${medida(v.metrics.truePeak)} dBTP`}
    >
      <strong>{nome}</strong>
      <span className="mesa-medidor" aria-hidden="true">
        <i />
      </span>
      <span className="mesa-db">{medida(v.metrics.lufs)} LUFS</span>
      <small>pico {medida(v.metrics.truePeak)}</small>
    </div>
  );
}

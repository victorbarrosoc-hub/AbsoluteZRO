'use client';
import { memo, useEffect, useRef, useState } from 'react';
import { player, usePlayer } from '@/lib/player';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Repeat2 } from 'lucide-react';
import type { Version } from '@/lib/storage';
import { formatTime } from '@/lib/audio';
export const WavePlayer = memo(function WavePlayer({
  original,
  version,
  region,
  onRegion,
  previewOnly = false,
  projeto,
}: {
  original: Version;
  version: Version;
  region: { start: number; end: number } | null;
  onRegion: (region: { start: number; end: number } | null) => void;
  previewOnly?: boolean;
  /** O projeto e a conta: o som toca no player da plataforma e continua ao trocar de página. */
  projeto: { id: string; nome: string; dono: string };
}) {
  const [mode, setMode] = useState<'original' | 'result'>('result'),
    [localTime, setLocalTime] = useState(0),
    [match, setMatch] = useState(true);
  const regionRef = useRef(region);
  const drag = useRef<{ edge: string; anchor: number } | null>(null);
  function setSelection(start: number, end: number) {
    const next = {
      start: Math.max(0, Math.min(start, duration - 0.1)),
      end: Math.min(duration, Math.max(end, start + 0.1)),
    };
    regionRef.current = next;
    onRegion(next);
  }
  const active = mode === 'original' ? original : version;
  const duration = active.info.duration;
  // O player da plataforma está com este projeto (a versão aberta ou o original)? Então a onda mostra e manda nele.
  const p = usePlayer();
  const dono =
    !!p.faixa &&
    p.faixa.projectId === projeto.id &&
    (p.faixa.chave === original.id || p.faixa.chave === version.id);
  const time = dono ? p.tempo : localTime;
  const playing = dono && p.tocando;
  const muted = p.mudo;
  const error = dono ? p.erro : '';
  const faixa = (v: Version) => ({
    chave: v.id,
    titulo: v === original ? 'Arquivo original' : v.label,
    projeto: projeto.nome,
    projectId: projeto.id,
    dono: projeto.dono,
    duracao: v.info.duration,
  });
  useEffect(() => {
    regionRef.current = region;
    if (dono) player.definirTrecho(region);
  }, [region, dono]);
  useEffect(() => () => player.definirTrecho(null), []);
  // A · B: trocar de lado com o player nesta onda troca o som no mesmo ponto, tocando ou não
  useEffect(() => {
    if (!dono || !p.faixa || p.faixa.chave === active.id) return;
    player.carregar(faixa(active), active.blob, { em: p.tempo, tocar: p.tocando });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dono, active.id]);
  useEffect(() => {
    if (!dono) return;
    const min = Math.min(original.metrics.lufs ?? -16, version.metrics.lufs ?? -16);
    player.definirGanho(
      match && active.metrics.lufs !== null
        ? Math.min(1, Math.pow(10, (min - active.metrics.lufs) / 20))
        : 1,
    );
  }, [dono, p.faixa?.chave, mode, active, match, original.metrics.lufs, version.metrics.lufs]);
  async function toggle() {
    if (dono && p.faixa?.chave === active.id) return player.alternar();
    const em =
      region && (localTime < region.start || localTime >= region.end) ? region.start : localTime;
    await player.carregar(faixa(active), active.blob, { em, tocar: true });
    player.definirTrecho(regionRef.current);
  }
  function seek(value: number) {
    if (dono) player.buscar(value);
    setLocalTime(value);
  }
  return (
    <div className="editor-player">
      <div className="player-title">
        <div>
          <span className="eyebrow">OUÇA CADA DETALHE</span>
          <h3>{mode === 'original' ? 'Arquivo original' : version.label}</h3>
        </div>
        <div className="segmented">
          <button
            className={mode === 'original' ? 'active' : ''}
            onClick={() => setMode('original')}
          >
            A · Original
          </button>
          <button className={mode === 'result' ? 'active' : ''} onClick={() => setMode('result')}>
            B · Resultado
          </button>
        </div>
      </div>
      <div className={`wave-container ${region ? 'is-selecting' : ''}`}>
        <svg viewBox="0 0 960 130" preserveAspectRatio="none" aria-hidden="true">
          {active.info.wave.map((value, i) => (
            <rect
              key={i}
              x={i * 4}
              y={65 - Math.max(2, value * 62)}
              width="2.1"
              height={Math.max(4, value * 124)}
              rx="1"
              fill={i / 240 < time / duration ? 'var(--up-text)' : 'var(--down-text)'}
            />
          ))}
          {region && (
            <rect
              x={(region.start / duration) * 960}
              y="0"
              width={((region.end - region.start) / duration) * 960}
              height="130"
              fill="var(--down)"
              fillOpacity=".08"
              stroke="var(--down)"
              strokeOpacity=".4"
            />
          )}
          <line
            x1={(time / duration) * 960}
            y1="0"
            x2={(time / duration) * 960}
            y2="130"
            stroke="var(--text)"
            strokeWidth="1.2"
          />
        </svg>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Posição da reprodução"
          className="wave-seek"
          style={region ? { pointerEvents: 'none' } : undefined}
        />
        {region && (
          <div
            className="wave-selection-surface"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              const point = Math.max(
                0,
                Math.min(duration, ((event.clientX - box.left) / box.width) * duration),
              );
              const edge =
                (event.target as HTMLElement).closest<HTMLElement>('[data-region-edge]')?.dataset
                  .regionEdge || 'range';
              drag.current = { edge, anchor: point };
              event.currentTarget.setPointerCapture(event.pointerId);
              if (edge === 'range')
                setSelection(Math.min(point, duration - 0.1), Math.min(duration, point + 0.1));
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const box = event.currentTarget.getBoundingClientRect();
              const point = Math.max(
                0,
                Math.min(duration, ((event.clientX - box.left) / box.width) * duration),
              );
              const current = regionRef.current!;
              if (drag.current.edge === 'start')
                setSelection(Math.min(point, current.end - 0.1), current.end);
              else if (drag.current.edge === 'end')
                setSelection(current.start, Math.max(point, current.start + 0.1));
              else
                setSelection(
                  Math.min(drag.current.anchor, point),
                  Math.max(drag.current.anchor, point),
                );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {(['start', 'end'] as const).map((edge) => (
              <button
                key={edge}
                type="button"
                className={`wave-region-handle ${edge}`}
                data-region-edge={edge}
                style={{ left: `${(region[edge] / duration) * 100}%` }}
                aria-label={edge === 'start' ? 'Ajustar início do trecho' : 'Ajustar fim do trecho'}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const value =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? duration
                        : region[edge] +
                          (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 0.1);
                  if (edge === 'start') setSelection(Math.min(value, region.end - 0.1), region.end);
                  else setSelection(region.start, Math.max(value, region.start + 0.1));
                }}
              >
                <span />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="player-times">
        <span>{formatTime(time)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="player-controls">
        <div>
          <button
            className="icon-button"
            aria-label="Voltar ao início"
            onClick={() => seek(region?.start ?? 0)}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="play-button"
            onClick={toggle}
            aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
          >
            {playing ? (
              <Pause size={21} fill="currentColor" />
            ) : (
              <Play size={21} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            onClick={() => player.definirMudo(!muted)}
            aria-label={muted ? 'Ativar som' : 'Silenciar'}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" checked={match} onChange={(e) => setMatch(e.target.checked)} />{' '}
          Igualar volume na comparação
        </label>
        <button
          className={`button small ${region ? 'selected' : 'secondary'}`}
          aria-pressed={!!region}
          onClick={() => {
            if (region) {
              regionRef.current = null;
              onRegion(null);
            } else {
              const start = Math.min(time, Math.max(0, duration - 0.1));
              setSelection(start, Math.min(duration, start + 10));
            }
          }}
        >
          <Repeat2 size={14} /> {region ? 'Áudio inteiro' : 'Selecionar trecho'}
        </button>
      </div>
      {!match && (
        <p className="inline-note">O volume pode influenciar sua percepção na comparação A/B.</p>
      )}
      {region && (
        <div className="region-fields">
          <label>
            De{' '}
            <input
              aria-label="Início do trecho em segundos"
              type="number"
              min={0}
              max={region.end - 0.1}
              step={0.1}
              value={region.start}
              onChange={(e) =>
                onRegion({
                  start: Math.max(0, Math.min(region.end - 0.1, Number(e.target.value))),
                  end: region.end,
                })
              }
            />{' '}
            s
          </label>
          <label>
            Até{' '}
            <input
              aria-label="Fim do trecho em segundos"
              type="number"
              min={region.start + 0.1}
              max={duration}
              step={0.1}
              value={Number(region.end.toFixed(2))}
              onChange={(e) =>
                onRegion({
                  start: region.start,
                  end: Math.max(region.start + 0.1, Math.min(duration, Number(e.target.value))),
                })
              }
            />{' '}
            s
          </label>
          <span>
            {previewOnly
              ? 'Arraste na onda para ouvir um trecho. A restauração com IA trata o áudio inteiro.'
              : 'Arraste na onda ou ajuste os tempos. O tratamento afeta apenas o trecho; o restante é preservado.'}
          </span>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

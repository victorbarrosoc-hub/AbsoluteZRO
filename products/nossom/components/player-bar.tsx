'use client';
// A barra do player, fixa embaixo em toda a plataforma (como a do Spotify): o último áudio tocado segue tocando ao
// trocar de ferramenta ou de página. Some quando não há áudio, nas telas de entrada e quando a pessoa fecha.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from 'lucide-react';
import { formatTime } from '@/lib/audio';
import { player, usePlayer } from '@/lib/player';

const SEM_BARRA = ['/entrar', '/auth', '/em-desenvolvimento', '/privacidade'];

export default function PlayerBar() {
  const p = usePlayer();
  const caminho = usePathname() || '/';
  const visivel = !!p.faixa && !SEM_BARRA.some((c) => caminho.startsWith(c));
  useEffect(() => {
    document.documentElement.classList.toggle('tem-player', visivel);
    return () => document.documentElement.classList.remove('tem-player');
  }, [visivel]);
  if (!visivel || !p.faixa) return null;
  const f = p.faixa;
  const dur = p.duracao || f.duracao || 0;
  const pct = dur ? Math.min(100, (p.tempo / dur) * 100) : 0;
  const noProjeto = caminho.startsWith('/studio');
  return (
    <section className="player-global" aria-label="Player">
      <div className="pg-faixa">
        <span className={`pg-capa ${p.tocando ? 'tocando' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 110 56" width="32" height="17">
            <path
              d="M3 42C28 14 35 0 55 18S82 43 107 8C78 48 72 53 50 36S25 24 3 42Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="pg-textos">
          <strong title={f.titulo}>{f.titulo}</strong>
          <Link
            href={`/studio/inicio?project=${encodeURIComponent(f.projectId)}`}
            title={noProjeto ? f.projeto : `Abrir ${f.projeto} no estúdio`}
          >
            {f.projeto}
          </Link>
        </span>
      </div>
      <div className="pg-centro">
        <div className="pg-botoes">
          <button
            type="button"
            className="pg-icone"
            onClick={() => player.pular(-10)}
            aria-label="Voltar 10 segundos"
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            className="pg-play"
            onClick={() => player.alternar()}
            disabled={p.carregando}
            aria-label={p.tocando ? 'Pausar' : 'Tocar'}
          >
            {p.tocando ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            className="pg-icone"
            onClick={() => player.pular(10)}
            aria-label="Avançar 10 segundos"
          >
            <RotateCw size={17} />
          </button>
        </div>
        <div className="pg-linha">
          <span>{formatTime(p.tempo)}</span>
          <input
            type="range"
            min={0}
            max={dur || 1}
            step={0.1}
            value={Math.min(p.tempo, dur || 1)}
            onChange={(e) => player.buscar(Number(e.target.value))}
            aria-label="Posição do áudio"
            style={{ '--pg-pct': `${pct}%` } as React.CSSProperties}
          />
          <span>{formatTime(dur)}</span>
        </div>
        {p.erro && (
          <p className="pg-erro" role="alert">
            {p.erro}
          </p>
        )}
      </div>
      <div className="pg-direita">
        {!noProjeto && (
          <Link
            className="pg-abrir"
            href={`/studio/inicio?project=${encodeURIComponent(f.projectId)}`}
          >
            Abrir no estúdio
          </Link>
        )}
        <button
          type="button"
          className="pg-icone"
          onClick={() => player.definirMudo(!p.mudo)}
          aria-label={p.mudo ? 'Ativar som' : 'Silenciar'}
        >
          {p.mudo || p.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          className="pg-volume"
          min={0}
          max={1}
          step={0.01}
          value={p.mudo ? 0 : p.volume}
          onChange={(e) => {
            player.definirMudo(false);
            player.definirVolume(Number(e.target.value));
          }}
          aria-label="Volume"
          style={{ '--pg-pct': `${(p.mudo ? 0 : p.volume) * 100}%` } as React.CSSProperties}
        />
        <button
          type="button"
          className="pg-icone"
          onClick={() => player.fechar()}
          aria-label="Fechar o player"
        >
          <X size={18} />
        </button>
      </div>
      <div className="pg-progresso" style={{ width: `${pct}%` }} aria-hidden="true" />
    </section>
  );
}

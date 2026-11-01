'use client';
// O player da plataforma, em forma de ilha (escolha do titular, 01/11/2026): uma pílula de vidro embaixo, só com a
// capa, o nome, a onda viva e tocar/pausar; um fio de progresso na borda de baixo. Tocar na ilha a abre (progresso com
// tempo, voltar e avançar 10 s, volume, abrir no estúdio, fechar). O último áudio tocado segue tocando ao trocar de
// ferramenta ou de página. Some quando não há áudio, nas telas de entrada e quando a pessoa fecha.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from 'lucide-react';
import { formatTime } from '@/lib/audio';
import { player, usePlayer } from '@/lib/player';

const SEM_BARRA = ['/entrar', '/auth', '/em-desenvolvimento', '/privacidade'];

function Capa({ tocando }: { tocando: boolean }) {
  return (
    <span className={`pg-capa ${tocando ? 'tocando' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 110 56" width="26" height="14">
        <path
          d="M3 42C28 14 35 0 55 18S82 43 107 8C78 48 72 53 50 36S25 24 3 42Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export default function PlayerBar() {
  const p = usePlayer();
  const caminho = usePathname() || '/';
  const [aberta, setAberta] = useState(false);
  const ilha = useRef<HTMLElement>(null);
  const visivel = !!p.faixa && !SEM_BARRA.some((c) => caminho.startsWith(c));
  useEffect(() => {
    document.documentElement.classList.toggle('tem-player', visivel);
    return () => document.documentElement.classList.remove('tem-player');
  }, [visivel]);
  // aberta: Esc ou um toque fora fecha de volta para a ilha
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberta(false);
    const fora = (e: PointerEvent) => {
      if (ilha.current && !ilha.current.contains(e.target as Node)) setAberta(false);
    };
    window.addEventListener('keydown', tecla);
    window.addEventListener('pointerdown', fora);
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('pointerdown', fora);
    };
  }, [aberta]);
  if (!visivel || !p.faixa) return null;
  const f = p.faixa;
  const dur = p.duracao || f.duracao || 0;
  const pct = dur ? Math.min(100, (p.tempo / dur) * 100) : 0;
  const noEstudio = caminho.startsWith('/studio');
  const tocar = (
    <button
      type="button"
      className="pg-play"
      onClick={() => player.alternar()}
      disabled={p.carregando}
      aria-label={p.tocando ? 'Pausar' : 'Tocar'}
    >
      {p.tocando ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
    </button>
  );
  const progresso = (
    <input
      type="range"
      className="pg-fio"
      min={0}
      max={dur || 1}
      step={0.1}
      value={Math.min(p.tempo, dur || 1)}
      onChange={(e) => player.buscar(Number(e.target.value))}
      aria-label="Posição do áudio"
      aria-valuetext={`${formatTime(p.tempo)} de ${formatTime(dur)}`}
      style={{ '--pg-pct': `${pct}%` } as React.CSSProperties}
    />
  );
  return (
    <section
      ref={ilha}
      className={`player-global ${aberta ? 'aberta' : ''} ${p.tocando ? 'tocando' : ''}`}
      aria-label="Player"
    >
      {!aberta ? (
        <>
          <button
            type="button"
            className="pg-ilha"
            onClick={() => setAberta(true)}
            aria-expanded={false}
            aria-label={`Abrir o player: ${f.titulo}`}
            title={f.projeto}
          >
            <Capa tocando={p.tocando} />
            <strong>{f.titulo}</strong>
            <span className="pg-vivo" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </button>
          {tocar}
          {progresso}
        </>
      ) : (
        <>
          <div className="pg-topo">
            <Capa tocando={p.tocando} />
            <span className="pg-textos">
              <strong title={f.titulo}>{f.titulo}</strong>
              <Link href={`/studio/inicio?project=${encodeURIComponent(f.projectId)}`}>
                {f.projeto}
              </Link>
            </span>
            {!noEstudio && (
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
              onClick={() => setAberta(false)}
              aria-expanded
              aria-label="Recolher o player"
            >
              <ChevronDown size={18} />
            </button>
            <button
              type="button"
              className="pg-icone"
              onClick={() => player.fechar()}
              aria-label="Fechar o player"
            >
              <X size={18} />
            </button>
          </div>
          <div className="pg-linha">
            <span>{formatTime(p.tempo)}</span>
            {progresso}
            <span>{formatTime(dur)}</span>
          </div>
          <div className="pg-botoes">
            <button
              type="button"
              className="pg-icone"
              onClick={() => player.definirMudo(!p.mudo)}
              aria-label={p.mudo ? 'Ativar som' : 'Silenciar'}
            >
              {p.mudo || p.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button
              type="button"
              className="pg-icone"
              onClick={() => player.pular(-10)}
              aria-label="Voltar 10 segundos"
            >
              <RotateCcw size={18} />
            </button>
            {tocar}
            <button
              type="button"
              className="pg-icone"
              onClick={() => player.pular(10)}
              aria-label="Avançar 10 segundos"
            >
              <RotateCw size={18} />
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
          </div>
        </>
      )}
      {p.erro && (
        <p className="pg-erro" role="alert">
          {p.erro}
        </p>
      )}
    </section>
  );
}

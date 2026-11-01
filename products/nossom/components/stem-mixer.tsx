'use client';
import { useEffect, useRef, useState } from 'react';
import { avisarOutroSom } from '@/lib/player';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { STEM_NAMES } from '@/lib/restoration';
import {
  flatMix,
  mixPresets,
  stemGain,
  stemLabels,
  STEM_MAX_DB,
  STEM_MIN_DB,
  type StemSetting,
} from '@/lib/stems';

type Playback = { context: AudioContext; gains: GainNode[]; sources: AudioBufferSourceNode[] };

/** Five faders over the separated stems, heard live; the version is rendered by the parent. */
export default function StemMixer({
  files,
  gainDb,
  busy,
  onRender,
}: {
  files: Blob[];
  gainDb: number;
  busy: boolean;
  onRender: (settings: StemSetting[]) => void;
}) {
  const [settings, setSettings] = useState<StemSetting[]>(flatMix);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const playback = useRef<Playback | null>(null);
  const buffers = useRef<AudioBuffer[] | null>(null);
  const restore = 10 ** (-gainDb / 20);

  // New stems (another project or a new separation) invalidate the decoded preview.
  useEffect(() => {
    buffers.current = null;
    return () => stop();
  }, [files]);

  function stop() {
    const current = playback.current;
    playback.current = null;
    setPlaying(false);
    if (!current) return;
    current.sources.forEach((s) => s.stop());
    void current.context.close();
  }

  // o player da plataforma começou a tocar: o mixer para
  useEffect(() => {
    const parar = () => stop();
    window.addEventListener('nossom:player-tocou', parar);
    return () => window.removeEventListener('nossom:player-tocou', parar);
  });

  async function play() {
    if (playing) return stop();
    avisarOutroSom();
    setLoading(true);
    try {
      const context = new AudioContext({ sampleRate: 44100 });
      buffers.current ??= await Promise.all(
        files.map(async (f) => context.decodeAudioData(await f.arrayBuffer())),
      );
      const gains = buffers.current.map((_, i) => {
        const node = context.createGain();
        node.gain.value = stemGain(settings[i]) * restore;
        node.connect(context.destination);
        return node;
      });
      const sources = buffers.current.map((buffer, i) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gains[i]);
        return source;
      });
      // One start time for all five: they stay sample-aligned.
      const at = context.currentTime + 0.05;
      sources.forEach((s) => s.start(at));
      sources[0].onended = () => playback.current?.context === context && stop();
      playback.current = { context, gains, sources };
      setPlaying(true);
    } finally {
      setLoading(false);
    }
  }

  function update(next: StemSetting[]) {
    setSettings(next);
    const current = playback.current;
    if (current)
      next.forEach((s, i) =>
        current.gains[i].gain.setTargetAtTime(
          stemGain(s) * restore,
          current.context.currentTime,
          0.02,
        ),
      );
  }
  const change = (i: number, patch: Partial<StemSetting>) =>
    update(settings.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="stem-mixer">
      <div className="stem-presets" role="group" aria-label="Atalhos do remix">
        {mixPresets.map((preset) => {
          const active = preset.settings().every((s, i) => stemGain(s) === stemGain(settings[i]));
          return (
            <button
              key={preset.id}
              className={active ? 'active' : ''}
              aria-pressed={active}
              disabled={busy}
              onClick={() => update(preset.settings())}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <ul className="stem-rows" aria-label="Faixas">
        {STEM_NAMES.map((name, i) => {
          const s = settings[i];
          const label = stemLabels[name];
          const silent = stemGain(s) === 0;
          return (
            <li key={name} className={silent ? 'muted' : ''}>
              <span className="stem-name">{label}</span>
              <input
                type="range"
                aria-label={`Volume: ${label}`}
                aria-valuetext={silent ? 'mudo' : `${s.db} dB`}
                min={STEM_MIN_DB}
                max={STEM_MAX_DB}
                step={1}
                value={s.db}
                disabled={busy}
                onChange={(e) => change(i, { db: Number(e.target.value), muted: false })}
              />
              <output>{silent ? 'mudo' : `${s.db > 0 ? '+' : ''}${s.db} dB`}</output>
              <button
                className="icon-button"
                aria-label={`Voltar ${label} a 0 dB`}
                title="0 dB"
                disabled={busy || (s.db === 0 && !s.muted)}
                onClick={() => change(i, { db: 0, muted: false })}
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Mudo: ${label}`}
                aria-pressed={s.muted}
                disabled={busy}
                onClick={() => change(i, { muted: !s.muted })}
              >
                {s.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="stem-actions">
        <button
          className="button secondary small"
          disabled={busy || loading}
          onClick={() => void play()}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}{' '}
          {playing ? 'Parar' : loading ? 'Preparando…' : 'Ouvir remix'}
        </button>
        <button
          className="button primary small"
          disabled={busy || settings.every((s) => stemGain(s) === 0)}
          onClick={() => {
            stop();
            onRender(settings);
          }}
        >
          Criar versão
        </button>
      </div>
    </div>
  );
}

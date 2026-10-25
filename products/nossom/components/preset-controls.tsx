'use client';
import { eqFrequencies, eqPresets, type EqGains } from '@/lib/equalizer';
import { freshBroadcast, type BroadcastSettings } from '@/lib/broadcast';
export function EqualizerControls({
  gains,
  highpass,
  preset,
  onPreset,
  onGains,
  onHighpass,
  disabled,
}: {
  gains: EqGains;
  highpass: number;
  preset: string;
  onPreset: (id: string) => void;
  onGains: (g: EqGains) => void;
  onHighpass: (n: number) => void;
  disabled: boolean;
}) {
  const points = gains.map((g, i) => `${30 + i * 135},${90 - g * 5}`).join(' ');
  return (
    <section className="eq-controls">
      <div className="preset-grid" role="group" aria-label="Presets de equalização">
        {eqPresets.map((p) => (
          <button
            key={p.id}
            aria-pressed={preset === p.id}
            className={preset === p.id ? 'active' : ''}
            disabled={disabled}
            onClick={() => onPreset(p.id)}
          >
            <strong>{p.label}</strong>
            <span>{p.description}</span>
          </button>
        ))}
      </div>
      <svg
        className="eq-graph"
        viewBox="0 0 600 190"
        role="img"
        aria-label="Ganho das cinco bandas de equalização, de menos 12 a mais 12 decibéis"
      >
        <line x1="15" y1="90" x2="585" y2="90" stroke="currentColor" opacity=".2" />
        <polyline points={points} fill="none" stroke="var(--up-text)" strokeWidth="2" />
        {gains.map((g, i) => (
          <g key={i}>
            <circle cx={30 + i * 135} cy={90 - g * 5} r="5" fill="var(--up-text)" />
            <text x={30 + i * 135} y="180" fill="currentColor" textAnchor="middle" fontSize="12">
              {eqFrequencies[i] >= 1000 ? `${eqFrequencies[i] / 1000}k` : eqFrequencies[i]} Hz
            </text>
          </g>
        ))}
      </svg>
      <div className="eq-sliders">
        {gains.map((g, i) => (
          <label key={i}>
            <span>
              {eqFrequencies[i]} Hz{' '}
              <output>
                {g > 0 ? '+' : ''}
                {g} dB
              </output>
            </span>
            <input
              type="range"
              aria-label={`Ganho em ${eqFrequencies[i]} Hz`}
              min={-12}
              max={12}
              step={0.5}
              value={g}
              disabled={disabled}
              onChange={(e) => {
                const next = [...gains] as EqGains;
                next[i] = Number(e.target.value);
                onGains(next);
              }}
            />
          </label>
        ))}
        <label>
          <span>
            Corte de graves <output>{highpass} Hz</output>
          </span>
          <input
            type="range"
            aria-label="Corte de graves do EQ"
            min={20}
            max={300}
            step={5}
            value={highpass}
            disabled={disabled}
            onChange={(e) => onHighpass(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="field-hint">
        A curva mostra o ganho por banda. O motor reserva margem para os realces. Compare com volume
        igualado.
      </p>
    </section>
  );
}
function NumberSetting({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled: boolean;
  change: (v: number) => void;
}) {
  return (
    <label className="number-setting">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => change(Math.max(min, Math.min(max, Number(e.target.value))))}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
export function BroadcastControls({
  settings,
  onChange,
  disabled,
}: {
  settings: BroadcastSettings;
  onChange: (s: BroadcastSettings) => void;
  disabled: boolean;
}) {
  const edit = (key: keyof BroadcastSettings, value: number) =>
    onChange({ ...settings, [key]: value });
  return (
    <section className="broadcast-controls">
      <div className="preset-explanation">
        <div>
          <strong>Transmissão + Limite −3 dB</strong>
          <p>
            Valores das suas capturas. Quatro bandas, limitador multibanda e limitador final em modo
            pico, com canais vinculados.
          </p>
        </div>
        <button
          className="button secondary small"
          disabled={disabled}
          onClick={() => onChange(freshBroadcast())}
        >
          Restaurar valores da referência
        </button>
      </div>
      <div className="crossover-grid">
        {settings.crossovers.map((value, i) => (
          <NumberSetting
            key={i}
            label={`Crossover ${i + 1}`}
            value={value}
            min={[40, 400, 2500][i]}
            max={[350, 2500, 12000][i]}
            unit="Hz"
            disabled={disabled}
            change={(n) => {
              const copy = [...settings.crossovers] as [number, number, number];
              copy[i] = n;
              onChange({ ...settings, crossovers: copy });
            }}
          />
        ))}
      </div>
      <div className="broadcast-bands">
        {settings.bands.map((band, i) => (
          <fieldset key={i}>
            <legend>{['Graves', 'Médios graves', 'Médios agudos', 'Agudos'][i]}</legend>
            {(
              [
                { key: 'threshold', label: 'Limiar', min: -60, max: 0, step: 0.1, unit: 'dB' },
                { key: 'gain', label: 'Ganho', min: 0, max: 20, step: 0.1, unit: 'dB' },
                { key: 'ratio', label: 'Proporção', min: 1, max: 20, step: 0.1, unit: ':1' },
                { key: 'attack', label: 'Ataque', min: 0.1, max: 80, step: 0.1, unit: 'ms' },
                { key: 'release', label: 'Liberação', min: 1, max: 1000, step: 1, unit: 'ms' },
              ] as const
            ).map((v) => (
              <NumberSetting
                key={v.key}
                label={`${v.label} · banda ${i + 1}`}
                value={band[v.key]}
                min={v.min}
                max={v.max}
                step={v.step}
                unit={v.unit}
                disabled={disabled}
                change={(n) =>
                  onChange({
                    ...settings,
                    bands: settings.bands.map((b, j) => (j === i ? { ...b, [v.key]: n } : b)),
                  })
                }
              />
            ))}
          </fieldset>
        ))}
      </div>
      <div className="limiter-grid">
        <fieldset>
          <legend>Limitador multibanda</legend>
          <NumberSetting
            label="Limiar do limitador multibanda"
            value={settings.limiterThreshold}
            min={-24}
            max={0}
            step={0.1}
            unit="dB"
            disabled={disabled}
            change={(n) => edit('limiterThreshold', n)}
          />
          <NumberSetting
            label="Margem multibanda"
            value={settings.limiterMargin}
            min={-12}
            max={0}
            step={0.1}
            unit="dB"
            disabled={disabled}
            change={(n) => edit('limiterMargin', n)}
          />
          <NumberSetting
            label="Ataque multibanda"
            value={settings.limiterAttack}
            min={0.1}
            max={80}
            step={0.1}
            unit="ms"
            disabled={disabled}
            change={(n) => edit('limiterAttack', n)}
          />
          <NumberSetting
            label="Liberação multibanda"
            value={settings.limiterRelease}
            min={1}
            max={1000}
            unit="ms"
            disabled={disabled}
            change={(n) => edit('limiterRelease', n)}
          />
        </fieldset>
        <fieldset>
          <legend>Limitador final · modo pico</legend>
          <NumberSetting
            label="Ganho de saída"
            value={settings.outputGain}
            min={-24}
            max={24}
            step={0.1}
            unit="dB"
            disabled={disabled}
            change={(n) => edit('outputGain', n)}
          />
          <NumberSetting
            label="Aumento de entrada"
            value={settings.inputBoost}
            min={0}
            max={24}
            step={0.1}
            unit="dB"
            disabled={disabled}
            change={(n) => edit('inputBoost', n)}
          />
          <NumberSetting
            label="Amplitude máxima"
            value={settings.ceiling}
            min={-12}
            max={-0.1}
            step={0.1}
            unit="dBFS"
            disabled={disabled}
            change={(n) => edit('ceiling', n)}
          />
          <NumberSetting
            label="Look-ahead"
            value={settings.lookahead}
            min={0.1}
            max={80}
            step={0.1}
            unit="ms"
            disabled={disabled}
            change={(n) => edit('lookahead', n)}
          />
          <NumberSetting
            label="Liberação final"
            value={settings.release}
            min={1}
            max={1000}
            unit="ms"
            disabled={disabled}
            change={(n) => edit('release', n)}
          />
        </fieldset>
      </div>
      <p className="field-hint">
        Crossover Linkwitz–Riley de 4ª ordem e compressores RMS. Os plugins Adobe usam curvas
        internas próprias: este preset reproduz os controles informados, com implementação NOSSOM. O
        teto é de pico amostral; confira o true peak medido antes da entrega.
      </p>
    </section>
  );
}

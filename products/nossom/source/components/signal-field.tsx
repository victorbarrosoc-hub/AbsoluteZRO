'use client';
import { useId } from 'react';
import { useAmbientMotion } from './use-ambient-motion';

// Fixed curves: motion moves the layers and light pulses, never morphs the paths.
export const signalCurves = Array.from({ length: 16 }, (_, i) => {
  const y = 26 + i * 9;
  return `M-100 ${y} C220 ${y + 185},390 ${y - 110},650 ${y + 85} S1010 ${y + 385},1550 ${y + 190}`;
});
export default function SignalField({ energetic = false }: { energetic?: boolean }) {
  const { ref, running } = useAmbientMotion();
  const id = useId();
  return (
    <div
      ref={ref}
      className={`signal-field ${running ? 'is-running' : ''} ${energetic ? 'is-energetic' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1440 1000" preserveAspectRatio="none" fill="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#78c9ff" stopOpacity=".05" />
            <stop offset=".5" stopColor="#9fddff" stopOpacity=".7" />
            <stop offset="1" stopColor="#5cbcff" stopOpacity=".2" />
          </linearGradient>
        </defs>
        <g className="signal-bundle" stroke={`url(#${id})`} strokeWidth=".8">
          {signalCurves.map((d) => (
            <path key={d} d={d} />
          ))}
          <g transform="translate(-80 420)">
            {signalCurves.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
        <g className="signal-lights" stroke="#c8efff" strokeWidth="1.8" strokeLinecap="round">
          {[3, 8, 13].map((n, i) => (
            <path className={`signal-pulse pulse-${i}`} key={n} d={signalCurves[n]} />
          ))}
          <path
            className="signal-pulse pulse-1"
            d={signalCurves[8]}
            transform="translate(-80 420)"
          />
        </g>
      </svg>
    </div>
  );
}

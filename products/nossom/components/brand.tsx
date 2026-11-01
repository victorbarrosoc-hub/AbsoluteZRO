import { useId } from 'react';
export function Brand({ compact = false }: { compact?: boolean }) {
  const id = useId();
  return (
    <span className="brand">
      <svg width="51" height="29" viewBox="0 0 110 56" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2=".8" y2="1">
            <stop stopColor="var(--logo-edge, #111318)" />
            <stop offset=".3" stopColor="var(--logo-mid, #404b56)" />
            <stop offset=".5" stopColor="#d7dce3" />
            <stop offset=".7" stopColor="var(--logo-edge, #111318)" />
            <stop offset="1" stopColor="var(--logo-mid, #7a8c9d)" />
          </linearGradient>
        </defs>
        <path
          d="M3 42C28 14 35 0 55 18S82 43 107 8C78 48 72 53 50 36S25 24 3 42Z"
          fill={`url(#${id})`}
        />
      </svg>
      {!compact && <span>NOSSOM</span>}
    </span>
  );
}
export function SoundRibbon({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={`sound-ribbon ${small ? 'small' : ''}`}
      viewBox="0 0 1000 600"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={small ? 'ribbonSmall' : 'ribbon'}
          x1="100"
          y1="400"
          x2="820"
          y2="150"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#324555" stopOpacity="0" />
          <stop offset=".3" stopColor="#7b9fc5" />
          <stop offset=".5" stopColor="#ecf5ff" />
          <stop offset=".73" stopColor="#7599d1" />
          <stop offset="1" stopColor="#34435d" stopOpacity=".15" />
        </linearGradient>
        <filter id={small ? 'glowSmall' : 'glow'}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g className="ribbon-flow">
        {Array.from({ length: 64 }, (_, i) => {
          const t = i / 63;
          return (
            <path
              key={i}
              d={`M -90 ${330 + i * 1.6} C 130 ${550 - i * 3.7}, 205 ${40 + i * 4.2}, 420 ${210 + i * 0.9} S 645 ${570 - i * 2.8}, 780 ${280 - i * 0.8} S 990 ${130 + i * 4.2}, 1120 ${210 + i * 3}`}
              stroke={`url(#${small ? 'ribbonSmall' : 'ribbon'})`}
              strokeWidth={i === 0 ? 2 : 0.65}
              opacity={0.2 + Math.sin(t * Math.PI) * 0.65}
            />
          );
        })}
        <path
          d="M -90 330 C 130 550,205 40,420 210 S645 570,780 280 S990 130,1120 210"
          stroke="#acd3ff"
          strokeWidth="5"
          opacity=".45"
          filter={`url(#${small ? 'glowSmall' : 'glow'})`}
        />
      </g>
    </svg>
  );
}

/**
 * O mesmo símbolo do NOSSOM (o traço de `Brand`) em cromo azulado, para quando ele é o protagonista da tela (o Início
 * do estúdio, titular 01/11/2026: "tira o 3D, valoriza a logo"). Só muda o acabamento, nunca a forma.
 */
export function SimboloCromo({ width = 200 }: { width?: number }) {
  const id = useId();
  const forma = 'M3 42C28 14 35 0 55 18S82 43 107 8C78 48 72 53 50 36S25 24 3 42Z';
  return (
    <svg
      className="simbolo-cromo"
      width={width}
      height={(width * 56) / 110}
      viewBox="0 0 110 56"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id + 'c'} x1="0" y1=".2" x2="1" y2=".8">
          <stop stopColor="#f4f8ff" />
          <stop offset=".25" stopColor="#9ec0ea" />
          <stop offset=".5" stopColor="#ffffff" />
          <stop offset=".75" stopColor="#4f84c9" />
          <stop offset="1" stopColor="#cfe2fb" />
        </linearGradient>
        <linearGradient id={id + 'b'} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fff" stopOpacity=".75" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={forma} fill={`url(#${id}c)`} />
      <path d={forma} fill={`url(#${id}b)`} opacity=".5" />
      <path d={forma} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth=".5" />
    </svg>
  );
}

import { useId } from 'react';
/**
 * A forma da Coroa sonora (Quasar Audio Lab, titular 01/11/2026): o anel de um eclipse cuja borda vibra como onda,
 * mais forte do lado da luz. Pequena, a onda fica mais larga e mais grossa para continuar lendo (como o anel da ZRO
 * perde a centelha abaixo de 20 px). Só a geometria mora aqui; cor e brilho vêm de quem usa.
 */
export function coroaPath(tamanho: number) {
  const freq = tamanho >= 120 ? 0.62 : tamanho >= 60 ? 0.42 : 0.3;
  const amp = tamanho >= 120 ? 2.6 : tamanho >= 60 ? 2.4 : 2.8;
  let d = '';
  for (let i = 0; i <= 360; i++) {
    const a = ((i - 90) * Math.PI) / 180;
    const r = 36 + Math.max(0, Math.cos(a)) * amp * Math.sin(i * freq);
    d +=
      (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(2) + ' ' + (50 + r * Math.sin(a)).toFixed(2);
  }
  return d + 'Z';
}
/** A Coroa sonora em uma cor só (segue `currentColor`): topo, menus, favicon. */
export function Coroa({ size = 28 }: { size?: number }) {
  return (
    <svg className="coroa" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d={coroaPath(size)}
        fill="none"
        stroke="currentColor"
        strokeWidth={size < 64 ? 7 : 4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
/** A Coroa sonora em luz: eclipse escuro, borda em azul-aço e o clarão no ponto de luz. */
export function CoroaLuz({ size = 200 }: { size?: number }) {
  const id = useId();
  return (
    <svg
      className="coroa-luz"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={id + 'a'} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#e6f0ff" />
          <stop offset=".45" stopColor="#7fa7e6" />
          <stop offset="1" stopColor="#2f6bff" />
        </linearGradient>
        <radialGradient id={id + 'f'}>
          <stop offset="0" stopColor="#fff" />
          <stop offset=".25" stopColor="#dcebff" />
          <stop offset=".6" stopColor="#6f9dff" stopOpacity=".5" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </radialGradient>
        <filter id={id + 'g'} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="50" cy="50" r="35" fill="#05070c" />
      <path
        d={coroaPath(size)}
        fill="none"
        stroke={`url(#${id}a)`}
        strokeWidth={size < 64 ? 3.4 : 1.9}
        filter={`url(#${id}g)`}
      />
      <circle cx="86" cy="50" r="10" fill={`url(#${id}f)`} />
      <path d="M70 50 L102 50" stroke="#fff" strokeWidth=".7" filter={`url(#${id}g)`} />
      <circle cx="86" cy="50" r="1.6" fill="#fff" />
    </svg>
  );
}
/**
 * A marca (titular, 01/11/2026): a Coroa, QUASAR na letra expandida (Archivo Expanded) e AUDIO LAB num selo de vidro
 * de borda grossa, como os botões de vidro do ecossistema. Compacta, só a Coroa.
 */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label={compact ? undefined : 'Quasar Audio Lab'}>
      <Coroa size={30} />
      {!compact && (
        <>
          <span className="brand-nome" aria-hidden="true">
            QUASAR
          </span>
          <span className="brand-selo" aria-hidden="true">
            AUDIO LAB
          </span>
        </>
      )}
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

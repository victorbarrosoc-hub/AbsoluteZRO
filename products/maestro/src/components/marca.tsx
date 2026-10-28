/**
 * Marcas. O símbolo do Maestro é o gesto da pauta, em latão (public/brand/maestro-symbol.svg), colorido em qualquer
 * tema; a Absolute ZRO é a marca flat (anel com centelha), uma cor só (herda `color`), pequena como assinatura.
 */

const GESTO =
  "M240 0.15C237.57 3.7 229.2 9.47 225.41 12.16C224.11 13.08 222.98 14.23 221.7 15.17C216.09 19.33 210.52 23.57 205.02 27.87C181.45 46.33 158.02 64.96 134.54 83.54C125.04 91.06 111.91 101.85 99.95 104.39C97.51 104.9 94.59 104.73 92.11 104.58C90.46 104.48 89.05 103.75 87.56 103.12C80.95 100.31 77.52 94.13 75.39 87.63C75.08 86.68 74.57 85.8 74.31 84.83C73.96 83.48 73.89 82.06 73.57 80.7C73.3 79.53 72.77 78.44 72.51 77.26C70.85 69.68 68.83 63.19 59.49 64.36C54.87 64.94 48.97 71.6 46.22 75.11C37.33 86.47 31.02 98.04 23.68 110.37C20.03 116.5 10.94 125.03 3.1 121.18C0 119.65 0.27 116.03 1.12 113.31C2.92 107.48 7.1 102.28 10.64 97.39C19.44 85.27 34.17 69.76 46 60.62C52.01 55.98 58.08 51.15 65.47 48.96C67.69 48.31 70.31 48.02 72.59 48.39C90.65 51.32 87.43 73.57 95.35 81.54C101.09 87.31 108.89 85.17 115.51 82.47C118.46 81.27 121.42 80.02 124.21 78.45C133.76 73.1 142.89 66.82 152.03 60.79C162.54 53.85 173.12 47 183.35 39.61C188.2 36.1 193.2 32.78 198 29.21C201.68 26.47 205.33 23.64 209.16 21.12C211.17 19.8 212.9 18.13 214.88 16.79C220.01 13.31 224.95 9.58 230.01 6C232.38 4.33 235.78 1.29 238.38 0.24C238.97 0 239.39 0.19 240 0.15Z";

/** O gesto da pauta, em latão. `width` em px; a altura segue a proporção do desenho. */
export function MaestroSimbolo({ width = 44, className, title }: { width?: number; className?: string; title?: string }) {
  const height = Math.round((width * 141.03) / 256);
  return (
    <svg
      className={className}
      viewBox="-8 -8 256 141.03"
      width={width}
      height={height}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path fill="var(--p-maestro)" d={GESTO} />
    </svg>
  );
}

const CENTELHA =
  "M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z";
const ANEL = "M9.70 50.00a34.30 34.30 0 1 0 68.60 0a34.30 34.30 0 1 0 -68.60 0ZM18.30 50.00a25.70 25.70 0 1 0 51.40 0a25.70 25.70 0 1 0 -51.40 0Z";

/** Marca flat Absolute ZRO (ADR 0017): uma cor só, herda `color`. Abaixo de 20 px fica só o anel. */
export function ZroSimbolo({ size = 20, title, className }: { size?: number; title?: string; className?: string }) {
  const soAnel = size < 20;
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {!soAnel && <path fill="currentColor" d={CENTELHA} />}
      <path fill="currentColor" fillRule="evenodd" d={ANEL} />
    </svg>
  );
}

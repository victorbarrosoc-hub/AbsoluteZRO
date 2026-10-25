import { ImageResponse } from 'next/og';
export function BrandMark({ width = 110, height = 56 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 110 56">
      <defs>
        <linearGradient id="silver" x1="0" y1="0" x2="0.8" y2="1">
          <stop stopColor="#eaf4ff" />
          <stop offset=".28" stopColor="#7891af" />
          <stop offset=".5" stopColor="#ffffff" />
          <stop offset=".72" stopColor="#73869c" />
          <stop offset="1" stopColor="#eef5ff" />
        </linearGradient>
      </defs>
      <path
        d="M3 42C28 14 35 0 55 18S82 43 107 8C78 48 72 53 50 36S25 24 3 42Z"
        fill="url(#silver)"
      />
    </svg>
  );
}
export function appIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 65% 20%, #267cae, #05142b 75%)',
      }}
    >
      <BrandMark width={size * 0.68} height={size * 0.35} />
    </div>,
    { width: size, height: size },
  );
}

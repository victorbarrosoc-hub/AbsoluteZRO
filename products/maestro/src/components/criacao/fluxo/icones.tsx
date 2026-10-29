/** Ícones de traço do Fluxo (1.6 px, `currentColor`), no mesmo desenho de src/components/icones.tsx. */
import type { ReactNode } from "react";

export type IconeFluxo = "cursor" | "nota" | "secao" | "ligar" | "roteiro" | "desfazer" | "refazer" | "menos" | "camera" | "enquadrar" | "canvas";

const CAMINHOS: Record<IconeFluxo, ReactNode> = {
  cursor: <path d="M6 4.5 18.5 11l-5.6 1.7-2.4 5.6L6 4.5Z" />,
  nota: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V14l-5 5H6.5A1.5 1.5 0 0 1 5 17.5v-12Z" />
      <path d="M14 19v-3.5a1.5 1.5 0 0 1 1.5-1.5H19" />
    </>
  ),
  secao: (
    <>
      <rect x="3.5" y="5.5" width="17" height="14" rx="3" />
      <path d="M3.5 9.5h17" />
    </>
  ),
  ligar: (
    <>
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <path d="M8 16c5 0 3-8 8-8.5" />
    </>
  ),
  roteiro: (
    <>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M9 11h6M9 14.5h6M9 18h3.5" />
    </>
  ),
  desfazer: <path d="M9 7 5 11l4 4M5.5 11H15a4 4 0 0 1 0 8h-3" />,
  refazer: <path d="m15 7 4 4-4 4M18.5 11H9a4 4 0 0 0 0 8h3" />,
  menos: <path d="M5 12h14" />,
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.3" />
    </>
  ),
  enquadrar: <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />,
  canvas: (
    <>
      <rect x="4" y="4" width="7" height="6" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
      <path d="M11 7h3.5a2 2 0 0 1 2 2v4" />
    </>
  ),
};

export function IconeF({ nome, size = 18 }: { nome: IconeFluxo; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}

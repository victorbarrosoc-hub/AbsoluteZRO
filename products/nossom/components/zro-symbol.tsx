/**
 * Símbolo da Absolute ZRO, versão flat oficial (26/10/2026): anel com a centelha de 4 pontas por trás do traço.
 * Uma cor só (herda a cor do texto), serve em fundo claro e escuro. Fonte: AbsoluteZRO/scripts/marca/vetor.
 */
export function ZroSymbol({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z" />
      <path
        fillRule="evenodd"
        d="M9.70 50.00a34.30 34.30 0 1 0 68.60 0a34.30 34.30 0 1 0 -68.60 0ZM18.30 50.00a25.70 25.70 0 1 0 51.40 0a25.70 25.70 0 1 0 -51.40 0Z"
      />
    </svg>
  );
}

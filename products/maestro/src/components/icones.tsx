/** Ícones de traço (1.6 px), em `currentColor`. Só os que o shell usa. */

export type NomeIcone =
  | "z"
  | "quadro"
  | "aprovacoes"
  | "clientes"
  | "projetos"
  | "ajustes"
  | "sol"
  | "lua"
  | "sair"
  | "externo"
  | "mais"
  | "busca"
  | "fechar"
  | "pontos"
  | "relogio"
  | "seta"
  | "voltar"
  | "lixo"
  | "whatsapp"
  | "email"
  | "editar"
  | "bandeira";

const CAMINHOS: Record<NomeIcone, React.ReactNode> = {
  z: <path d="M12 3c.6 4.2 2.3 5.9 9 6.3-6.7.4-8.4 2.1-9 6.3-.6-4.2-2.3-5.9-9-6.3 6.7-.4 8.4-2.1 9-6.3Z" fill="currentColor" stroke="none" />,
  quadro: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
      <rect x="16" y="4" width="5" height="8" rx="1.5" />
    </>
  ),
  aprovacoes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.3 2.3 4.8-5" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14c2.2 0 4 1.8 4 4" />
    </>
  ),
  projetos: (
    <>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  lua: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  sair: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l5 4-5 4M20 12H9" />
    </>
  ),
  externo: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  pontos: (
    <>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  seta: <path d="M5 12h14M13 6l6 6-6 6" />,
  voltar: <path d="M19 12H5M11 6l-6 6 6 6" />,
  lixo: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.3-4A8 8 0 1 1 8.4 19L4 20Z" />
      <path d="M9.2 9.3c.2 2.6 2.9 5.3 5.5 5.5l1.1-1.3-1.8-.9-.8.8c-1-.4-2-1.4-2.4-2.4l.8-.8-.9-1.8-1.5.9Z" />
    </>
  ),
  email: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  editar: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
  bandeira: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
};

export function Icone({ nome, size = 18, className }: { nome: NomeIcone; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}

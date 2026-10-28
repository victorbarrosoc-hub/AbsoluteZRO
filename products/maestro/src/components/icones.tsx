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
  | "bandeira"
  | "orcamento"
  | "dinheiro"
  | "agenda"
  | "freelas"
  | "inventario"
  | "documento"
  | "grade"
  | "imprimir"
  | "carro"
  | "alerta"
  | "alvo"
  | "tocar"
  | "pausa"
  | "quadroAnterior"
  | "quadroProximo"
  | "balao"
  | "copiar"
  | "link"
  | "cadeado"
  | "check"
  | "baixar";

const CAMINHOS: Record<NomeIcone, React.ReactNode> = {
  alvo: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </>
  ),
  tocar: <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />,
  pausa: <path d="M8 5.5v13M16 5.5v13" strokeWidth={2.6} />,
  quadroAnterior: <path d="M18 6v12l-8-6 8-6ZM6 6v12" />,
  quadroProximo: <path d="M6 6v12l8-6-8-6ZM18 6v12" />,
  balao: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />,
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />,
  cadeado: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  baixar: <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
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
  orcamento: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </>
  ),
  dinheiro: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 9.5v.01M17.5 14.5v.01" />
    </>
  ),
  agenda: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
    </>
  ),
  freelas: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20.5c.6-3.6 3.5-6 7-6s6.4 2.4 7 6" />
      <path d="M18.5 4.5l1.2 1.2M5.5 4.5 4.3 5.7" />
    </>
  ),
  inventario: (
    <>
      <rect x="3" y="8" width="13" height="10" rx="2" />
      <path d="m16 11.5 5-3v9l-5-3" />
      <circle cx="9.5" cy="13" r="2.4" />
    </>
  ),
  documento: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4M9 11h6M9 14.5h6M9 18h3" />
    </>
  ),
  grade: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
    </>
  ),
  imprimir: (
    <>
      <path d="M7 9V3.5h10V9" />
      <rect x="3.5" y="9" width="17" height="8" rx="2" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
  carro: (
    <>
      <path d="M4 16.5v-4l2-5h12l2 5v4" />
      <path d="M3 16.5h18v2H3zM4 12.5h16" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4.5M12 17.2v.01" />
    </>
  ),
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

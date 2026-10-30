/** Ícones de traço (1.6 px), em `currentColor`. Só os que o shell usa. */

export type NomeIcone =
  | "z"
  | "arquivos"
  | "pasta"
  | "filme"
  | "musica"
  | "nuvem"
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
  | "baixar"
  | "hoje"
  | "pedidos"
  | "marca"
  | "imagem"
  | "abaixo"
  | "lista"
  | "numeros"
  | "importar"
  | "retorno"
  | "pessoas"
  | "colunas"
  | "alca"
  | "arquivar"
  | "criacao"
  | "fluxo"
  | "letra"
  | "cena"
  | "camera"
  | "olho"
  | "enviar"
  | "versoes"
  | "compartilhar"
  | "adicionar"
  | "celular"
  | "computador";

const CAMINHOS: Record<NomeIcone, React.ReactNode> = {
  // o "Compartilhar" do Safari (quadrado aberto com a seta para cima) e o "Adicionar à Tela de Início"
  compartilhar: <path d="M8.5 9H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1.5M12 3.5V14M8.5 7 12 3.5 15.5 7" />,
  adicionar: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  celular: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 5.5h3" />
    </>
  ),
  computador: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2.5 19h19" />
    </>
  ),
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
  hoje: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
      <circle cx="12" cy="14.5" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  pedidos: <path d="M4 13.5 6.2 6a2 2 0 0 1 1.9-1.5h7.8A2 2 0 0 1 17.8 6l2.2 7.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.5Zm0 0h4.5l1.5 2.5h4l1.5-2.5H20" />,
  marca: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.3-1.6-1.3-2.8 0-1 .8-1.7 1.8-1.7h2.2a4 4 0 0 0 4-4C20.5 6.7 16.7 3.5 12 3.5Z" />
      <circle cx="7.8" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  imagem: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4" />
    </>
  ),
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
  arquivos: (
    <>
      <path d="M3.5 8A1.5 1.5 0 0 1 5 6.5h4l2 2h8A1.5 1.5 0 0 1 20.5 10v7.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V8Z" />
      <path d="M6 4.5h4l1.5 1.5" />
    </>
  ),
  pasta: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />,
  filme: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="m10.5 9.5 4 2.5-4 2.5v-5Z" />
    </>
  ),
  musica: (
    <>
      <path d="M9 17.5V6.5l10-2v11" />
      <circle cx="6.8" cy="17.5" r="2.2" />
      <circle cx="16.8" cy="15.5" r="2.2" />
    </>
  ),
  nuvem: <path d="M7.5 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.4 9.1 4.75 4.75 0 0 0 7.5 18.5Z" />,
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
  abaixo: <path d="m6 9.5 6 6 6-6" strokeWidth={2} />,
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
  lista: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth={1.8} />,
  numeros: <path d="M4 20h16M7 16.5v-5M12 16.5V7M17 16.5v-8" strokeWidth={1.8} />,
  importar: (
    <>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </>
  ),
  retorno: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9M12 8.5V12l2.5 2" />
    </>
  ),
  colunas: (
    <>
      <rect x="3.5" y="4" width="4.5" height="16" rx="1.5" />
      <rect x="9.75" y="4" width="4.5" height="16" rx="1.5" />
      <rect x="16" y="4" width="4.5" height="16" rx="1.5" />
    </>
  ),
  alca: <path d="M9 6.5h.01M15 6.5h.01M9 12h.01M15 12h.01M9 17.5h.01M15 17.5h.01" strokeWidth={2.6} />,
  arquivar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
  criacao: (
    <>
      <path d="M4.5 19.5 5.6 15 15.3 5.3a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9 18.4l-4.5 1.1Z" />
      <path d="M13.8 6.8l3.4 3.4M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z" />
    </>
  ),
  fluxo: (
    <>
      <rect x="3" y="4" width="7" height="5.5" rx="1.6" />
      <rect x="14" y="14.5" width="7" height="5.5" rx="1.6" />
      <circle cx="18" cy="6.5" r="2.4" />
      <path d="M10 6.8h5.6M6.5 9.5v5a2.5 2.5 0 0 0 2.5 2.5h5" />
    </>
  ),
  letra: <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />,
  cena: (
    <>
      <rect x="3.5" y="9" width="17" height="11" rx="2" />
      <path d="m3.8 9-.6-3.2 15.7-2.6.6 3.2M7.5 5.6 9.4 8.8M12.6 4.8l1.9 3.2" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </>
  ),
  // o avião de papel: o link foi para o cliente
  enviar: <path d="M20.5 3.5 10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5Z" />,
  olho: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  versoes: (
    <>
      <rect x="7" y="7" width="13" height="13" rx="2.5" />
      <path d="M4 15.5V6a2 2 0 0 1 2-2h9.5" />
    </>
  ),
  pessoas: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17 14.3c2 .5 3.2 2.1 3.5 4.7" />
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

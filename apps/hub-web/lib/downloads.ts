/**
 * Onde instalar cada ferramenta (página Downloads). Só links oficiais que existem: cada instalador foi conferido
 * com download real em 25/10/2026. Os arquivos ficam nos sites e releases de cada produto; o HUB não hospeda nem
 * repassa instaladores, e cada app continua com o próprio login.
 */
export type Os = 'mac' | 'windows' | 'mobile' | 'web'

export type DownloadOption = {
  os: Os
  label: string
  detail: string
  href: string
  /** Formato do arquivo baixado ("Instalador .dmg"), ou como abre. */
  format: string
}

export type DownloadEntry = {
  productId: string
  status: 'stable' | 'test' | 'web' | 'soon'
  /** Aviso honesto sobre a versão (assinatura, atualização automática). */
  note?: string
  options: DownloadOption[]
  /** Instalação pelo Terminal/PowerShell, que confere o arquivo e evita o aviso de app baixado. */
  terminal?: { mac?: string; windows?: string }
  firstOpen?: { mac?: string; windows?: string }
  moreUrl?: string
}

const NOSSOM_RELEASE = 'https://github.com/victorbarrosoc-hub/nossom/releases/download/desktop-v0.2.2/'

export const DOWNLOADS: DownloadEntry[] = [
  {
    productId: 'sobedesce',
    status: 'test',
    options: [
      { os: 'mac', label: 'Mac', detail: 'Apple Silicon e Intel', href: 'https://sobedesce.vercel.app/baixar/mac', format: 'Instalador .dmg' },
      { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11', href: 'https://sobedesce.vercel.app/baixar/windows', format: 'Instalador .exe' },
      { os: 'mobile', label: 'Celular', detail: 'iPhone e Android, pelo navegador', href: 'https://sobedesce.vercel.app/app/', format: 'Sem instalar' },
    ],
    terminal: { mac: 'curl -fsSL https://sobedesce.vercel.app/instalar.sh | bash', windows: 'irm https://sobedesce.vercel.app/instalar.ps1 | iex' },
    firstOpen: { mac: 'Na primeira vez: botão direito › Abrir › Abrir.', windows: 'Se o Windows avisar: Mais informações › Executar assim mesmo.' },
    moreUrl: 'https://sobedesce.vercel.app/#baixar',
  },
  {
    productId: 'synquei',
    status: 'stable',
    options: [
      { os: 'mac', label: 'Mac', detail: 'macOS 11 ou mais novo', href: 'https://synquei.vercel.app/baixar/mac', format: 'Instalador .dmg' },
      { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11', href: 'https://synquei.vercel.app/baixar/windows', format: 'Instalador .exe' },
      { os: 'web', label: 'Navegador', detail: 'Chrome, Edge ou Safari', href: 'https://synquei.vercel.app/app/', format: 'Sem instalar' },
    ],
    terminal: { mac: 'curl -fsSL https://synquei.vercel.app/instalar.sh | bash', windows: 'irm https://synquei.vercel.app/instalar.ps1 | iex' },
    firstOpen: {
      mac: 'Abra o .dmg e arraste para Aplicativos. Na primeira vez: botão direito › Abrir › Abrir.',
      windows: 'Se o Windows avisar: Mais informações › Executar assim mesmo.',
    },
    moreUrl: 'https://synquei.vercel.app/#baixar',
  },
  {
    productId: 'nossom',
    status: 'test',
    note: 'Prévia 0.2.2: sem notarização da Apple e sem atualização automática.',
    options: [
      {
        os: 'mac',
        label: 'Mac · Apple Silicon',
        detail: 'M1, M2, M3, M4 ou mais novo',
        href: NOSSOM_RELEASE + 'NOSSOM-0.2.2-mac-arm64.dmg',
        format: 'Instalador .dmg',
      },
      { os: 'mac', label: 'Mac · Intel', detail: 'Processador Intel', href: NOSSOM_RELEASE + 'NOSSOM-0.2.2-mac-x64.dmg', format: 'Instalador .dmg' },
      { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11, 64 bits', href: NOSSOM_RELEASE + 'NOSSOM-0.2.2-win-x64.exe', format: 'Instalador .exe' },
      { os: 'web', label: 'Navegador', detail: 'Estúdio completo, sem instalar', href: 'https://nossom-teal.vercel.app/studio', format: 'Sem instalar' },
    ],
    firstOpen: { mac: 'Se o Mac bloquear: Ajustes do Sistema › Privacidade e Segurança › Abrir Mesmo Assim.' },
    moreUrl: 'https://nossom-teal.vercel.app/apps',
  },
  {
    productId: 'tpeasy',
    status: 'web',
    note: 'Feito para iPhone e iPad. Instala pela tela de início, sem loja.',
    options: [
      {
        os: 'mobile',
        label: 'iPhone e iPad',
        detail: 'Safari › Compartilhar › Adicionar à Tela de Início',
        href: 'https://tpeasy.vercel.app/app/',
        format: 'App da web',
      },
    ],
  },
  {
    productId: 'carro-do-freela',
    status: 'web',
    note: 'Funciona no navegador, no computador e no celular.',
    options: [{ os: 'web', label: 'Navegador', detail: 'Computador ou celular', href: 'https://carrodofreela.com.br', format: 'Sem instalar' }],
  },
  { productId: 'ai-edit', status: 'soon', options: [] },
  { productId: 'finishing', status: 'soon', options: [] },
]

export const downloadFor = (productId: string) => DOWNLOADS.find((d) => d.productId === productId)
export const hasDesktopInstaller = (productId: string) => !!downloadFor(productId)?.options.some((o) => o.os === 'mac' || o.os === 'windows')

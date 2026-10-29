/**
 * Onde instalar cada ferramenta (página Downloads). Só links oficiais que existem: cada instalador foi conferido
 * com download real em 25/10/2026. Os arquivos ficam nos sites e releases de cada produto; o HUB não hospeda nem
 * repassa instaladores, e cada app continua com o próprio login.
 *
 * Gate de lançamento (ADR 0023): `DOWNLOADS` é o que existe; o que cada pessoa vê sai de `downloadsLiberados`, com os
 * produtos liberados para ela no canal `download` (vindos do banco). Produto fechado vira "Em desenvolvimento", sem
 * instalador, sem Terminal e sem link.
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
  /** Página da plataforma ("Conheça mais"). Produto fechado não tem. */
  site?: string
}

// Os repositórios são privados: nada aponta para o github.com. Cada site tem /baixar/<sistema>, que lê o Release com
// GITHUB_TOKEN e redireciona para o endereço assinado e temporário do arquivo.
const NOSSOM_BAIXAR = 'https://nossom-teal.vercel.app/baixar/'
// Maestro: pela própria Absolute ZRO (apps/hub-web/app/(site)/baixar/app/[id]/[arquivo]), com o gate do canal download.
const MAESTRO_BAIXAR = 'https://absolutezro.com/baixar/app/maestro/'

export const DOWNLOADS: DownloadEntry[] = [
  {
    productId: 'sobedesce',
    site: 'https://sobedesce.vercel.app',
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
    site: 'https://synquei.absolutezro.com',
    status: 'stable',
    options: [
      { os: 'mac', label: 'Mac', detail: 'macOS 11 ou mais novo', href: 'https://synquei.absolutezro.com/baixar/mac', format: 'Instalador .dmg' },
      { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11', href: 'https://synquei.absolutezro.com/baixar/windows', format: 'Instalador .exe' },
      { os: 'web', label: 'Navegador', detail: 'Chrome, Edge ou Safari', href: 'https://synquei.absolutezro.com/app/', format: 'Sem instalar' },
    ],
    terminal: { mac: 'curl -fsSL https://synquei.absolutezro.com/instalar.sh | bash', windows: 'irm https://synquei.absolutezro.com/instalar.ps1 | iex' },
    firstOpen: {
      mac: 'Abra o .dmg e arraste para Aplicativos. Na primeira vez: botão direito › Abrir › Abrir.',
      windows: 'Se o Windows avisar: Mais informações › Executar assim mesmo.',
    },
    moreUrl: 'https://synquei.absolutezro.com/#baixar',
  },
  {
    productId: 'nossom',
    site: 'https://nossom-teal.vercel.app',
    status: 'test',
    note: 'Prévia 0.2.2: sem notarização da Apple e sem atualização automática.',
    options: [
      {
        os: 'mac',
        label: 'Mac · Apple Silicon',
        detail: 'M1, M2, M3, M4 ou mais novo',
        href: NOSSOM_BAIXAR + 'mac-arm64',
        format: 'Instalador .dmg',
      },
      { os: 'mac', label: 'Mac · Intel', detail: 'Processador Intel', href: NOSSOM_BAIXAR + 'mac-x64', format: 'Instalador .dmg' },
      { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11, 64 bits', href: NOSSOM_BAIXAR + 'windows', format: 'Instalador .exe' },
      { os: 'web', label: 'Navegador', detail: 'Estúdio completo, sem instalar', href: 'https://nossom-teal.vercel.app/studio', format: 'Sem instalar' },
    ],
    // pelo Terminal o .dmg não fica em quarentena (o xattr depois falha no macOS novo sem Gerenciamento de Apps)
    terminal: { mac: 'curl -fsSL https://nossom-teal.vercel.app/instalar.sh | bash' },
    firstOpen: { mac: 'Se o Mac bloquear, instale pelo Terminal (abaixo): o NOSSOM chega sem o bloqueio.' },
    moreUrl: 'https://nossom-teal.vercel.app/apps',
  },
  {
    productId: 'tpeasy',
    site: 'https://tpeasy.vercel.app',
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
    site: 'https://carrodofreela.com.br',
    status: 'web',
    note: 'Funciona no navegador, no computador e no celular.',
    options: [{ os: 'web', label: 'Navegador', detail: 'Computador ou celular', href: 'https://carrodofreela.com.br', format: 'Sem instalar' }],
  },
  {
    productId: 'ai-edit',
    site: 'https://aeon.absolutezro.com',
    status: 'test',
    note: 'Com a conta Absolute ZRO. O app de computador avisa e se atualiza quando sai versão nova.',
    options: [
      { os: 'mac', label: 'Mac', detail: 'Apple Silicon e Intel', href: 'https://aeon.absolutezro.com/baixar/mac', format: 'Instalador .dmg' },
      { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11', href: 'https://aeon.absolutezro.com/baixar/windows', format: 'Instalador .exe' },
      { os: 'web', label: 'Navegador', detail: 'Chrome ou Edge', href: 'https://aeon.absolutezro.com/app/', format: 'Sem instalar' },
    ],
    terminal: { mac: 'curl -fsSL https://aeon.absolutezro.com/instalar.sh | bash', windows: 'irm https://aeon.absolutezro.com/instalar.ps1 | iex' },
    firstOpen: {
      mac: 'Baixou o .dmg pelo navegador? Rode uma vez no Terminal: xattr -cr /Applications/AEON.app',
      windows: 'Se o Windows avisar: Mais informações › Executar assim mesmo.',
    },
    moreUrl: 'https://aeon.absolutezro.com/#baixar',
  },
  {
    productId: 'finishing',
    site: 'https://revela.absolutezro.com',
    status: 'web',
    note: 'Abre no navegador, no computador e no celular.',
    options: [{ os: 'web', label: 'Navegador', detail: 'Computador ou celular', href: 'https://revela.absolutezro.com', format: 'Sem instalar' }],
  },
  {
    // Maestro (products/maestro/desktop): o instalador vem do Release "Maestro · versão de teste" pela rota da Absolute
    // ZRO (/baixar/app/maestro/<sistema>), que confere o gate de novo e entrega o mais novo com SHA-256. Fechado
    // (0024, download = false) aparece "Em desenvolvimento"; a 0027 do lançamento abre.
    productId: 'maestro',
    site: 'https://maestro.absolutezro.com',
    status: 'test',
    note: 'Com a conta Absolute ZRO. O app de computador avisa e se atualiza quando sai versão nova.',
    options: [
      { os: 'mac', label: 'Mac', detail: 'Apple Silicon e Intel', href: MAESTRO_BAIXAR + 'mac', format: 'Instalador .dmg' },
      { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11', href: MAESTRO_BAIXAR + 'windows', format: 'Instalador .exe' },
      { os: 'web', label: 'Navegador', detail: 'Chrome, Edge ou Safari', href: 'https://maestro.absolutezro.com/app', format: 'Sem instalar' },
    ],
    firstOpen: {
      mac: 'Abra o .dmg e arraste para Aplicativos. Na primeira vez: botão direito › Abrir › Abrir.',
      windows: 'Se o Windows avisar: Mais informações › Executar assim mesmo.',
    },
  },
]

/** Como um produto fechado aparece: só o selo "Em desenvolvimento". */
export const emDesenvolvimento = (productId: string): DownloadEntry => ({ productId, status: 'soon', options: [] })

/** O catálogo de downloads como esta pessoa vê: o que não está liberado para ela vira "Em desenvolvimento". */
export const downloadsLiberados = (liberados: ReadonlySet<string>): DownloadEntry[] =>
  DOWNLOADS.map((d) => (liberados.has(d.productId) ? d : emDesenvolvimento(d.productId)))

export const downloadFor = (productId: string, liberados: ReadonlySet<string>) => {
  const d = DOWNLOADS.find((x) => x.productId === productId)
  return d && (liberados.has(productId) ? d : emDesenvolvimento(productId))
}
export const hasDesktopInstaller = (productId: string, liberados: ReadonlySet<string>) =>
  !!downloadFor(productId, liberados)?.options.some((o) => o.os === 'mac' || o.os === 'windows')

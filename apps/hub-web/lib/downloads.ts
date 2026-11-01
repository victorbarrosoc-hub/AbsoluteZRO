/**
 * O que cada ferramenta oferece na página Downloads. Central única (ADR 0036, titular, 01/11/2026): no computador, todo
 * app se instala e se atualiza SÓ pela Absolute ZRO (apps/hub-desktop); a página tem um download só, o dela. As opções
 * `mac`/`windows` daqui dizem que o app tem versão para computador (o cartão mostra "Instale pela Absolute ZRO") e
 * guardam as rotas antigas, que continuam no ar para os apps já instalados (não aparecem como botão). Navegador e
 * celular continuam como links.
 *
 * Gate de lançamento (ADR 0023): `DOWNLOADS` é o que existe; o que cada pessoa vê sai de `downloadsLiberados`, com os
 * produtos liberados para ela no canal `download` (vindos do banco). Produto com o download fechado mas a web aberta
 * mostra só o jeito de abrir no navegador e no celular. Fechado nos dois vira "Em desenvolvimento", sem link (na página
 * pública /baixar, nem aparece). AEON, Revela, NOSSOM e Rift Motion só aparecem para admin de plataforma.
 */
export type Os = 'mac' | 'windows' | 'mobile' | 'web'

/**
 * Não lançados (titular, 01/11/2026): na central e na página Downloads só aparecem para admin de plataforma, que vê e
 * instala tudo. Para as outras contas, nem bloqueado, nem "Em desenvolvimento", nem cadeado.
 */
export const SO_PARA_ADMIN: ReadonlySet<string> = new Set(['ai-edit', 'finishing', 'nossom', 'rift-motion'])

/**
 * Admin de plataforma (papel `admin`; suporte e financeiro não), com e-mail confirmado: a mesma regra de
 * papelNoConsole e de zro.release_admin (0049).
 */
export const ehAdmin = (auth: { user: { platformRole?: string | null; emailVerified?: boolean } } | null | undefined) =>
  auth?.user.platformRole === 'admin' && auth.user.emailVerified === true

/** Instalação da Absolute ZRO pelo Terminal (public/instalar.sh e instalar.ps1: baixam, conferem o SHA-256 e instalam). */
export const HUB_TERMINAL = {
  mac: 'curl -fsSL https://absolutezro.com/instalar.sh | bash',
  windows: 'irm https://absolutezro.com/instalar.ps1 | iex',
}

/** O passo a passo de cada sistema (curto: o resto a própria Absolute ZRO conduz). `dica` aparece menor, embaixo. */
export const PASSOS: Record<'mac' | 'windows', { texto: string; dica?: string }[]> = {
  mac: [
    { texto: 'Baixe a Absolute ZRO para Mac.' },
    { texto: 'Abra o arquivo e arraste a Absolute ZRO para Aplicativos.' },
    {
      texto: 'Abra e entre com a sua conta. Seus apps aparecem lá.',
      dica: 'Se o Mac pedir para confirmar: Ajustes do Sistema › Privacidade e Segurança › Abrir mesmo assim.',
    },
  ],
  windows: [
    { texto: 'Baixe a Absolute ZRO para Windows.' },
    { texto: 'Abra o instalador. Ele termina sozinho.' },
    { texto: 'Entre com a sua conta. Seus apps aparecem lá.', dica: 'Se o Windows pedir para confirmar: Mais informações › Executar assim mesmo.' },
  ],
}

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
  /** Uma linha sobre como o app funciona (nunca sobre o que falta). */
  note?: string
  options: DownloadOption[]
  moreUrl?: string
  /** Página da plataforma ("Conheça mais"). Produto fechado não tem. */
  site?: string
}

// Rotas da própria Absolute ZRO (apps/hub-web/app/(site)/baixar/app/[id]/[arquivo]), com o gate e o plano. Os
// repositórios são privados: nada aponta para o github.com.
const BAIXAR = (id: string) => `https://absolutezro.com/baixar/app/${id}/`
const NO_COMPUTADOR = (id: string): DownloadOption[] => [
  { os: 'mac', label: 'Mac', detail: 'Apple Silicon e Intel', href: BAIXAR(id) + 'mac', format: 'Instalador .dmg' },
  { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11', href: BAIXAR(id) + 'windows', format: 'Instalador .exe' },
]

export const DOWNLOADS: DownloadEntry[] = [
  {
    productId: 'sobedesce',
    site: 'https://sobedesce.com',
    status: 'test',
    options: [
      ...NO_COMPUTADOR('sobedesce'),
      { os: 'mobile', label: 'Celular', detail: 'iPhone e Android, pelo navegador', href: 'https://sobedesce.com/app/', format: 'Sem instalar' },
    ],
    moreUrl: 'https://sobedesce.com/#baixar',
  },
  {
    productId: 'synquei',
    site: 'https://synquei.absolutezro.com',
    status: 'stable',
    options: [
      ...NO_COMPUTADOR('synquei'),
      { os: 'web', label: 'Navegador', detail: 'Chrome, Edge ou Safari', href: 'https://synquei.absolutezro.com/app/', format: 'Sem instalar' },
    ],
    moreUrl: 'https://synquei.absolutezro.com/#baixar',
  },
  {
    productId: 'nossom',
    site: 'https://quasar.absolutezro.com',
    status: 'test',
    options: [
      ...NO_COMPUTADOR('nossom'),
      { os: 'web', label: 'Navegador', detail: 'Estúdio completo, sem instalar', href: 'https://quasar.absolutezro.com/studio', format: 'Sem instalar' },
    ],
    moreUrl: 'https://quasar.absolutezro.com/apps',
  },
  {
    productId: 'tpeasy',
    site: 'https://tpeasy.absolutezro.com',
    status: 'test',
    note: 'No computador, o app; no iPhone e iPad, pela tela de início, sem loja.',
    options: [
      ...NO_COMPUTADOR('tpeasy'),
      {
        os: 'mobile',
        label: 'iPhone e iPad',
        detail: 'Safari › Compartilhar › Adicionar à Tela de Início',
        href: 'https://tpeasy.absolutezro.com/app/',
        format: 'App da web',
      },
    ],
  },
  {
    // Carro do Freela (products/carro-do-freela): no ar desde a 0041 e, com o app de computador, desde a 0042.
    productId: 'carro-do-freela',
    site: 'https://carro.absolutezro.com',
    status: 'test',
    note: 'Funciona no navegador, no computador e no celular.',
    options: [
      ...NO_COMPUTADOR('carro-do-freela'),
      { os: 'web', label: 'Navegador', detail: 'Computador ou celular', href: 'https://carro.absolutezro.com', format: 'Sem instalar' },
      {
        os: 'mobile',
        label: 'iPhone e Android',
        detail: 'Safari › Compartilhar › Adicionar à Tela de Início',
        href: 'https://carro.absolutezro.com',
        format: 'App da web',
      },
    ],
  },
  {
    // AEON: no ar na web (0043). O app de computador entra na central quando o Release dele seguir os nomes com versão
    // e build (apps/hub-desktop/README.md, "Um app novo na central"); até lá, só o navegador.
    productId: 'ai-edit',
    site: 'https://aeon.absolutezro.com',
    status: 'web',
    note: 'Com a conta Absolute ZRO.',
    options: [{ os: 'web', label: 'Navegador', detail: 'Chrome ou Edge', href: 'https://aeon.absolutezro.com/app/', format: 'Sem instalar' }],
    moreUrl: 'https://aeon.absolutezro.com',
  },
  {
    productId: 'finishing',
    site: 'https://revela.absolutezro.com',
    status: 'web',
    note: 'Abre no navegador, no computador e no celular.',
    options: [{ os: 'web', label: 'Navegador', detail: 'Computador ou celular', href: 'https://revela.absolutezro.com', format: 'Sem instalar' }],
  },
  {
    // Maestro (products/maestro/desktop): app de computador aberto a todos desde a 0048.
    productId: 'maestro',
    site: 'https://maestro.absolutezro.com',
    status: 'test',
    note: 'Com a conta Absolute ZRO. No iPhone: Safari › Compartilhar › Adicionar à Tela de Início.',
    options: [
      ...NO_COMPUTADOR('maestro'),
      { os: 'web', label: 'Navegador', detail: 'Chrome, Edge ou Safari', href: 'https://maestro.absolutezro.com/app', format: 'Sem instalar' },
      { os: 'mobile', label: 'Celular', detail: 'iPhone e Android, na Tela de Início', href: 'https://maestro.absolutezro.com/app', format: 'Sem instalar' },
    ],
  },
  {
    // Relay (products/relay): converte no próprio aparelho, no navegador ou no app de computador (0042).
    productId: 'relay',
    site: 'https://relay.absolutezro.com',
    status: 'test',
    note: 'Converte no próprio aparelho. Nada é enviado.',
    options: [
      ...NO_COMPUTADOR('relay'),
      { os: 'web', label: 'Navegador', detail: 'Computador ou celular', href: 'https://relay.absolutezro.com', format: 'Sem instalar' },
    ],
  },
]

/** Como um produto fechado aparece: só o selo "Em desenvolvimento". */
export const emDesenvolvimento = (productId: string): DownloadEntry => ({ productId, status: 'soon', options: [] })

/** Só o que abre no navegador e no celular (sem o app de computador): download fechado com a web aberta. */
const soNaWeb = (d: DownloadEntry): DownloadEntry | null => {
  const options = d.options.filter((o) => o.os === 'web' || o.os === 'mobile')
  return options.length ? { productId: d.productId, status: 'web', note: d.note, options, site: d.site } : null
}

/**
 * O catálogo de downloads como esta pessoa vê: liberado no canal download, tudo; senão, liberado na web (`naWeb`), só o
 * navegador e o celular; senão, "Em desenvolvimento".
 */
export const downloadsLiberados = (liberados: ReadonlySet<string>, naWeb: ReadonlySet<string> = new Set()): DownloadEntry[] =>
  DOWNLOADS.map((d) => (liberados.has(d.productId) ? d : (naWeb.has(d.productId) && soNaWeb(d)) || emDesenvolvimento(d.productId)))

export const downloadFor = (productId: string, liberados: ReadonlySet<string>) => {
  const d = DOWNLOADS.find((x) => x.productId === productId)
  return d && (liberados.has(productId) ? d : emDesenvolvimento(productId))
}
export const hasDesktopInstaller = (productId: string, liberados: ReadonlySet<string>) =>
  !!downloadFor(productId, liberados)?.options.some((o) => o.os === 'mac' || o.os === 'windows')

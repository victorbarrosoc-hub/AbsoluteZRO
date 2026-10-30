/**
 * Central de apps (modelo Creative Cloud, pedido do titular em 26/10/2026): o app Absolute ZRO para computador baixa,
 * instala, abre e atualiza as ferramentas. Este módulo monta o catálogo que ele lê em /api/v1/desktop/apps.
 *
 * Fonte única: os Releases de cada ferramenta no GitHub. O GitHub informa o SHA-256 de cada arquivo (`digest`); arquivo
 * sem SHA-256 não entra (a central nunca instala o que não pode conferir). O download passa por /baixar/app/<id>/…,
 * que só redireciona para o endereço assinado e temporário do GitHub (com GITHUB_TOKEN) ou para o link público.
 *
 * Sem `server-only` e com fetch/env injetáveis para os testes (tests/integration/desktop-apps.test.ts).
 */

export type Plataforma = 'mac' | 'windows'
export type Arquitetura = 'universal' | 'arm64' | 'x64'

export type Fonte = { repo: string; tag: string } | { repo: string; prefixo: string }

export type AppDesktop = {
  id: string
  nome: string
  /** Fontes em ordem: a primeira que tiver instalador vale. */
  fontes: Fonte[]
  mac: { arquivos: { arch: Arquitetura; re: RegExp }[]; bundle: string }
  windows: { re: RegExp; exe: string; nomeNoSistema: string }
  /** O Release tem o versao.json do aviso "Nova versão" do próprio app (o app pede por /baixar/app/<id>/versao.json). */
  versaoJson?: boolean
}

/** As ferramentas de computador. Nome do .app (Mac) e do .exe (Windows) vêm do electron-builder de cada uma. */
export const APPS_DESKTOP: AppDesktop[] = [
  {
    id: 'sobedesce',
    nome: 'SOBEDESCE',
    fontes: [{ repo: 'victorbarrosoc-hub/AbsoluteZRO', tag: 'sobedesce-versao-de-teste' }],
    mac: { arquivos: [{ arch: 'universal', re: /^SOBEDESCE-(\d+\.\d+\.\d+)-b(\d+)-mac-universal\.dmg$/ }], bundle: 'SOBEDESCE.app' },
    windows: { re: /^SOBEDESCE-(\d+\.\d+\.\d+)-b(\d+)-windows-setup\.exe$/, exe: 'SOBEDESCE.exe', nomeNoSistema: 'SOBEDESCE' },
  },
  {
    id: 'synquei',
    nome: 'Synquei',
    fontes: [{ repo: 'victorbarrosoc-hub/AbsoluteZRO', tag: 'synquei-app-desktop' }],
    mac: { arquivos: [{ arch: 'universal', re: /^Synquei-(\d+\.\d+\.\d+)-b(\d+)-mac-universal\.dmg$/ }], bundle: 'Synquei.app' },
    windows: { re: /^Synquei-(\d+\.\d+\.\d+)-b(\d+)-windows-setup\.exe$/, exe: 'Synquei.exe', nomeNoSistema: 'Synquei' },
  },
  {
    id: 'nossom',
    nome: 'NOSSOM',
    // Releases novos: nossom-v<versão> no AbsoluteZRO; a prévia 0.2.2 ainda está no repositório antigo.
    fontes: [
      { repo: 'victorbarrosoc-hub/AbsoluteZRO', prefixo: 'nossom-v' },
      { repo: 'victorbarrosoc-hub/nossom', tag: 'desktop-v0.2.2' },
    ],
    mac: {
      arquivos: [
        { arch: 'arm64', re: /^NOSSOM-(\d+\.\d+\.\d+)-mac-arm64\.dmg$/ },
        { arch: 'x64', re: /^NOSSOM-(\d+\.\d+\.\d+)-mac-x64\.dmg$/ },
      ],
      bundle: 'NOSSOM.app',
    },
    windows: { re: /^NOSSOM-(\d+\.\d+\.\d+)-win-x64\.exe$/, exe: 'NOSSOM.exe', nomeNoSistema: 'NOSSOM' },
  },
  {
    // Maestro para computador (products/maestro/desktop, .github/workflows/maestro-desktop.yml). Fechado pelo gate
    // enquanto o canal desktop/download do Maestro estiver fechado (0024); a 0027 do lançamento abre.
    id: 'maestro',
    nome: 'Maestro',
    fontes: [{ repo: 'victorbarrosoc-hub/AbsoluteZRO', tag: 'maestro-versao-de-teste' }],
    versaoJson: true,
    mac: { arquivos: [{ arch: 'universal', re: /^Maestro-(\d+\.\d+\.\d+)-b(\d+)-mac-universal\.dmg$/ }], bundle: 'Maestro.app' },
    windows: { re: /^Maestro-(\d+\.\d+\.\d+)-b(\d+)-windows-setup\.exe$/, exe: 'Maestro.exe', nomeNoSistema: 'Maestro' },
  },
  {
    // Relay para computador (products/relay/desktop, .github/workflows/relay-desktop.yml): o mesmo site numa janela.
    // Fechado pelo gate enquanto o canal desktop/download do Relay estiver fechado; a 0042 abre.
    id: 'relay',
    nome: 'Relay',
    fontes: [{ repo: 'victorbarrosoc-hub/AbsoluteZRO', tag: 'relay-versao-de-teste' }],
    versaoJson: true,
    mac: { arquivos: [{ arch: 'universal', re: /^Relay-(\d+\.\d+\.\d+)-b(\d+)-mac-universal\.dmg$/ }], bundle: 'Relay.app' },
    windows: { re: /^Relay-(\d+\.\d+\.\d+)-b(\d+)-windows-setup\.exe$/, exe: 'Relay.exe', nomeNoSistema: 'Relay' },
  },
  {
    // Carro do Freela para computador (products/carro-do-freela/desktop, .github/workflows/carro-desktop.yml). O id é o
    // do produto no HUB; os arquivos levam CarroDoFreela (sem espaço), o app instalado se chama "Carro do Freela".
    id: 'carro-do-freela',
    nome: 'Carro do Freela',
    fontes: [{ repo: 'victorbarrosoc-hub/AbsoluteZRO', tag: 'carro-versao-de-teste' }],
    versaoJson: true,
    mac: {
      arquivos: [{ arch: 'universal', re: /^CarroDoFreela-(\d+\.\d+\.\d+)-b(\d+)-mac-universal\.dmg$/ }],
      bundle: 'Carro do Freela.app',
    },
    windows: {
      re: /^CarroDoFreela-(\d+\.\d+\.\d+)-b(\d+)-windows-setup\.exe$/,
      exe: 'Carro do Freela.exe',
      nomeNoSistema: 'Carro do Freela',
    },
  },
]

export type Asset = { name: string; url: string; browser_download_url: string; size?: number; digest?: string | null }

export type Arquivo = { arquivo: string; sha256: string; tamanho: number; versao: string; build: number | null; arch: Arquitetura }

export type AppNoCatalogo = {
  id: string
  nome: string
  mac: { bundle: string; arquivos: Arquivo[] } | null
  windows: { exe: string; nomeNoSistema: string; arquivo: Arquivo } | null
}

export type Deps = { fetch?: typeof fetch; env?: Record<string, string | undefined>; agora?: () => number }

const CACHE_MS = 5 * 60_000
const TEMPO_MS = 8_000
const cache = new Map<string, { em: number; assets: Asset[] | null }>()

/** Para os testes. */
export function limparCacheApps() {
  cache.clear()
}

function config(d: Deps) {
  const env = d.env ?? process.env
  return { f: d.fetch ?? fetch, agora: d.agora ?? Date.now, token: (env.GITHUB_TOKEN ?? '').trim() }
}

const cabecalhos = (token: string): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

const valido = (a: unknown): a is Asset => {
  const x = a as Asset
  return !!x && typeof x.name === 'string' && typeof x.url === 'string' && typeof x.browser_download_url === 'string'
}

/** Arquivos de uma fonte (null = sem acesso, inexistente ou GitHub fora do ar). */
export async function assetsDaFonte(fonte: Fonte, d: Deps = {}): Promise<Asset[] | null> {
  const c = config(d)
  const chave = `${fonte.repo}#${'tag' in fonte ? fonte.tag : `${fonte.prefixo}*`}#${c.token ? 'com' : 'sem'}`
  const guardado = cache.get(chave)
  if (guardado && c.agora() - guardado.em < CACHE_MS) return guardado.assets
  let assets: Asset[] | null = null
  try {
    if ('tag' in fonte) {
      const r = await c.f(`https://api.github.com/repos/${fonte.repo}/releases/tags/${encodeURIComponent(fonte.tag)}`, {
        headers: cabecalhos(c.token),
        signal: AbortSignal.timeout(TEMPO_MS),
        cache: 'no-store',
      })
      if (r.ok) {
        const j = (await r.json()) as { assets?: unknown[] }
        assets = (j.assets ?? []).filter(valido)
      } else await r.body?.cancel().catch(() => {})
    } else {
      // Releases com prefixo (nossom-v1.2.3): junta os arquivos de todos; o de versão maior vence na escolha.
      const r = await c.f(`https://api.github.com/repos/${fonte.repo}/releases?per_page=30`, {
        headers: cabecalhos(c.token),
        signal: AbortSignal.timeout(TEMPO_MS),
        cache: 'no-store',
      })
      if (r.ok) {
        const lista = (await r.json()) as { tag_name?: string; draft?: boolean; assets?: unknown[] }[]
        assets = lista.filter((rel) => !rel.draft && rel.tag_name?.startsWith(fonte.prefixo)).flatMap((rel) => (rel.assets ?? []).filter(valido))
      } else await r.body?.cancel().catch(() => {})
    }
  } catch {
    if (guardado) return guardado.assets
    return null
  }
  cache.set(chave, { em: c.agora(), assets })
  return assets
}

const sha256 = (digest: unknown) => (typeof digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(digest) ? digest.slice(7).toLowerCase() : null)

const compararVersao = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** O arquivo mais novo que casa com o padrão e tem SHA-256 (maior versão; depois maior build). */
export function escolher(assets: Asset[], re: RegExp, arch: Arquitetura): Arquivo | null {
  const candidatos = assets
    .map((a) => ({ a, m: re.exec(a.name), sha: sha256(a.digest) }))
    .filter((x): x is { a: Asset; m: RegExpExecArray; sha: string } => !!x.m && !!x.sha)
    .map(({ a, m, sha }) => ({
      arquivo: a.name,
      sha256: sha,
      tamanho: Number(a.size) || 0,
      versao: m[1]!,
      build: m[2] ? Number(m[2]) : null,
      arch,
    }))
  candidatos.sort((x, y) => compararVersao(y.versao, x.versao) || (y.build ?? 0) - (x.build ?? 0))
  return candidatos[0] ?? null
}

/** Uma ferramenta no catálogo: usa a primeira fonte que tiver instalador conferível. */
export async function appNoCatalogo(app: AppDesktop, d: Deps = {}): Promise<AppNoCatalogo> {
  for (const fonte of app.fontes) {
    const assets = await assetsDaFonte(fonte, d)
    if (!assets?.length) continue
    const mac = app.mac.arquivos.map((x) => escolher(assets, x.re, x.arch)).filter((x): x is Arquivo => !!x)
    const win = escolher(assets, app.windows.re, 'x64')
    if (!mac.length && !win) continue
    return {
      id: app.id,
      nome: app.nome,
      mac: mac.length ? { bundle: app.mac.bundle, arquivos: mac } : null,
      windows: win ? { exe: app.windows.exe, nomeNoSistema: app.windows.nomeNoSistema, arquivo: win } : null,
    }
  }
  return { id: app.id, nome: app.nome, mac: null, windows: null }
}

/**
 * Catálogo para o app de computador. Gate de lançamento (ADR 0023): só entram os `liberados` (canal desktop, lidos do
 * banco para quem pede); produto fechado não aparece, nem com instalador no GitHub.
 */
export async function catalogoDesktop(liberados: ReadonlySet<string>, d: Deps = {}) {
  const apps = await Promise.all(APPS_DESKTOP.filter((a) => liberados.has(a.id)).map((a) => appNoCatalogo(a, d)))
  return { versao: 1, apps }
}

/**
 * Endereço do arquivo pedido pela central (/baixar/app/<id>/<arquivo>). Só arquivos que o catálogo dessa ferramenta
 * reconhece; nada de nome livre. null = não existe ou sem acesso (produto fora dos `liberados` no canal download).
 * Também: `mac` e `windows` = o instalador mais novo daquele sistema (os botões da página Downloads), e `versao.json`
 * para a ferramenta que publica o aviso "Nova versão" no Release (`versaoJson`).
 */
export async function enderecoDoArquivo(liberados: ReadonlySet<string>, id: string, nome: string, d: Deps = {}): Promise<string | null> {
  if (!liberados.has(id)) return null
  const app = APPS_DESKTOP.find((a) => a.id === id)
  if (!app || !/^[A-Za-z0-9._-]{1,120}$/.test(nome)) return null
  if (nome === 'mac' || nome === 'windows') {
    const c = await appNoCatalogo(app, d)
    const maisNovo = nome === 'mac' ? c.mac?.arquivos[0]?.arquivo : c.windows?.arquivo.arquivo
    if (!maisNovo) return null
    nome = maisNovo
  }
  const reconhece = (app.versaoJson && nome === 'versao.json') || app.windows.re.test(nome) || app.mac.arquivos.some((x) => x.re.test(nome))
  if (!reconhece) return null
  const c = config(d)
  for (const fonte of app.fontes) {
    const asset = (await assetsDaFonte(fonte, d))?.find((a) => a.name === nome)
    if (!asset) continue
    if (!c.token) return asset.browser_download_url
    try {
      const r = await c.f(asset.url, {
        headers: { accept: 'application/octet-stream', authorization: `Bearer ${c.token}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(TEMPO_MS),
        cache: 'no-store',
      })
      const loc = r.headers.get('location')
      await r.body?.cancel().catch(() => {})
      if (loc && loc.startsWith('https://')) return loc
    } catch {
      // tenta a próxima fonte
    }
  }
  return null
}

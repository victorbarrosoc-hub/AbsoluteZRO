/**
 * Absolute ZRO para computador: lê o Release "hub-desktop" do repositório AbsoluteZRO no GitHub e manda o visitante
 * direto para o instalador. Nada passa pela Vercel: com GITHUB_TOKEN (só leitura de Contents), o GitHub devolve um
 * endereço assinado e temporário do arquivo, e a rota só redireciona. Sem token (ou com o repositório público), vale o
 * link normal do Release. Mesmo esquema do Synquei (products/synquei/api/baixar.js).
 *
 * Sem `server-only` e com fetch/env injetáveis para os testes (tests/integration/hub-desktop-download.test.ts).
 */

export type Plataforma = 'mac' | 'windows'

export type ReleaseAsset = { name: string; url: string; browser_download_url: string }

export type Versao = {
  build: number | null
  versao: string | null
  data: string | null
  arquivoMac: string | null
  sha256Mac: string | null
  arquivoWindows: string | null
  sha256Windows: string | null
}

export type Disponibilidade = { mac: boolean; windows: boolean; versao: string | null; build: number | null }

export type Deps = { fetch?: typeof fetch; env?: Record<string, string | undefined>; agora?: () => number }

/** Sem Release (ou GitHub fora do ar): a página mostra "Em breve". */
export const SEM_INSTALADOR: Disponibilidade = { mac: false, windows: false, versao: null, build: null }

/** Os dois instaladores, na ordem da página /baixar. */
export const HUB_DESKTOP_OPCOES: { os: Plataforma; label: string; detail: string; format: string }[] = [
  { os: 'mac', label: 'Mac', detail: 'Apple Silicon e Intel · macOS 11 ou mais novo', format: '.dmg' },
  { os: 'windows', label: 'Windows', detail: 'Windows 10 e 11 · 64 bits e ARM', format: '.exe' },
]

export const HUB_DESKTOP_REPO = 'victorbarrosoc-hub/AbsoluteZRO'
export const HUB_DESKTOP_TAG = 'hub-desktop'
const CACHE_MS = 2 * 60_000
const TEMPO_MS = 8_000

export const QUAL: Record<Plataforma, (nome: string) => boolean> = {
  mac: (n) => n.endsWith('-mac-universal.dmg'),
  windows: (n) => n.endsWith('-windows-setup.exe'),
}

let cache: { em: number; chave: string; assets: ReleaseAsset[] | null } | null = null

/** Para os testes: esquece o Release lido. */
export function limparCache() {
  cache = null
}

function config(d: Deps) {
  const env = d.env ?? process.env
  const bruto = env.GITHUB_TOKEN ?? ''
  return {
    f: d.fetch ?? fetch,
    agora: d.agora ?? Date.now,
    // colado no painel da Vercel às vezes vem com espaço ou quebra de linha no fim
    token: bruto.trim(),
    bruto,
    repo: (env.HUB_DESKTOP_REPO || HUB_DESKTOP_REPO).trim(),
    tag: (env.HUB_DESKTOP_TAG || HUB_DESKTOP_TAG).trim(),
  }
}

const auth = (token: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {})
const releaseUrl = (repo: string, tag: string) => `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`

/** Arquivos do Release (null = Release inexistente, sem acesso ou GitHub fora do ar). */
export async function assetsDoRelease(d: Deps = {}): Promise<ReleaseAsset[] | null> {
  const c = config(d)
  const chave = `${c.repo}#${c.tag}#${c.token ? 'com' : 'sem'}`
  if (cache && cache.chave === chave && c.agora() - cache.em < CACHE_MS) return cache.assets
  let assets: ReleaseAsset[] | null = null
  try {
    const r = await c.f(releaseUrl(c.repo, c.tag), {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...auth(c.token) },
      signal: AbortSignal.timeout(TEMPO_MS),
      cache: 'no-store',
    })
    if (r.ok) {
      const j = (await r.json()) as { assets?: unknown }
      assets = Array.isArray(j.assets)
        ? (j.assets as ReleaseAsset[]).filter((a) => a && typeof a.name === 'string' && typeof a.url === 'string' && typeof a.browser_download_url === 'string')
        : []
    } else await r.body?.cancel().catch(() => {})
  } catch {
    // GitHub fora do ar ou lento: usa o último que deu certo, se houver
    if (cache && cache.chave === chave) return cache.assets
    return null
  }
  cache = { em: c.agora(), chave, assets }
  return assets
}

/** Endereço final do arquivo: assinado e temporário (com token) ou o link público do Release (sem token). */
export async function linkDoArquivo(asset: ReleaseAsset, d: Deps = {}): Promise<string | null> {
  const c = config(d)
  if (!c.token) return asset.browser_download_url || null
  try {
    const r = await c.f(asset.url, {
      headers: { accept: 'application/octet-stream', ...auth(c.token) },
      redirect: 'manual',
      signal: AbortSignal.timeout(TEMPO_MS),
      cache: 'no-store',
    })
    const loc = r.headers.get('location')
    await r.body?.cancel().catch(() => {})
    return loc && /^https:\/\//.test(loc) ? loc : null
  } catch {
    return null
  }
}

const buildDe = (nome: string) => {
  const m = /-b(\d{1,9})-/.exec(nome)
  return m ? Number(m[1]) : -1
}
const sha = (s: unknown) => (typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s) ? s.toLowerCase() : null)
const texto = (s: unknown) => (typeof s === 'string' && s.length < 200 ? s : null)

/** versao.json do Release (build, versão e SHA-256 de cada instalador). */
export async function lerVersao(d: Deps = {}, assets?: ReleaseAsset[] | null): Promise<Versao | null> {
  const lista = assets === undefined ? await assetsDoRelease(d) : assets
  const a = lista?.find((x) => x.name === 'versao.json')
  if (!a) return null
  const url = await linkDoArquivo(a, d)
  if (!url) return null
  try {
    const c = config(d)
    const r = await c.f(url, { signal: AbortSignal.timeout(TEMPO_MS), cache: 'no-store' })
    if (!r.ok) return null
    const v = (await r.json()) as Record<string, unknown>
    const build = Number(v.build)
    return {
      build: Number.isInteger(build) && build > 0 ? build : null,
      versao: texto(v.versao),
      data: texto(v.data),
      arquivoMac: texto(v.arquivoMac),
      sha256Mac: sha(v.sha256Mac),
      arquivoWindows: texto(v.arquivoWindows),
      sha256Windows: sha(v.sha256Windows),
    }
  } catch {
    return null
  }
}

/** Qual instalador entregar: o que o versao.json aponta (conferido) ou, sem ele, o de maior build. `build` pede um exato. */
export async function escolherInstalador(p: Plataforma, d: Deps = {}, build?: number | null): Promise<ReleaseAsset | null> {
  const assets = await assetsDoRelease(d)
  if (!assets) return null
  const lista = assets.filter((a) => QUAL[p](a.name))
  if (build != null) return lista.find((a) => buildDe(a.name) === build) ?? null
  if (!lista.length) return null
  const v = await lerVersao(d, assets)
  const nome = v ? (p === 'mac' ? v.arquivoMac : v.arquivoWindows) : null
  return (nome && lista.find((a) => a.name === nome)) || [...lista].sort((a, b) => buildDe(b.name) - buildDe(a.name))[0] || null
}

/** Para a página /baixar: tem instalador de cada sistema? (sem Release = "Em breve") */
export async function disponibilidade(d: Deps = {}): Promise<Disponibilidade> {
  const assets = await assetsDoRelease(d)
  if (!assets) return SEM_INSTALADOR
  const mac = assets.some((a) => QUAL.mac(a.name))
  const windows = assets.some((a) => QUAL.windows(a.name))
  const v = mac || windows ? await lerVersao(d, assets) : null
  return { mac, windows, versao: v?.versao ?? null, build: v?.build ?? null }
}

/** Diagnóstico sem segredos: tem token? de que tipo? o GitHub aceita? o Release tem os instaladores? */
export async function diagnostico(d: Deps = {}) {
  const c = config(d)
  const out: Record<string, unknown> = {
    token: !!c.token,
    tipoToken: !c.token ? null : c.token.startsWith('github_pat_') ? 'fino' : c.token.startsWith('ghp_') ? 'clássico' : 'outro formato',
    espacoNasPontas: !!c.token && c.bruto !== c.token,
    repositorio: c.repo,
    tag: c.tag,
  }
  let status: number | string
  let corpo: { assets?: ReleaseAsset[] } | null = null
  try {
    const r = await c.f(releaseUrl(c.repo, c.tag), {
      headers: { accept: 'application/vnd.github+json', ...auth(c.token) },
      signal: AbortSignal.timeout(TEMPO_MS),
      cache: 'no-store',
    })
    status = r.status
    if (r.ok) corpo = (await r.json()) as { assets?: ReleaseAsset[] }
    else await r.body?.cancel().catch(() => {})
  } catch (e) {
    status = e instanceof Error ? e.name : 'erro'
  }
  out.githubRelease = status
  out.motivo =
    status === 200
      ? null
      : status === 401
        ? 'token recusado pelo GitHub (inválido, incompleto ou expirado)'
        : status === 404
          ? c.token
            ? 'token sem acesso ao repositório, ou o Release ainda não existe'
            : 'repositório privado e sem GITHUB_TOKEN (ou o Release ainda não existe)'
          : status === 403
            ? 'token sem permissão (Contents: Read-only) ou limite de uso'
            : 'falha ao falar com o GitHub'
  if (corpo) {
    const a = Array.isArray(corpo.assets) ? corpo.assets : []
    out.mac = a.filter((x) => QUAL.mac(x.name)).length
    out.windows = a.filter((x) => QUAL.windows(x.name)).length
    const v = a.find((x) => x.name === 'versao.json')
    out.versaoJson = !!v
    if (v) out.linkAssinado = !!(await linkDoArquivo(v, d))
  }
  return out
}

/** ?build=N (só dígitos) ou null. */
export function buildPedido(valor: string | null): number | null {
  return valor && /^\d{1,9}$/.test(valor) ? Number(valor) : null
}

// ───────── respostas das rotas /baixar/hub/* (app/(site)/baixar/hub) ─────────

const semCache = { 'cache-control': 'no-store' }

/** /baixar/hub/mac e /baixar/hub/windows: redireciona para o instalador; sem Release, volta para /baixar com aviso. */
export async function respostaInstalador(p: Plataforma, pedido: URL, d: Deps = {}): Promise<Response> {
  const build = buildPedido(pedido.searchParams.get('build'))
  const voltar = () => new Response(null, { status: 302, headers: { location: new URL('/baixar?hub=indisponivel#absolute-zro', pedido).href, ...semCache } })
  try {
    const alvo = await escolherInstalador(p, d, build)
    if (!alvo) return build != null ? new Response('Instalador deste build não está mais no ar.', { status: 404, headers: semCache }) : voltar()
    const destino = await linkDoArquivo(alvo, d)
    if (!destino) return voltar()
    return new Response(null, { status: 302, headers: { location: destino, ...semCache } })
  } catch {
    return voltar()
  }
}

/** /baixar/hub/versao: o versao.json do Release (o app compara o build dele com este). */
export async function respostaVersao(d: Deps = {}): Promise<Response> {
  const v = await lerVersao(d).catch(() => null)
  if (!v || !v.build) return Response.json({ ok: false }, { status: 503, headers: semCache })
  return Response.json(
    { ok: true, ...v, mac: '/baixar/hub/mac', windows: '/baixar/hub/windows' },
    { headers: { 'cache-control': 'public, max-age=60, s-maxage=120' } },
  )
}

/** /baixar/hub/diag: por que o download não sai, sem mostrar o token. */
export async function respostaDiag(d: Deps = {}): Promise<Response> {
  return Response.json(await diagnostico(d), { headers: semCache })
}

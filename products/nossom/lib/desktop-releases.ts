// Onde ficam os instaladores. Desde 25/10/2026 o NOSSOM mora no repositório AbsoluteZRO e as
// releases novas usam a tag `nossom-v<versão>`. O repositório antigo fica arquivado, mas a prévia
// `desktop-v0.2.2` continua lá e segue como reserva: um link nunca aponta para um arquivo que não
// foi publicado.
//
// Os repositórios são privados. Por isso o visitante nunca recebe um link do github.com: as páginas
// apontam para /baixar/<sistema>, e a rota lê o Release pela API do GitHub com GITHUB_TOKEN (token
// fino, só leitura de Contents) e redireciona para o endereço assinado e temporário do arquivo. O
// arquivo não passa pela Vercel. Sem token (repositório público), a rota usa o link normal.
export const DESKTOP_VERSION = '0.2.2';
export const RELEASE_REPO = 'victorbarrosoc-hub/AbsoluteZRO';
export const LEGACY_RELEASE = {
  repo: 'victorbarrosoc-hub/nossom',
  tag: 'desktop-v0.2.2',
  version: '0.2.2',
};
/** Canal fixo da atualização automática (latest.yml, latest-mac.yml e os arquivos que eles citam). */
export const UPDATE_CHANNEL = { repo: RELEASE_REPO, tag: 'nossom-atualizacoes' };
export type InstallerKey = 'macArm64' | 'macX64' | 'windows';
export type ReleaseSource = { repo: string; tag: string; version: string };
export const installerSuffix: Record<InstallerKey, string> = {
  macArm64: 'mac-arm64.dmg',
  macX64: 'mac-x64.dmg',
  windows: 'win-x64.exe',
};
/** Endereço público de cada instalador neste site (/baixar/mac-arm64 etc.). */
export const installerSlug: Record<InstallerKey, string> = {
  macArm64: 'mac-arm64',
  macX64: 'mac-x64',
  windows: 'windows',
};
export const installerPath = (key: InstallerKey) => '/baixar/' + installerSlug[key];
export function installerKey(slug: string): InstallerKey | null {
  const found = (Object.keys(installerSlug) as InstallerKey[]).find(
    (key) => installerSlug[key] === slug,
  );
  return found ?? null;
}
export const releaseTag = (version: string) => 'nossom-v' + version;
export const installerName = (version: string, key: InstallerKey) =>
  `NOSSOM-${version}-${installerSuffix[key]}`;
/** Link normal do GitHub (só funciona com repositório público). Nunca vai direto para a página. */
export function installerUrl(release: ReleaseSource, key: InstallerKey) {
  return `https://github.com/${release.repo}/releases/download/${release.tag}/${installerName(release.version, key)}`;
}
/** Fontes, na ordem: a release do AbsoluteZRO desta versão e, sem ela, a prévia antiga. */
export const releaseSources = (version = DESKTOP_VERSION): ReleaseSource[] => [
  { repo: RELEASE_REPO, tag: releaseTag(version), version },
  LEGACY_RELEASE,
];

export type Asset = { name: string; url: string; browser_download_url: string };
type Release = { status: number | string; assets: Asset[] };

const API = 'https://api.github.com';
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; release: Release }>();

/** Colado no painel da Vercel às vezes vem com espaço ou quebra de linha no fim. */
const rawToken = () => process.env.GITHUB_TOKEN || '';
const token = () => rawToken().trim();
const auth = (): Record<string, string> => (token() ? { authorization: `Bearer ${token()}` } : {});

/** Esquece as listas guardadas (testes; e depois de um link vencido). */
export function forgetReleases() {
  cache.clear();
}

/** Arquivos de um Release pela API (status 404 = não existe ou sem acesso). Guarda 5 min. */
/**
 * Como o fetch guarda a resposta: as rotas /baixar não guardam nada (`no-store`, a lista fica em
 * memória por 5 min); a página /apps usa o cache do Next de 1 h, para continuar estática (ISR).
 */
type FetchCache = 'route' | 'page';
const fetchCache = (mode: FetchCache) =>
  (mode === 'page' ? { next: { revalidate: 3600 } } : { cache: 'no-store' }) as RequestInit;

async function releaseAssets(
  repo: string,
  tag: string,
  fresh = false,
  mode: FetchCache = 'route',
): Promise<Release> {
  const key = repo + '#' + tag;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.release;
  let release: Release;
  try {
    const response = await fetch(`${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: { accept: 'application/vnd.github+json', ...auth() },
      ...fetchCache(mode),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const body = (await response.json()) as { assets?: Asset[] };
      release = { status: response.status, assets: Array.isArray(body.assets) ? body.assets : [] };
    } else {
      await response.body?.cancel().catch(() => {});
      release = { status: response.status, assets: [] };
    }
  } catch (error) {
    if (hit) return hit.release;
    return { status: error instanceof Error ? error.message : 'falha', assets: [] };
  }
  // Só guarda respostas definitivas: uma falha passageira não esconde o arquivo por 5 min.
  if (release.status === 200 || release.status === 404) cache.set(key, { at: Date.now(), release });
  return release;
}

async function published(url: string, mode: FetchCache) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      ...fetchCache(mode),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type Located = { source: ReleaseSource; asset: Asset };

/**
 * Encontra o instalador. Com token: lê cada Release pela API; Release ausente, sem acesso ou sem o
 * arquivo passa para a próxima fonte. Sem token: confere o link normal (repositório público).
 */
export async function locateInstaller(
  key: InstallerKey,
  version = DESKTOP_VERSION,
  mode: FetchCache = 'route',
): Promise<Located | null> {
  for (const source of releaseSources(version)) {
    const name = installerName(source.version, key);
    if (token()) {
      const asset = (await releaseAssets(source.repo, source.tag, false, mode)).assets.find(
        (a) => a.name === name,
      );
      if (asset) return { source, asset };
    } else {
      const url = installerUrl(source, key);
      if (await published(url, mode))
        return { source, asset: { name, url, browser_download_url: url } };
    }
  }
  return null;
}

/**
 * Endereço para o navegador baixar: o link normal (sem token) ou o endereço assinado e temporário que
 * o GitHub devolve (302) para a API de arquivos com token. Não segue o 302: o arquivo não passa pela
 * Vercel. null = o GitHub não deu endereço.
 */
export async function assetAddress(asset: Asset): Promise<string | null> {
  if (!token()) return asset.browser_download_url;
  try {
    const response = await fetch(asset.url, {
      headers: { accept: 'application/octet-stream', ...auth() },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => {});
    return location && location.startsWith('https://') ? location : null;
  } catch {
    return null;
  }
}

/** Para onde mandar o visitante de /baixar/<sistema> (null = indisponível agora). */
export async function installerAddress(key: InstallerKey, version = DESKTOP_VERSION) {
  const found = await locateInstaller(key, version);
  if (!found) return null;
  const address = await assetAddress(found.asset);
  if (address || !token()) return address;
  // A lista guardada pode citar um arquivo trocado: confere de novo uma vez.
  forgetReleases();
  const again = await locateInstaller(key, version);
  return again ? assetAddress(again.asset) : null;
}

/** Arquivos que o atualizador do app pode pedir ao canal (nada além disso passa pela rota). */
export const UPDATE_FILE =
  /^(?:latest(?:-mac)?\.yml|NOSSOM-\d+\.\d+\.\d+-(?:mac-(?:arm64|x64)\.(?:zip|dmg)|win-x64\.exe)(?:\.blockmap)?)$/;

/** Endereço de um arquivo do canal de atualização (null = não existe ou indisponível). */
export async function updateFileAddress(name: string): Promise<string | null> {
  if (!UPDATE_FILE.test(name)) return null;
  const { repo, tag } = UPDATE_CHANNEL;
  if (!token()) return `https://github.com/${repo}/releases/download/${tag}/${name}`;
  for (const fresh of [false, true]) {
    const asset = (await releaseAssets(repo, tag, fresh)).assets.find((a) => a.name === name);
    const address = asset && (await assetAddress(asset));
    if (address) return address;
  }
  return null;
}

export type Installer = { url: string; version: string };

/** Links da página /apps: sempre a rota deste site, com a versão que ela vai entregar. */
export async function desktopInstallers(
  version = DESKTOP_VERSION,
): Promise<Record<InstallerKey, Installer>> {
  const keys = Object.keys(installerSuffix) as InstallerKey[];
  const found = await Promise.all(
    keys.map((key) => locateInstaller(key, version, 'page').catch(() => null)),
  );
  return Object.fromEntries(
    keys.map((key, i) => [
      key,
      { url: installerPath(key), version: found[i]?.source.version ?? LEGACY_RELEASE.version },
    ]),
  ) as Record<InstallerKey, Installer>;
}

function reason(status: number | string, withToken: boolean): string | null {
  if (status === 200) return null;
  if (status === 401) return 'token recusado pelo GitHub (inválido, incompleto ou expirado)';
  if (status === 404)
    return withToken
      ? 'Release inexistente ou token sem acesso ao repositório'
      : 'Release inexistente ou repositório privado sem token';
  if (status === 403) return 'token sem permissão (Contents: Read-only) ou limite de uso do GitHub';
  return 'falha ao falar com o GitHub';
}

/** Diagnóstico sem segredos: tem token? o GitHub aceita? onde está cada instalador? */
export async function downloadDiagnosis(version = DESKTOP_VERSION) {
  const t = token();
  const withToken = !!t;
  const keys = Object.keys(installerSuffix) as InstallerKey[];
  const sources = await Promise.all(
    releaseSources(version).map(async (source) => {
      const release = await releaseAssets(source.repo, source.tag, true);
      return {
        repositorio: source.repo,
        tag: source.tag,
        github: release.status,
        motivo: reason(release.status, withToken),
        instaladores: Object.fromEntries(
          keys.map((key) => [
            installerSlug[key],
            release.assets.some((a) => a.name === installerName(source.version, key)),
          ]),
        ),
      };
    }),
  );
  const channel = await releaseAssets(UPDATE_CHANNEL.repo, UPDATE_CHANNEL.tag, true);
  const delivering: Record<string, string | null> = {};
  let signedLink: boolean | null = null;
  for (const key of keys) {
    const found = await locateInstaller(key, version);
    delivering[installerSlug[key]] = found ? `${found.source.repo} (${found.source.tag})` : null;
    if (found && withToken && signedLink === null) signedLink = !!(await assetAddress(found.asset));
  }
  const missing = keys.filter((key) => !delivering[installerSlug[key]]);
  return {
    token: withToken,
    tipoToken: !t
      ? null
      : t.startsWith('github_pat_')
        ? 'fino'
        : t.startsWith('ghp_')
          ? 'clássico'
          : 'outro formato',
    espacoNasPontas: withToken && rawToken() !== t,
    versao: version,
    fontes: sources,
    entregando: delivering,
    linkAssinado: signedLink,
    atualizacoes: {
      repositorio: UPDATE_CHANNEL.repo,
      tag: UPDATE_CHANNEL.tag,
      github: channel.status,
      motivo: reason(channel.status, withToken),
      manifestos: ['latest.yml', 'latest-mac.yml'].filter((n) =>
        channel.assets.some((a) => a.name === n),
      ),
    },
    motivo: !missing.length
      ? null
      : (sources.find((s) => s.motivo)?.motivo ??
        'o Release existe, mas não tem o instalador desta versão'),
  };
}

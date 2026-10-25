// Onde ficam os instaladores. Desde 25/10/2026 o NOSSOM mora no repositório AbsoluteZRO e as
// releases novas usam a tag `nossom-v<versão>`. O repositório antigo fica arquivado, mas a prévia
// `desktop-v0.2.2` continua lá e segue como reserva: um link nunca aponta para um arquivo que não
// foi publicado.
export const DESKTOP_VERSION = '0.2.2';
export const RELEASE_REPO = 'victorbarrosoc-hub/AbsoluteZRO';
export const LEGACY_RELEASE = {
  repo: 'victorbarrosoc-hub/nossom',
  tag: 'desktop-v0.2.2',
  version: '0.2.2',
};
export type InstallerKey = 'macArm64' | 'macX64' | 'windows';
export const installerSuffix: Record<InstallerKey, string> = {
  macArm64: 'mac-arm64.dmg',
  macX64: 'mac-x64.dmg',
  windows: 'win-x64.exe',
};
export const releaseTag = (version: string) => 'nossom-v' + version;
export function installerUrl(
  release: { repo: string; tag: string; version: string },
  key: InstallerKey,
) {
  return `https://github.com/${release.repo}/releases/download/${release.tag}/NOSSOM-${release.version}-${installerSuffix[key]}`;
}
export type Installer = { url: string; version: string };

async function published(url: string) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    } as RequestInit);
    return response.ok;
  } catch {
    return false;
  }
}

/** Instalador da versão atual no AbsoluteZRO quando publicado; senão, a prévia antiga. */
export async function desktopInstallers(
  version = DESKTOP_VERSION,
): Promise<Record<InstallerKey, Installer>> {
  const current = { repo: RELEASE_REPO, tag: releaseTag(version), version };
  const keys = Object.keys(installerSuffix) as InstallerKey[];
  const found = await Promise.all(keys.map((key) => published(installerUrl(current, key))));
  return Object.fromEntries(
    keys.map((key, i) => {
      const release = found[i] ? current : LEGACY_RELEASE;
      return [key, { url: installerUrl(release, key), version: release.version }];
    }),
  ) as Record<InstallerKey, Installer>;
}

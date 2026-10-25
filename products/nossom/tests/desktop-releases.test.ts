import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DESKTOP_VERSION,
  desktopInstallers,
  installerUrl,
  LEGACY_RELEASE,
} from '../lib/desktop-releases';

test('the site version matches the desktop package', () => {
  const pkg = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
  assert.equal(DESKTOP_VERSION, pkg.version);
});

test('downloads keep the archived desktop-v0.2.2 preview until the monorepo release exists', async () => {
  const old = globalThis.fetch;
  const asked: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      asked.push(String(input));
      assert.equal(init?.method, 'HEAD');
      return new Response(null, { status: 404 });
    };
    const legacy = await desktopInstallers('0.2.2');
    assert.equal(
      legacy.macArm64.url,
      'https://github.com/victorbarrosoc-hub/nossom/releases/download/desktop-v0.2.2/NOSSOM-0.2.2-mac-arm64.dmg',
    );
    assert.equal(
      legacy.windows.url,
      'https://github.com/victorbarrosoc-hub/nossom/releases/download/desktop-v0.2.2/NOSSOM-0.2.2-win-x64.exe',
    );
    assert.equal(legacy.macX64.version, '0.2.2');
    assert.ok(
      asked.every((url) =>
        url.startsWith(
          'https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/nossom-v0.2.2/',
        ),
      ),
    );
    // Network failure also keeps the working preview.
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    assert.equal(
      (await desktopInstallers('0.2.2')).macX64.url,
      installerUrl(LEGACY_RELEASE, 'macX64'),
    );
    // Once published (even partially), each installer moves to the AbsoluteZRO release.
    globalThis.fetch = async (input) =>
      new Response(null, { status: String(input).endsWith('win-x64.exe') ? 200 : 404 });
    const mixed = await desktopInstallers('0.3.0');
    assert.equal(
      mixed.windows.url,
      'https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/nossom-v0.3.0/NOSSOM-0.3.0-win-x64.exe',
    );
    assert.equal(mixed.windows.version, '0.3.0');
    assert.equal(mixed.macArm64.url, installerUrl(LEGACY_RELEASE, 'macArm64'));
    assert.equal(mixed.macArm64.version, '0.2.2');
  } finally {
    globalThis.fetch = old;
  }
});

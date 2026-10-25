import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { writeManifests } = createRequire(import.meta.url)('../desktop/update-manifests.cjs');
test('stable update feeds require every platform and contain hashes of the actual architecture files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nossom-feeds-'));
  try {
    assert.throws(() => writeManifests(dir, '0.2.0'));
    assert.equal(existsSync(join(dir, 'latest.yml')), false);
    const files = ['mac-arm64.zip', 'mac-x64.zip', 'mac-arm64.dmg', 'mac-x64.dmg', 'win-x64.exe'];
    for (const name of files)
      writeFileSync(join(dir, 'NOSSOM-0.2.0-' + name), 'test-artifact-' + name);
    assert.throws(() => writeManifests(dir, '0.2.0-beta'));
    writeManifests(dir, '0.2.0');
    const mac = JSON.parse(readFileSync(join(dir, 'latest-mac.yml'), 'utf8'));
    const win = JSON.parse(readFileSync(join(dir, 'latest.yml'), 'utf8'));
    assert.equal(mac.files.length, 2);
    assert.match(mac.files[0].url, /arm64\.zip$/);
    assert.match(mac.files[1].url, /x64\.zip$/);
    assert.match(win.files[0].url, /win-x64\.exe$/);
    for (const manifest of [mac, win])
      for (const file of manifest.files) {
        const bytes = readFileSync(join(dir, file.url));
        assert.equal(file.size, bytes.length);
        assert.equal(file.sha512, createHash('sha512').update(bytes).digest('base64'));
      }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

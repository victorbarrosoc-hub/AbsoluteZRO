import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { createUpdates } = createRequire(import.meta.url)('../desktop/updates.cjs');
class Updater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  allowDowngrade = true;
  allowPrerelease = true;
  checks = 0;
  downloads = 0;
  installs: unknown[][] = [];
  async checkForUpdates() {
    this.checks++;
    this.emit('checking-for-update');
    this.emit('update-available', { version: '0.2.0' });
  }
  async downloadUpdate() {
    this.downloads++;
  }
  quitAndInstall(...args: unknown[]) {
    this.installs.push(args);
  }
}
test('signed desktop updates download automatically once and validate completion before installing', async () => {
  const updater = new Updater(),
    messages: unknown[] = [],
    notices: string[] = [];
  const updates = createUpdates({
    app: { getVersion: () => '0.1.0' },
    updater,
    enabled: true,
    broadcast: (state: unknown) => messages.push(state),
    notify: (version: string) => notices.push(version),
  });
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.allowPrerelease, false);
  await updates.command('download');
  await updates.command('install');
  assert.equal(updater.downloads, 0);
  assert.equal(updater.installs.length, 0);
  await updates.command('check');
  await updates.command('check');
  assert.equal(updates.getState().status, 'downloading');
  updater.emit('update-available', { version: '0.2.0' });
  assert.equal(updates.getState().automatic, true);
  assert.deepEqual(notices, ['0.2.0']);
  await updates.command('download');
  await updates.command('download');
  await updates.command('check');
  assert.equal(updater.downloads, 1);
  assert.equal(updates.getState().installRequested, true);
  assert.equal(updater.checks, 1);
  updater.emit('download-progress', { percent: 43.6 });
  assert.equal(updates.getState().progress, 44);
  await updates.command('install');
  assert.equal(updater.installs.length, 0);
  updater.emit('update-downloaded', { version: '0.2.0' });
  await updates.command('install');
  await updates.command('install');
  assert.deepEqual(updater.installs, [[true, true]]);
  assert.equal(updates.getState().status, 'installing');
  assert.ok(messages.length > 5);
  updates.stop();
});
test('unsigned desktop builds remain usable without update traffic; failures allow retry', async () => {
  const updater = new Updater();
  const disabled = createUpdates({
    app: { getVersion: () => '0.1.0' },
    updater,
    enabled: false,
    broadcast: () => {},
    notify: () => {},
  });
  disabled.start();
  await disabled.command('check');
  await disabled.command('download');
  assert.equal(disabled.getState().status, 'unavailable');
  assert.equal(updater.checks, 0);
  assert.equal(updater.downloads, 0);
  disabled.stop();
  const failed = new Updater();
  failed.checkForUpdates = async () => {
    throw new Error('Private filesystem path and token should not be shown');
  };
  const updates = createUpdates({
    app: { getVersion: () => '0.1.0' },
    updater: failed,
    enabled: true,
    broadcast: () => {},
    notify: () => {},
  });
  await updates.command('check');
  assert.equal(updates.getState().status, 'error');
  assert.doesNotMatch(updates.getState().error, /Private|token/);
  failed.checkForUpdates = async () => {
    failed.emit('update-not-available');
  };
  await updates.command('check');
  assert.equal(updates.getState().status, 'current');
  updates.stop();
});

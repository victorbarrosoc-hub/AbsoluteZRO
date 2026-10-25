// Only packaged, signed distributions with a configured HTTPS feed can update.
function createUpdates({ app, updater, notify, broadcast, enabled }) {
  let state = {
      status: enabled ? 'idle' : 'unavailable',
      version: app.getVersion(),
      progress: 0,
      automatic: enabled,
    },
    timer,
    notifiedVersion;
  const send = (patch) => {
    state = { ...state, ...patch };
    broadcast(state);
  };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.on('checking-for-update', () => send({ status: 'checking', error: undefined }));
  updater.on('update-available', (info) => {
    if (
      !enabled ||
      (state.nextVersion === info.version &&
        ['downloading', 'downloaded', 'installing'].includes(state.status))
    )
      return;
    send({ status: 'available', nextVersion: info.version, progress: 0 });
    if (notifiedVersion !== info.version) {
      notifiedVersion = info.version;
      notify(info.version);
    }
    // Download once in the main process; the renderer installs after its work is saved.
    void command('download');
  });
  updater.on('update-not-available', () =>
    send({ status: 'current', nextVersion: undefined, progress: 0 }),
  );
  updater.on('download-progress', (info) =>
    send({ status: 'downloading', progress: Math.max(0, Math.min(100, Math.round(info.percent))) }),
  );
  updater.on('update-downloaded', (info) =>
    send({ status: 'downloaded', nextVersion: info.version, progress: 100 }),
  );
  updater.on('error', () =>
    send({
      status: 'error',
      error: 'Não foi possível atualizar agora. Sua versão continua disponível.',
    }),
  );
  async function command(action) {
    if (!enabled) return state;
    try {
      if (
        action === 'check' &&
        !['checking', 'downloading', 'downloaded', 'installing'].includes(state.status)
      )
        await updater.checkForUpdates();
      else if (action === 'download' && state.status === 'available') {
        send({ status: 'downloading', progress: 0, installRequested: true });
        await updater.downloadUpdate();
      } else if (action === 'install' && state.status === 'downloaded') {
        send({ status: 'installing' });
        updater.quitAndInstall(true, true);
      }
    } catch {
      send({
        status: 'error',
        error: 'Não foi possível atualizar agora. Tente novamente em alguns minutos.',
      });
    }
    return state;
  }
  function start() {
    if (!enabled || timer) return;
    timer = setTimeout(() => {
      void command('check');
      timer = setInterval(() => void command('check'), 4 * 60 * 60 * 1000);
      timer.unref?.();
    }, 5000);
    timer.unref?.();
  }
  function stop() {
    clearTimeout(timer);
    clearInterval(timer);
    timer = undefined;
  }
  return { command, getState: () => state, start, stop };
}
module.exports = { createUpdates };

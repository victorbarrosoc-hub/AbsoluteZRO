const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const pkg = require('./package.json');
// GitHub supplies an empty string for missing secrets. electron-builder treats
// an explicitly empty CSC_LINK as a certificate path pointing at the cwd.
for (const name of [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]) {
  if (process.env[name] === '') delete process.env[name];
}

const args = process.argv.slice(2),
  target = args.includes('--mac')
    ? 'mac'
    : args.includes('--win')
      ? 'win'
      : process.platform === 'darwin'
        ? 'mac'
        : 'win';
const arch = args.includes('--arm64') ? 'arm64' : args.includes('--x64') ? 'x64' : process.arch;
const config = {
  ...pkg.build,
  extraMetadata: { ...pkg.build.extraMetadata, nossomUpdates: false },
};
// Test builds still need a valid bundle signature after Electron is renamed.
// Ad-hoc signing proves integrity; it does not replace Apple's notarization.
if (target === 'mac' && !process.env.CSC_LINK) {
  config.mac = { ...config.mac, identity: '-', hardenedRuntime: false, notarize: false };
}
if (process.env.NOSSOM_UPDATE_BASE_URL) {
  const base = new URL(process.env.NOSSOM_UPDATE_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error(
      'NOSSOM_UPDATE_BASE_URL must be a public HTTPS directory without credentials, query or fragment.',
    );
  if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD)
    throw new Error('Signed update distributions require CSC_LINK and CSC_KEY_PASSWORD.');
  if (
    target === 'mac' &&
    !['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].every((k) => process.env[k])
  )
    throw new Error('Mac update distributions require Apple notarization credentials.');
  config.forceCodeSigning = true;
  config.extraMetadata.nossomUpdates = true;
  config.publish = {
    provider: 'generic',
    url:
      process.env.NOSSOM_UPDATE_FLAT_FEED === 'true'
        ? base.href.replace(/\/$/, '') + '/'
        : base.href.replace(/\/$/, '') + '/' + target + '-' + arch + '/',
    useMultipleRangeRequest: false,
  };
  if (target === 'mac') config.mac = { ...config.mac, notarize: true };
  else {
    if (!process.env.NOSSOM_WINDOWS_PUBLISHER)
      throw new Error(
        'Set NOSSOM_WINDOWS_PUBLISHER to the certificate publisher for verified Windows updates.',
      );
    config.win = {
      ...config.win,
      publisherName: process.env.NOSSOM_WINDOWS_PUBLISHER,
      verifyUpdateCodeSignature: true,
    };
  }
}
const filename = path.join(__dirname, '.builder-config.json');
fs.writeFileSync(filename, JSON.stringify(config));
const result = spawnSync(
  process.execPath,
  [
    require.resolve('electron-builder/out/cli/cli.js'),
    ...args,
    '--config',
    filename,
    '--publish',
    'never',
  ],
  { stdio: 'inherit', cwd: __dirname },
);
fs.rmSync(filename, { force: true });
process.exit(result.status ?? 1);

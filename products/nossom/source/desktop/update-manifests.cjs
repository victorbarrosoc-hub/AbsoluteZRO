const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
function writeManifests(directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable version is required.');
  const file = (name) => {
    const data = fs.readFileSync(path.join(directory, name));
    if (!data.length) throw new Error('Empty installer: ' + name);
    return {
      url: name,
      sha512: createHash('sha512').update(data).digest('base64'),
      size: data.length,
    };
  };
  // Require the whole release before creating any public update manifest.
  const mac = ['arm64', 'x64'].map((arch) => file(`NOSSOM-${version}-mac-${arch}.zip`));
  for (const arch of ['arm64', 'x64']) file(`NOSSOM-${version}-mac-${arch}.dmg`);
  const windows = [file(`NOSSOM-${version}-win-x64.exe`)];
  const releaseDate = new Date().toISOString();
  for (const [name, files] of [
    ['latest-mac.yml', mac],
    ['latest.yml', windows],
  ]) {
    // JSON is valid YAML and is parsed by electron-updater's YAML parser.
    fs.writeFileSync(
      path.join(directory, name),
      JSON.stringify(
        { version, files, path: files[0].url, sha512: files[0].sha512, releaseDate },
        null,
        2,
      ),
    );
  }
}
if (require.main === module) writeManifests(process.argv[2], require('./package.json').version);
module.exports = { writeManifests };

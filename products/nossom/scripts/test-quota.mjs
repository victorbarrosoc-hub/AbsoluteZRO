import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const name = 'nossom-quota-' + randomUUID().slice(0, 8);
const run = (args) => spawnSync('docker', args, { encoding: 'utf8' });
try {
  const start = run([
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'none',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:17-alpine',
  ]);
  if (start.status !== 0) throw new Error(start.stderr || 'Docker is required.');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (run(['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error('PostgreSQL test container did not become ready.');
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--test', 'tests/quota-postgres.integration.ts'],
      { stdio: 'inherit', env: { ...process.env, NOSSOM_TEST_POSTGRES_CONTAINER: name } },
    );
    child.on('exit', resolve);
  });
  process.exitCode = code || 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  run(['rm', '-f', name]);
}

// Postgres de teste: um cluster novo numa pasta temporária (initdb + postgres do Postgres 16 da máquina), com as
// migrações do Relay aplicadas. Sem os binários, `semPostgres` diz por quê e os testes de banco pulam.

import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BIN = ['/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin'].find((b) => existsSync(join(b, 'initdb')))
export const semPostgres = BIN ? false : 'sem Postgres na máquina'
const root = typeof process.getuid === 'function' && process.getuid() === 0

const portaLivre = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

/** Sobe um Postgres limpo. Devolve { url, fechar }. */
export async function subirPostgres() {
  const pasta = mkdtempSync(join(tmpdir(), 'relay-pg-'))
  chmodSync(pasta, 0o777)
  const dados = join(pasta, 'dados')
  const comoPg = (bin, args, opcoes) => (root ? ['runuser', ['-u', 'postgres', '--', join(BIN, bin), ...args], opcoes] : [join(BIN, bin), args, opcoes])
  execFileSync(...comoPg('initdb', ['-D', dados, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale'], { stdio: 'pipe' }))
  const porta = await portaLivre()
  const [cmd, args] = comoPg('postgres', ['-D', dados, '-p', String(porta), '-h', '127.0.0.1', '-k', pasta, '-c', 'fsync=off'])
  const proc = spawn(cmd, args, { stdio: 'pipe' })
  let log = ''
  proc.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 100; i++) {
    if (/ready to accept connections/.test(log)) break
    await new Promise((ok) => setTimeout(ok, 100))
  }
  if (!/ready to accept connections/.test(log)) throw new Error(`Postgres não subiu:\n${log}`)
  return {
    url: `postgres://postgres@127.0.0.1:${porta}/postgres`,
    fechar: async () => {
      // pelo pg_ctl: o sinal mandado ao runuser não chega ao postgres
      const saiu = new Promise((ok) => proc.once('exit', ok))
      execFileSync(...comoPg('pg_ctl', ['-D', dados, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' }))
      await saiu
      rmSync(pasta, { recursive: true, force: true })
    },
  }
}

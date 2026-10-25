#!/usr/bin/env node
// Prova de não interferência (PRD §6.2 item 7, §14): o git status e o HEAD dos repositórios originais são os mesmos
// registrados nos SOURCE_MANIFEST.md. Só leitura.
//   node scripts/check-originals.mjs /caminho/nossom /caminho/synquei /caminho/baixadordodrive /caminho/tpeasy /caminho/carrodofreela-app
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const manifests = Object.fromEntries(
  fs.readdirSync('products').flatMap((p) => {
    const f = path.join('products', p, 'SOURCE_MANIFEST.md')
    if (!fs.existsSync(f)) return []
    const t = fs.readFileSync(f, 'utf8')
    const repo = /Repositório de origem \| (\S+)/.exec(t)?.[1]
    const commit = /Commit \| `([0-9a-f]{40})`/.exec(t)?.[1]
    return repo && commit ? [[repo.replace(/\.git$/, ''), { product: p, commit }]] : []
  }),
)
let fail = false
for (const dir of process.argv.slice(2)) {
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
  const remote = git('remote', 'get-url', 'origin').replace(/\/\/[^@/]+@/, '//').replace(/\.git$/, '')
  const m = Object.entries(manifests).find(([r]) => remote.endsWith(r.replace(/^https?:\/\/[^/]+/, '')))?.[1]
  const head = git('rev-parse', 'HEAD')
  const status = git('status', '--porcelain')
  const ok = !status && (!m || m.commit === head)
  if (!ok) fail = true
  console.log(`${ok ? 'OK ' : 'ERRO'} ${dir} · HEAD ${head.slice(0, 7)}${m ? ` (cópia: ${m.commit.slice(0, 7)})` : ''} · ${status ? 'há mudanças locais' : 'git status limpo'}`)
}
process.exit(fail ? 1 : 0)

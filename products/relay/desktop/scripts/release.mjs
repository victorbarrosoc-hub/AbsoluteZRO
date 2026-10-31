// Ajudantes do Release do app (.github/workflows/relay-desktop.yml). O Release é "Relay · versão de teste"
// (tag relay-versao-de-teste) no repositório AbsoluteZRO. O mesmo roteiro do apps/hub-desktop/scripts/release.mjs.
//
//   node scripts/release.mjs build-info
//       grava desktop/build-info.json (vai dentro do app): o build que o aviso "Nova versão do Relay" compara com o
//       versao.json do Release. Sem GITHUB_RUN_NUMBER fica 0 = versão de desenvolvimento (não confere nada).
//   node scripts/release.mjs nomear <mac|windows> <dist>
//       põe o build no nome do instalador (Relay-0.1.0-b12-mac-universal.dmg), para o build seguinte não trocar o
//       arquivo que está sendo entregue, e grava o SHA-256 em <dist>/Relay-sha256-b12-<plataforma>.json.
//   node scripts/release.mjs versao <pasta-dos-sha> <versao.json>
//       junta os dois SHA-256 no versao.json (a Absolute ZRO serve em /baixar/app/relay/versao.json).
//   node scripts/release.mjs limpar [build]
//       tira do Release os arquivos de builds antigos (ficam o atual e os dois anteriores).

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = process.env.GITHUB_REPOSITORY || 'victorbarrosoc-hub/AbsoluteZRO'
export const TAG = process.env.RELAY_DESKTOP_TAG || 'relay-versao-de-teste'
export const MANTER = 3
export const build = (env = process.env) => {
  const run = Number(env.GITHUB_RUN_NUMBER || 0)
  return run > 0 ? run + (Number(env.RELAY_DESKTOP_BUILD_BASE) || 0) : 0
}
const QUAL = { mac: (n) => n.endsWith('-mac-universal.dmg'), windows: (n) => n.endsWith('-windows-setup.exe') }
const SUFIXO = { mac: 'mac-universal.dmg', windows: 'windows-setup.exe' }

/** Nome do instalador no Release: Relay-<versão>-b<build>-<sistema>. */
export const nomeComBuild = (versao, b, plataforma) => `Relay-${versao}-b${b}-${SUFIXO[plataforma]}`

/** Arquivos do Release que saem na limpeza: os de build menor que atual − (MANTER − 1). O versao.json fica. */
export const paraApagar = (nomes, atual) =>
  nomes.filter((n) => {
    const m = /-b(\d+)-/.exec(n)
    return !!m && Number(m[1]) < atual - (MANTER - 1)
  })

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })

async function nomear(plataforma, dist) {
  if (!QUAL[plataforma]) throw new Error('plataforma: mac ou windows')
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'))
  const achado = (await fs.readdir(dist)).find((f) => QUAL[plataforma](f) && !/-b\d+-/.test(f))
  if (!achado) throw new Error(`instalador de ${plataforma} não encontrado em ${dist}`)
  const nome = nomeComBuild(pkg.version, build(), plataforma)
  await fs.rename(path.join(dist, achado), path.join(dist, nome))
  const hash = await sha256(path.join(dist, nome))
  await fs.writeFile(path.join(dist, `Relay-sha256-b${build()}-${plataforma}.json`), JSON.stringify({ arquivo: nome, sha256: hash }))
  console.log(`${nome} ${hash}`)
}

async function versao(pasta, out) {
  const files = await fs.readdir(pasta)
  const ler = async (p) => {
    const f = files.find((x) => x.endsWith(`-b${build()}-${p}.json`))
    if (!f) throw new Error(`SHA-256 de ${p} do build ${build()} não está em ${pasta}`)
    return JSON.parse(await fs.readFile(path.join(pasta, f), 'utf8'))
  }
  const mac = await ler('mac')
  const win = await ler('windows')
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'))
  const v = {
    build: build(),
    versao: pkg.version,
    commit: process.env.GITHUB_SHA || '',
    data: new Date().toISOString(),
    arquivoMac: mac.arquivo,
    sha256Mac: mac.sha256,
    arquivoWindows: win.arquivo,
    sha256Windows: win.sha256,
  }
  await fs.writeFile(out, JSON.stringify(v, null, 2))
  console.log(JSON.stringify(v))
}

async function buildInfo() {
  let data = new Date().toISOString()
  try {
    const { execFileSync } = await import('node:child_process')
    data = new Date(execFileSync('git', ['show', '-s', '--format=%cI', process.env.GITHUB_SHA || 'HEAD'], { encoding: 'utf8' }).trim()).toISOString()
  } catch {
    // sem git: fica a hora de agora
  }
  const sha = String(process.env.GITHUB_SHA || '')
  const info = { build: build(), commit: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : '', data }
  await fs.writeFile(path.join('desktop', 'build-info.json'), JSON.stringify(info) + '\n')
  console.log(JSON.stringify(info))
}

async function limpar(atual) {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('sem GITHUB_TOKEN')
  const api = (u, init = {}) =>
    fetch(`https://api.github.com/repos/${REPO}${u}`, {
      ...init,
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, ...(init.headers || {}) },
    })
  const r = await api(`/releases/tags/${TAG}`)
  if (!r.ok) throw new Error(`release ${r.status}`)
  const rel = await r.json()
  const saem = new Set(
    paraApagar(
      (rel.assets || []).map((a) => a.name),
      atual,
    ),
  )
  for (const a of rel.assets || []) {
    if (!saem.has(a.name)) continue
    const d = await api(`/releases/assets/${a.id}`, { method: 'DELETE' })
    console.log(`apagado ${a.name} (${d.status})`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2)
  const run = {
    nomear: () => nomear(...args),
    versao: () => versao(...args),
    limpar: () => limpar(args[0] ? Number(args[0]) : build()),
    'build-info': () => buildInfo(),
  }[cmd]
  if (!run) {
    console.error('uso: release.mjs build-info|nomear|versao|limpar …')
    process.exit(2)
  }
  run().catch((e) => {
    console.error(e.message || e)
    process.exit(1)
  })
}

// Ajudantes do Release do app (.github/workflows/hub-desktop.yml). O Release é "hub-desktop" no repositório AbsoluteZRO.
//
//   node scripts/release.mjs build-info
//       grava desktop/build-info.json (vai dentro do app): o build que o aviso de versão nova compara com o
//       versao.json do site. Sem GITHUB_RUN_NUMBER fica 0 = versão de desenvolvimento (não confere nada).
//   node scripts/release.mjs nomear <mac|windows> <dist>
//       põe o build no nome do instalador (AbsoluteZRO-1.0.0-b12-mac-universal.dmg), para o build seguinte não trocar
//       o arquivo que o site está entregando, e grava o SHA-256 em <dist>/AbsoluteZRO-sha256-b12-<plataforma>.json.
//   node scripts/release.mjs versao <pasta-dos-sha> <versao.json>
//       junta os dois SHA-256 no versao.json que o HUB serve em /baixar/hub/versao.
//   node scripts/release.mjs limpar [build]
//       tira do Release os instaladores de builds antigos (ficam o atual e os dois anteriores).

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

const REPO = process.env.GITHUB_REPOSITORY || 'victorbarrosoc-hub/AbsoluteZRO'
export const TAG = process.env.HUB_DESKTOP_TAG || 'hub-desktop'
export const build = () => {
  const run = Number(process.env.GITHUB_RUN_NUMBER || 0)
  return run > 0 ? run + (Number(process.env.HUB_DESKTOP_BUILD_BASE) || 0) : 0
}
const QUAL = { mac: (n) => n.endsWith('-mac-universal.dmg'), windows: (n) => n.endsWith('-windows-setup.exe') }
const SUFIXO = { mac: 'mac-universal.dmg', windows: 'windows-setup.exe' }

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
  const nome = `AbsoluteZRO-${pkg.version}-b${build()}-${SUFIXO[plataforma]}`
  await fs.rename(path.join(dist, achado), path.join(dist, nome))
  const hash = await sha256(path.join(dist, nome))
  await fs.writeFile(path.join(dist, `AbsoluteZRO-sha256-b${build()}-${plataforma}.json`), JSON.stringify({ arquivo: nome, sha256: hash }))
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
  for (const a of rel.assets || []) {
    const m = /-b(\d+)-/.exec(a.name)
    if (m && Number(m[1]) < atual - 2) {
      const d = await api(`/releases/assets/${a.id}`, { method: 'DELETE' })
      console.log(`apagado ${a.name} (${d.status})`)
    }
  }
}

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

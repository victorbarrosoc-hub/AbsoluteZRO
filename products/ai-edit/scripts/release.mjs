// Ajudantes do Release do app de desktop, usados pelo GitHub Actions (.github/workflows/ai-edit-desktop.yml). O
// Release é o de tag src/produto.js › release (ADR 0013: prefixo do app). Os instaladores pelo Terminal (instalar.sh e
// instalar.ps1) leem o versao.json direto do Release: sem site no meio, custo zero.
//
//   node scripts/release.mjs nomear <mac|windows> <dist> <saida>
//       dá ao instalador o nome fixo (<arquivo>-mac-universal.dmg / <arquivo>-windows-setup.exe) e grava o SHA-256
//       em <saida>/sha256-<plataforma>.json
//   node scripts/release.mjs versao <pasta-dos-sha> <versao.json>
//       junta os dois SHA-256 no versao.json: { build, commit, data, mac, windows, sha256Mac, sha256Windows }
//   node scripts/release.mjs build-info
//       grava desktop/build-info.json (vai dentro do app): build, commit e data deste app.
//
// Build = GITHUB_RUN_NUMBER (0 fora do CI = versão de desenvolvimento).

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PRODUTO } from '../src/produto.js'

export const build = () => Number(process.env.GITHUB_RUN_NUMBER || 0)
export const nomeFinal = (plataforma) => (plataforma === 'mac' ? `${PRODUTO.arquivo}-mac-universal.dmg` : `${PRODUTO.arquivo}-windows-setup.exe`)

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })

export async function nomear(plataforma, dist, saida) {
  const files = await fs.readdir(dist)
  const achado = plataforma === 'mac' ? files.find((f) => f.endsWith('.dmg')) : files.find((f) => f.endsWith('-windows-setup.exe'))
  if (!achado) throw new Error(`instalador de ${plataforma} não encontrado em ${dist}`)
  const nome = nomeFinal(plataforma)
  if (achado !== nome) await fs.rename(path.join(dist, achado), path.join(dist, nome))
  const hash = await sha256(path.join(dist, nome))
  await fs.mkdir(saida, { recursive: true })
  await fs.writeFile(path.join(saida, `sha256-${plataforma}.json`), JSON.stringify({ arquivo: nome, sha256: hash, build: build() }))
  return { nome, hash }
}

export async function versao(pasta, out, agora = new Date()) {
  // uma plataforma pode faltar (o build dela falhou): ela fica de fora e o instalador dela diz que ainda não há versão
  const ler = async (p) => JSON.parse(await fs.readFile(path.join(pasta, `sha256-${p}.json`), 'utf8').catch(() => 'null'))
  const mac = await ler('mac')
  const win = await ler('windows')
  if (!mac && !win) throw new Error('nenhum instalador no Release')
  const v = { build: build(), commit: (process.env.GITHUB_SHA || '').slice(0, 12), data: agora.toISOString(), mac: mac?.arquivo ?? null, windows: win?.arquivo ?? null, sha256Mac: mac?.sha256 ?? null, sha256Windows: win?.sha256 ?? null }
  await fs.writeFile(out, JSON.stringify(v, null, 2) + '\n')
  return v
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const [cmd, ...a] = process.argv.slice(2)
  if (cmd === 'nomear') console.log(await nomear(a[0], a[1], a[2]))
  else if (cmd === 'versao') console.log(await versao(a[0], a[1]))
  else if (cmd === 'build-info') {
    const info = { build: build(), commit: (process.env.GITHUB_SHA || '').slice(0, 12), data: new Date().toISOString() }
    await fs.writeFile(new URL('../desktop/build-info.json', import.meta.url), JSON.stringify(info) + '\n')
    console.log(info)
  } else {
    console.error('uso: release.mjs nomear|versao|build-info')
    process.exit(1)
  }
}

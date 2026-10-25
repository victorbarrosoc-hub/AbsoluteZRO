#!/usr/bin/env node
// Limpa o Release de teste depois que o versao.json novo subiu (job "versao" do .github/workflows/sobedesce-desktop.yml na raiz):
// apaga os instaladores de builds antigos e os de nome antigo (sem "-bN-"). Fica o build atual e os dois anteriores,
// para quem ainda está baixando um deles (o site guarda o versao.json por até 5 min, e a CDN mais 5).
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=dono/repo node scripts/limpar-release.mjs [build atual]
// Sem o número, usa GITHUB_RUN_NUMBER + SOBEDESCE_BUILD_BASE (scripts/numero-build.mjs).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTALADORES } from './sha256.mjs'
import { numeroDoBuild } from './numero-build.mjs'

// Só o Release de teste do AbsoluteZRO: o do repositório antigo (baixadordodrive, "versao-de-teste") não é mexido daqui.
export const TAG = 'sobedesce-versao-de-teste'
export const MANTER = 3

const ehInstalador = nome => Object.values(INSTALADORES).some(m => m(nome))
const buildDoNome = nome => {
  const m = /-b(\d{1,9})-/.exec(nome)
  return m ? Number(m[1]) : null
}

/** Quais arquivos saem: instalador sem build no nome, ou de build fora dos MANTER mais novos até o atual. */
export function paraApagar(assets, atual, manter = MANTER) {
  return assets.filter(a => {
    if (!ehInstalador(a.name)) return false
    const b = buildDoNome(a.name)
    if (b == null) return true
    return b <= atual - manter
  })
}

async function main() {
  const atual = process.argv[2] ? Number.parseInt(process.argv[2], 10) : numeroDoBuild()
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!Number.isSafeInteger(atual) || atual <= 0 || !token || !repo) throw new Error('faltam o build atual, GITHUB_TOKEN ou GITHUB_REPOSITORY')
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${TAG}`, { headers })
  if (!res.ok) throw new Error(`release ${res.status}`)
  const { assets = [] } = await res.json()
  for (const a of paraApagar(assets, atual)) {
    const d = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${a.id}`, { method: 'DELETE', headers })
    console.log(`${d.ok ? 'apagado' : `não apagou (${d.status})`}: ${a.name}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Limpar é arrumação: uma falha aqui não derruba a publicação (o versao.json já subiu).
  main().catch(err => console.warn(`limpar-release: ${err.message}`))
}

#!/usr/bin/env node
// Copia um produto original para products/<nome>/ sem tocar no original.
//
//   node scripts/snapshot-product.mjs <produto> <caminho-do-clone-original>
//
// Só leitura na origem: `git archive HEAD` exporta os arquivos versionados (sem .git, sem .env local,
// sem nada fora do git). Depois aplica o saneamento do produto (snapshot.config.mjs) e grava
// products/<nome>/SOURCE_MANIFEST.md com URL, branch, commit e o que foi removido ou trocado.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUTOS } from './snapshot.config.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [nome, origem] = process.argv.slice(2)
const cfg = PRODUTOS[nome]
if (!cfg || !origem) {
  console.error(`uso: snapshot-product.mjs <${Object.keys(PRODUTOS).join('|')}> <clone-original>`)
  process.exit(2)
}
const git = (...a) => execFileSync('git', ['-C', origem, ...a], { encoding: 'utf8' }).trim()

const antes = git('status', '--porcelain')
const commit = git('rev-parse', 'HEAD')
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const remoto = git('remote', 'get-url', 'origin').replace(/\/\/[^@/]+@/, '//')
const dataCommit = git('show', '-s', '--format=%cI', 'HEAD')

const destino = path.join(RAIZ, 'products', nome)
const fonte = path.join(destino, 'source')
fs.rmSync(fonte, { recursive: true, force: true })
fs.mkdirSync(fonte, { recursive: true })
const tar = execFileSync('git', ['-C', origem, 'archive', '--format=tar', 'HEAD', ...(cfg.subpasta ? [cfg.subpasta] : [])], { maxBuffer: 1 << 30 })
execFileSync('tar', ['-x', '-C', fonte, ...(cfg.subpasta ? ['--strip-components', String(cfg.subpasta.split('/').length)] : [])], { input: tar })

const removidos = []
const trocados = []
const andar = (dir, rel = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    const abs = path.join(dir, e.name)
    if ([...PADRAO_REMOVER, ...(cfg.remover || [])].some((re) => re.test(r))) {
      fs.rmSync(abs, { recursive: true, force: true })
      removidos.push(r + (e.isDirectory() ? '/' : ''))
      continue
    }
    if (e.isDirectory()) andar(abs, r)
    else if (e.isFile() && cfg.trocar?.length && !/\.(png|jpe?g|webp|gif|mp4|mp3|wav|woff2?|ico|icns|zip)$/i.test(e.name)) {
      let txt = fs.readFileSync(abs, 'utf8')
      let mudou = false
      for (const t of cfg.trocar) {
        if (t.de.test(txt)) {
          txt = txt.replace(t.de, t.para)
          mudou = true
          trocados.push(`${r}: ${t.motivo}`)
        }
        t.de.lastIndex = 0
      }
      if (mudou) fs.writeFileSync(abs, txt)
    }
  }
}
// Arquivos que nunca entram numa cópia: segredos locais e artefatos.
const PADRAO_REMOVER = [/(^|\/)\.env(?!\.example$)[^/]*$/, /(^|\/)\.vercel$/, /(^|\/)node_modules$/, /\.(pem|p12|key)$/i, /(^|\/)\.DS_Store$/]
andar(fonte)
for (const [arquivo, conteudo] of Object.entries(cfg.substituir || {})) {
  fs.writeFileSync(path.join(fonte, arquivo), conteudo)
  trocados.push(`${arquivo}: ${cfg.motivoSubstituir?.[arquivo] || 'substituído na cópia'}`)
}

const depois = git('status', '--porcelain')
if (antes !== depois) throw new Error(`o git status do original mudou durante a cópia: ${origem}`)

const lista = (xs) => (xs.length ? xs.map((x) => `- \`${x}\``).join('\n') : '- nada')
fs.writeFileSync(
  path.join(destino, 'SOURCE_MANIFEST.md'),
  `# SOURCE_MANIFEST — ${cfg.titulo}

Cópia controlada (PRD §6.2). O original continua sendo a fonte de produção; esta pasta não é deploy.

| Campo | Valor |
| --- | --- |
| Repositório de origem | ${remoto} |
| Branch | \`${branch}\` |
| Commit | \`${commit}\` |
| Data do commit | ${dataCommit} |
| Subpasta copiada | \`${cfg.subpasta || '/'}\` |
| Visibilidade da origem | ${cfg.visibilidade} |
| Licença | ${cfg.licenca} |
| Stack | ${cfg.stack} |
| Estratégia no HUB (PRD §6.2 a–d) | ${cfg.estrategia} |
| Cópia feita em | ${new Date().toISOString()} |
| \`git status\` do original | inalterado antes e depois da cópia (${antes ? 'havia mudanças locais' : 'limpo'}) |

Método: \`git archive HEAD\` do clone de leitura (só arquivos versionados) → \`source/\`, mais o saneamento abaixo.
Para atualizar: \`node scripts/snapshot-product.mjs ${nome} <clone-do-original>\`.

## Removido da cópia

${lista(removidos)}

## Trocado na cópia (saneamento)

${lista(trocados)}

## Observações

${cfg.observacoes.map((o) => `- ${o}`).join('\n')}
`,
)
console.log(`${nome}: ${commit.slice(0, 7)} → products/${nome}/source (${removidos.length} removidos, ${trocados.length} trocas)`)

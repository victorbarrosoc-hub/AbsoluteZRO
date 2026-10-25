#!/usr/bin/env node
// Traz uma plataforma para products/<nome>/ como FONTE OFICIAL (ADR 0013). Só lê o repositório antigo.
//
//   node scripts/import-product.mjs <produto> <clone-do-repositorio-antigo>
//
// Exporta os arquivos versionados do HEAD (precisa estar na main, limpo) com `git archive`, troca o conteúdo de
// products/<nome>/ e grava products/<nome>/ORIGEM.md com repositório, commit e o que mudou na vinda.
// Saneamento: só o que é segredo de verdade sai (`.env`, chaves). As regras por produto ficam em snapshot.config.mjs.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUTOS } from './snapshot.config.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [nome, origem] = process.argv.slice(2)
const cfg = PRODUTOS[nome]
if (!cfg || !origem) {
  console.error(`uso: import-product.mjs <${Object.keys(PRODUTOS).join('|')}> <clone>`)
  process.exit(2)
}
const git = (...a) => execFileSync('git', ['-C', origem, ...a], { encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) throw new Error(`o clone tem mudanças locais: ${origem}`)
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'main') throw new Error(`o clone precisa estar na main (está em ${branch})`)
const commit = git('rev-parse', 'HEAD')
const remoto = git('remote', 'get-url', 'origin')
  .replace(/\/\/[^@/]+@/, '//')
  .replace(/^http:\/\/[^/]+\/git\//, 'https://github.com/')
  .replace(/\.git$/, '')
const dataCommit = git('show', '-s', '--format=%cI', 'HEAD')

const destino = path.join(RAIZ, 'products', nome)
fs.rmSync(destino, { recursive: true, force: true })
fs.mkdirSync(destino, { recursive: true })
const tar = execFileSync('git', ['-C', origem, 'archive', '--format=tar', 'HEAD', ...(cfg.subpasta ? [cfg.subpasta] : [])], { maxBuffer: 1 << 30 })
execFileSync('tar', ['-x', '-C', destino, ...(cfg.subpasta ? ['--strip-components', String(cfg.subpasta.split('/').length)] : [])], { input: tar })

// Segredo local e artefato nunca entram. O resto vem inteiro: é o código que vai para produção.
const NUNCA = [/(^|\/)\.env(?!\.example$)[^/]*$/, /(^|\/)\.vercel$/, /(^|\/)node_modules$/, /\.(pem|p12|key)$/i, /(^|\/)\.DS_Store$/]
const removidos = []
const andar = (dir, rel = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    const abs = path.join(dir, e.name)
    if ([...NUNCA, ...(cfg.remover || [])].some((re) => re.test(r))) {
      fs.rmSync(abs, { recursive: true, force: true })
      removidos.push(r + (e.isDirectory() ? '/' : ''))
    } else if (e.isDirectory()) andar(abs, r)
  }
}
andar(destino)

// Workflows de pasta não rodam no GitHub: os do app ficam guardados aqui e as versões ativas vão para .github/ da raiz.
const lista = (xs) => (xs.length ? xs.map((x) => `- \`${x}\``).join('\n') : '- nada')
fs.writeFileSync(
  path.join(destino, 'ORIGEM.md'),
  `# ORIGEM — ${cfg.titulo}

Esta pasta é a **fonte oficial** do ${cfg.titulo} desde ${new Date().toISOString().slice(0, 10)} (ADR 0013). Mudanças
entram por PR neste repositório; o repositório antigo fica arquivado, só para consulta do histórico.

| Campo | Valor |
| --- | --- |
| Veio de | ${remoto} |
| Commit | \`${commit}\` (${dataCommit}) |
| Subpasta | \`${cfg.subpasta || '/'}\` |
| Licença | ${cfg.licenca} |
| Stack | ${cfg.stack} |

## Não veio (segredo local ou artefato)

${lista(removidos)}

## Observações

${(cfg.observacoesFonte || []).map((o) => `- ${o}`).join('\n') || '- nenhuma'}
`,
)
console.log(`${nome}: ${commit.slice(0, 7)} → products/${nome}/ (${removidos.length} fora)`)

// ZERA · monta publico/ (o buildCommand da Vercel).
// Fechado (padrão: app não lançado, CLAUDE.md da raiz): só a página neutra "Página indisponível.", em qualquer
// endereço, sem nome nem marca do ZERA, e o robots fecha tudo.
// Aberto (ZERA_SITE_ABERTO=1 no projeto da Vercel, quando o titular lançar): a página do produto (site/).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const saida = join(raiz, 'publico')
const aberto = process.env.ZERA_SITE_ABERTO === '1'

rmSync(saida, { recursive: true, force: true })
mkdirSync(saida, { recursive: true })
if (aberto) {
  cpSync(join(raiz, 'site'), saida, { recursive: true })
  cpSync(join(raiz, 'indisponivel.html'), join(saida, '404.html'))
  writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nAllow: /\n')
} else {
  cpSync(join(raiz, 'indisponivel.html'), join(saida, 'index.html'))
  cpSync(join(raiz, 'indisponivel.html'), join(saida, '404.html'))
  writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
}
console.log(`publico/ pronto (${aberto ? 'aberto' : 'fechado'})`)

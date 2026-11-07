// Rádio do set · monta publico/ (o buildCommand da Vercel). O site estático só tem as fontes e o robots: a página e o
// app saem pelas funções (api/pagina.js, api/recurso.js), que conferem o gate.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const saida = join(raiz, 'publico')
rmSync(saida, { recursive: true, force: true })
mkdirSync(saida, { recursive: true })
cpSync(join(raiz, 'fontes'), join(saida, 'fontes'), { recursive: true })
// no ar desde 07/11/2026 (HUB 0062): a página inicial pode ser achada; o app e a API, não
writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nAllow: /$\nDisallow: /api/\nDisallow: /app/\nDisallow: /entrar\n')
console.log('publico/ pronto')

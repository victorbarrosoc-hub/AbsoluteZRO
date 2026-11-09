// CAMZRO · monta publico/ (o buildCommand da Vercel). O site estático só tem as fontes e o robots: a página, o app e
// a marca saem pelas funções (api/pagina.js, api/recurso.js), que conferem o gate. Não lançado: nada indexa.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const saida = join(raiz, 'publico')
rmSync(saida, { recursive: true, force: true })
mkdirSync(saida, { recursive: true })
cpSync(join(raiz, 'fontes'), join(saida, 'fontes'), { recursive: true })
writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
console.log('publico/ pronto')

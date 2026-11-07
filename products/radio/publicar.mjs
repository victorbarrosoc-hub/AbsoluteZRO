// Rádio do set · monta publico/ (o buildCommand da Vercel). O site estático só tem as fontes, o robots e as imagens de
// compartilhar: a página e o
// app saem pelas funções (api/pagina.js, api/recurso.js), que conferem o gate.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const saida = join(raiz, 'publico')
rmSync(saida, { recursive: true, force: true })
mkdirSync(saida, { recursive: true })
cpSync(join(raiz, 'fontes'), join(saida, 'fontes'), { recursive: true })
// imagem de compartilhamento e ícone do compartilhar na raiz, fora do /app/ (que o robots fecha): o Safari, o iMessage,
// o WhatsApp e o X acham sem passar pelo gate. São públicos desde o lançamento (HUB 0062).
cpSync(join(raiz, 'app/marca/og.png'), join(saida, 'og.png'))
for (const f of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) cpSync(join(raiz, 'app/marca/radion-180.png'), join(saida, f))
// no ar desde 07/11/2026 (HUB 0062): a página inicial pode ser achada; o app e a API, não
writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nAllow: /$\nDisallow: /api/\nDisallow: /app/\nDisallow: /entrar\n')
console.log('publico/ pronto')

// CAMZRO · monta publico/ (o buildCommand da Vercel). O site estático só tem as fontes e o robots: a página, o app e
// a marca saem pelas funções (api/pagina.js, api/recurso.js), que conferem o gate. Não lançado: nada indexa e nem a
// imagem de compartilhar fica pública. No lançamento (CAMZRO_SITE_ABERTO=1, com a migration que abre o gate), a
// og.png e o ícone do compartilhar vão para a raiz pública, fora do /app/.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const saida = join(raiz, 'publico')
const aberto = process.env.CAMZRO_SITE_ABERTO === '1'
rmSync(saida, { recursive: true, force: true })
mkdirSync(saida, { recursive: true })
cpSync(join(raiz, 'fontes'), join(saida, 'fontes'), { recursive: true })
if (aberto) {
  cpSync(join(raiz, 'app/marca/og.png'), join(saida, 'og.png'))
  for (const f of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) cpSync(join(raiz, 'app/marca/icone-180.png'), join(saida, f))
  writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nAllow: /$\nDisallow: /api/\nDisallow: /app/\nDisallow: /entrar\n')
} else {
  writeFileSync(join(saida, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
}
console.log(`publico/ pronto${aberto ? ' (site aberto: og.png e apple-touch-icon na raiz)' : ''}`)

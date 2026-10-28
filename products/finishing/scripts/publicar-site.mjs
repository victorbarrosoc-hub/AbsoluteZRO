// Monta publico/ para a Vercel (revela.absolutezro.com). Fechada ao público (api/_release.js, o padrão): só o site
// institucional (página inicial, entrar, "Em desenvolvimento", manifesto, OG, marca/, fontes/, vendor/ e o pouco de app/
// que a página inicial usa); as ferramentas (inicio, lut, cst, entrega, converter, com o resto de app/, src/ e
// exemplos/) ficam fora do estático e só saem pela função api/app.js para a conta liberada. Com RELEASE=released,
// tudo como antes. Só arquivos de site: nada de api/, testes, scripts ou node_modules.
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { release } from '../api/_release.js'

/** O site institucional (vale fechado e aberto). vendor/ é só o Mediabunny (biblioteca de terceiros). */
export const SITE = ['index.html', 'entrar.html', 'em-desenvolvimento.html', 'manifest.webmanifest', 'og.jpg', 'marca', 'fontes', 'vendor']
/** O que a página inicial, a entrada e a página "Em desenvolvimento" usam de app/: tema, folhas, conta, ícones. */
export const SITE_APP = ['app/tema.js', 'app/revela.css', 'app/home.css', 'app/home.js', 'app/conta.js', 'app/visual.js', 'app/entrar.js', 'app/entrar.css', 'app/fechado.css']
/** Só com RELEASE=released: as ferramentas e tudo que elas carregam. */
export const ABERTO = ['inicio.html', 'lut.html', 'cst.html', 'entrega.html', 'converter.html', 'app', 'src', 'exemplos']

export const itens = (estado = release()) => (estado === 'released' ? [...SITE, ...ABERTO] : [...SITE, ...SITE_APP])

/** Copia os itens do estado para `saida` (apagada antes). Devolve o estado e a lista. */
export function publicar({ raiz = new URL('..', import.meta.url), saida = new URL('publico/', raiz), estado = release() } = {}) {
  if (!existsSync(new URL('vendor/mediabunny.min.mjs', raiz))) throw new Error('vendor/ vazio: rode npm run vendor antes')
  rmSync(saida, { recursive: true, force: true })
  mkdirSync(saida, { recursive: true })
  const lista = itens(estado)
  for (const i of lista) {
    const de = new URL(i, raiz)
    const para = new URL(i, saida)
    if (statSync(de).isFile()) mkdirSync(dirname(fileURLToPath(para)), { recursive: true })
    cpSync(de, para, { recursive: true })
  }
  return { estado, itens: lista }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const r = publicar()
  console.log(`publico/ pronto (${r.estado}):`, r.itens.join(', '))
}

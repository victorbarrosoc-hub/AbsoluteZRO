// Monta publico/ para a Vercel (aeon.absolutezro.com): a página inicial, o editor no navegador (app/) e o que eles
// carregam. Só arquivos de site: nada de desktop/, testes, scripts ou node_modules. Rode depois do npm run vendor.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'

const raiz = new URL('..', import.meta.url)
const saida = new URL('publico/', raiz)
const ITENS = ['index.html', 'site', 'marca', 'app', 'src', 'presets', 'vendor']
if (!existsSync(new URL('vendor/mediabunny.min.mjs', raiz))) throw new Error('vendor/ vazio: rode npm run vendor antes')
rmSync(saida, { recursive: true, force: true })
mkdirSync(saida)
for (const i of ITENS) cpSync(new URL(i, raiz), new URL(i, saida), { recursive: true })
console.log('publico/ pronto:', ITENS.join(', '))

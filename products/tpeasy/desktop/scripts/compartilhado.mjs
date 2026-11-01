// O que o TPeasy para computador usa igual ao Absolute ZRO para computador (apps/hub-desktop):
// a memória da janela, a ponte da barra do Mac, o estilo da tela "Sem conexão" e a Figtree local.
// (O wordmark é o flat de apps/hub-web/public/brand/absolute-zro-grafite.svg, em desktop/paginas/marca.svg.)
// Cópias idênticas (o app empacotado não alcança outra pasta do repositório); test/compartilhado.test.mjs confere.
// Mudou no hub-desktop? Rode `npm run compartilhado` aqui e faça commit das cópias.
//
//   node scripts/compartilhado.mjs           copia de apps/hub-desktop para cá
//   node scripts/compartilhado.mjs --conferir  só confere (sai com 1 se alguma cópia estiver diferente)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ORIGEM = path.resolve(RAIZ, '..', '..', '..', 'apps', 'hub-desktop')

/** Caminhos relativos, iguais nos dois apps. */
export const COMPARTILHADOS = [
  'desktop/janela.cjs',
  'desktop/preload-barra.cjs',
  'desktop/paginas/offline.css',
  'desktop/paginas/fontes/OFL.txt',
  'desktop/paginas/fontes/figtree-latin-wght-normal.woff2',
  'desktop/paginas/fontes/figtree-latin-ext-wght-normal.woff2',
]

/** As cópias que não batem com a origem (vazio = tudo em dia). */
export function diferentes() {
  return COMPARTILHADOS.filter((rel) => {
    const a = path.join(ORIGEM, rel)
    const b = path.join(RAIZ, rel)
    return !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b))
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--conferir')) {
    const d = diferentes()
    for (const rel of d) console.error(`diferente de apps/hub-desktop: ${rel}`)
    process.exit(d.length ? 1 : 0)
  }
  for (const rel of COMPARTILHADOS) {
    fs.mkdirSync(path.dirname(path.join(RAIZ, rel)), { recursive: true })
    fs.copyFileSync(path.join(ORIGEM, rel), path.join(RAIZ, rel))
    console.log(`apps/hub-desktop/${rel} → ${rel}`)
  }
}

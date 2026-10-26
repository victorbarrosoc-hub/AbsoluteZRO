// Copia o Mediabunny (MPL-2.0) e o decodificador de ProRes para vendor/: o site é estático e sem build.
// A única mudança é o import do pacote de ProRes, que aponta para a cópia local em vez de "mediabunny" (sem import
// map, que exigiria script inline na CSP). Rode depois de mudar a versão: npm run vendor.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url)
const nm = (p) => new URL(`node_modules/${p}`, raiz)
const destino = (p) => new URL(`vendor/${p}`, raiz)

export function prores() {
  const fonte = readFileSync(nm('@mediabunny/prores/dist/bundles/mediabunny-prores.min.mjs'), 'utf8')
  const trocado = fonte.replace(/from\s*["']mediabunny["']/g, 'from"./mediabunny.min.mjs"')
  if (trocado === fonte) throw new Error('import de "mediabunny" não encontrado no pacote de ProRes')
  return trocado
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  copyFileSync(nm('mediabunny/dist/bundles/mediabunny.min.mjs'), destino('mediabunny.min.mjs'))
  writeFileSync(destino('mediabunny-prores.min.mjs'), prores())
  copyFileSync(nm('mediabunny/LICENSE'), destino('LICENSE-mediabunny.txt'))
  const versao = (p) => JSON.parse(readFileSync(nm(`${p}/package.json`), 'utf8')).version
  writeFileSync(
    destino('README.md'),
    `# Bibliotecas de terceiros

- [Mediabunny](https://mediabunny.dev) ${versao('mediabunny')} e @mediabunny/prores ${versao('@mediabunny/prores')} (com o
  decodificador TurboRes): MPL-2.0, licença em \`LICENSE-mediabunny.txt\`.
- Cópias de \`node_modules\` feitas por \`npm run vendor\`. Única modificação: em \`mediabunny-prores.min.mjs\`, o import
  de \`"mediabunny"\` aponta para \`./mediabunny.min.mjs\`. Um teste confere que as cópias batem com os pacotes.
`,
  )
  console.log('vendor/ atualizado')
}

// Copia o Mediabunny (MPL-2.0) e as extensões para vendor/: o site é estático e sem build. A única mudança é o import
// das extensões, que aponta para a cópia local em vez de "mediabunny" (sem import map, que exigiria script inline na
// CSP). Rode depois de mudar a versão: npm run vendor. test/vendor.test.js confere que as cópias batem.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url)
const nm = (p) => new URL(`node_modules/${p}`, raiz)
const destino = (p) => new URL(`vendor/${p}`, raiz)

/** As extensões: ProRes (ler masters), AAC (gravar onde o navegador não tem, como o Chromium no Linux) e MP3. */
export const EXTENSOES = [
  { pacote: '@mediabunny/prores', arquivo: 'mediabunny-prores.min.mjs' },
  { pacote: '@mediabunny/aac-encoder', arquivo: 'mediabunny-aac-encoder.min.mjs' },
  { pacote: '@mediabunny/mp3-encoder', arquivo: 'mediabunny-mp3-encoder.min.mjs' },
]

export function extensao({ pacote, arquivo }) {
  const fonte = readFileSync(nm(`${pacote}/dist/bundles/${arquivo}`), 'utf8')
  const trocado = fonte.replace(/from\s*["']mediabunny["']/g, 'from"./mediabunny.min.mjs"')
  if (trocado === fonte) throw new Error(`import de "mediabunny" não encontrado em ${pacote}`)
  return trocado
}

const versao = (p) => JSON.parse(readFileSync(nm(`${p}/package.json`), 'utf8')).version

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  copyFileSync(nm('mediabunny/dist/bundles/mediabunny.min.mjs'), destino('mediabunny.min.mjs'))
  for (const e of EXTENSOES) writeFileSync(destino(e.arquivo), extensao(e))
  copyFileSync(nm('mediabunny/LICENSE'), destino('LICENSE-mediabunny.txt'))
  writeFileSync(
    destino('README.md'),
    `# Bibliotecas de terceiros

- [Mediabunny](https://mediabunny.dev) ${versao('mediabunny')}: MPL-2.0, licença em \`LICENSE-mediabunny.txt\`.
${EXTENSOES.map((e) => `- ${e.pacote} ${versao(e.pacote)}: MPL-2.0.`).join('\n')}
- O codificador de AAC é o do FFmpeg (libavcodec, LGPL 2.1) e o de MP3 é o LAME (LGPL, https://lame.sourceforge.io),
  compilados em WebAssembly dentro das extensões; o código-fonte deles está nos repositórios do Mediabunny e dos
  projetos.
- Cópias de \`node_modules\` feitas por \`npm run vendor\`. Única modificação: nas extensões, o import de
  \`"mediabunny"\` aponta para \`./mediabunny.min.mjs\`. \`test/vendor.test.js\` confere que as cópias batem com os pacotes.
`,
  )
  console.log('vendor/ atualizado')
}

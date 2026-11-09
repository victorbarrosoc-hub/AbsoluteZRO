// Copia o Mediabunny (MPL-2.0) e o xxhash-wasm (MIT, o mesmo xxh64 do SOBEDESCE) de node_modules para app/vendor/ (o app é estático, sem build). A cópia vai para o git,
// como no Relay; test/vendor.test.js confere que bate com o pacote: ninguém edita a biblioteca à mão.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url)
const nm = (p) => new URL(`node_modules/${p}`, raiz)
const destino = (p) => new URL(`app/vendor/${p}`, raiz)
const versao = JSON.parse(readFileSync(nm('mediabunny/package.json'), 'utf8')).version

mkdirSync(destino(''), { recursive: true })
copyFileSync(nm('mediabunny/dist/bundles/mediabunny.min.mjs'), destino('mediabunny.min.mjs'))
copyFileSync(nm('mediabunny/LICENSE'), destino('LICENSE-mediabunny.txt'))
copyFileSync(nm('xxhash-wasm/esm/xxhash-wasm.js'), destino('xxhash-wasm.js'))
copyFileSync(nm('xxhash-wasm/LICENSE.md'), destino('LICENSE-xxhash-wasm.md'))
const versaoXx = JSON.parse(readFileSync(nm('xxhash-wasm/package.json'), 'utf8')).version
writeFileSync(
  destino('README.md'),
  `# Bibliotecas de terceiros\n\n- [Mediabunny](https://mediabunny.dev) ${versao}: MPL-2.0, licença em \`LICENSE-mediabunny.txt\`. Cópia sem\n  modificação de \`node_modules\` (\`npm run vendor\`); \`test/vendor.test.js\` confere.\n- [xxhash-wasm](https://github.com/jungomi/xxhash-wasm) ${versaoXx}: MIT, licença em \`LICENSE-xxhash-wasm.md\`. O xxh64 da\n  descarga conferida (o mesmo algoritmo e formato do SOBEDESCE).\n`,
)
console.log(`vendor: mediabunny ${versao}`)

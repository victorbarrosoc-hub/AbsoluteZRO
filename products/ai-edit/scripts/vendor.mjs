// Copia as bibliotecas de terceiros para vendor/ (o app é estático e sem build; o Electron serve vendor/ de dentro do
// pacote, então tudo funciona sem internet depois que o modelo de transcrição foi baixado uma vez):
//   Mediabunny (MPL-2.0): ler, decodificar e gravar vídeo e áudio com WebCodecs, mais o decodificador de ProRes;
//   Transformers.js (Apache-2.0) e o ONNX Runtime Web (MIT) que ele usa: o Whisper rodando na máquina (WebGPU ou CPU);
//   da Absolute ZRO: tokens (packages/ui), a fonte Figtree (OFL), o símbolo flat e o <zro-ia> (a Z).
// vendor/ não vai para o git (o .wasm do ONNX tem ~27 MB): rode depois do npm ci, como o CI faz.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url)
const nm = (p) => new URL(`node_modules/${p}`, raiz)
const destino = (p) => new URL(`vendor/${p}`, raiz)
const versao = (p) => JSON.parse(readFileSync(nm(`${p}/package.json`), 'utf8')).version

/** O pacote de ProRes importa "mediabunny"; aqui aponta para a cópia local (sem import map). */
export function prores() {
  const fonte = readFileSync(nm('@mediabunny/prores/dist/bundles/mediabunny-prores.min.mjs'), 'utf8')
  const trocado = fonte.replace(/from\s*["']mediabunny["']/g, 'from"./mediabunny.min.mjs"')
  if (trocado === fonte) throw new Error('import de "mediabunny" não encontrado no pacote de ProRes')
  return trocado
}

/** Arquivos do ONNX Runtime que o Transformers.js carrega (variante asyncify: WebGPU e CPU no mesmo .wasm). */
export const ORT = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']

const MIT = (dono) => `MIT License

Copyright (c) ${dono}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  mkdirSync(destino('ort'), { recursive: true })
  copyFileSync(nm('mediabunny/dist/bundles/mediabunny.min.mjs'), destino('mediabunny.min.mjs'))
  writeFileSync(destino('mediabunny-prores.min.mjs'), prores())
  copyFileSync(nm('@huggingface/transformers/dist/transformers.min.js'), destino('transformers.min.js'))
  for (const f of ORT) copyFileSync(nm(`onnxruntime-web/dist/${f}`), destino(`ort/${f}`))
  copyFileSync(nm('mediabunny/LICENSE'), destino('LICENSE-mediabunny.txt'))
  copyFileSync(nm('@huggingface/transformers/LICENSE'), destino('LICENSE-transformers.txt'))
  // o pacote do ONNX Runtime Web não traz o arquivo de licença; o texto MIT vai aqui, com o copyright da Microsoft
  writeFileSync(destino('LICENSE-onnxruntime.txt'), MIT('Microsoft Corporation'))
  writeFileSync(
    destino('versoes.json'),
    JSON.stringify({ mediabunny: versao('mediabunny'), '@mediabunny/prores': versao('@mediabunny/prores'), '@huggingface/transformers': versao('@huggingface/transformers'), 'onnxruntime-web': versao('onnxruntime-web') }, null, 2) + '\n',
  )
  // identidade da Absolute ZRO direto da fonte (packages/ui e a marca do HUB): trocar lá muda aqui no próximo vendor
  const repo = (p) => new URL(`../../${p}`, raiz)
  mkdirSync(destino('fontes'), { recursive: true })
  mkdirSync(destino('marca'), { recursive: true })
  copyFileSync(repo('packages/ui/src/tokens.css'), destino('zro-tokens.css'))
  for (const f of ['figtree-latin-wght-normal.woff2', 'figtree-latin-ext-wght-normal.woff2']) copyFileSync(repo(`apps/hub-desktop/desktop/paginas/fontes/${f}`), destino(`fontes/${f}`))
  for (const f of ['absolute-zro-simbolo-branco.svg', 'absolute-zro-simbolo-grafite.svg']) copyFileSync(repo(`apps/hub-web/public/brand/${f}`), destino(`marca/${f}`))
  // a Z (a IA do ecossistema): o mesmo <zro-ia> do HUB, para o app de computador (app/z.js). O site usa o de
  // absolutezro.com; a janela do app, que tem a ponte com o sistema, não roda código de fora.
  mkdirSync(destino('ia/v1'), { recursive: true })
  mkdirSync(destino('ia/z'), { recursive: true })
  copyFileSync(repo('apps/hub-web/public/ia/v1/zro-ia.js'), destino('ia/v1/zro-ia.js'))
  for (const f of ['anel.webp', 'estrela.webp']) copyFileSync(repo(`apps/hub-web/public/ia/z/${f}`), destino(`ia/z/${f}`))
  console.log('vendor/ atualizado')
}

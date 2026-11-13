// Copia as bibliotecas de terceiros de node_modules para vendor/ (versionado): o app não tem build e o navegador importa
// direto de /vendor. Mudanças, todas feitas aqui e conferidas por test/vendor.test.js:
//   - imports de pacote ("preact", "htm", "typed-cstruct") viram caminho relativo (a CSP não aceita import map inline);
//   - a linha `//# sourceMappingURL=` sai (o mapa não vai junto).
// O LibRaw não é alterado: libraw.wasm é o arquivo do pacote, separado e substituível (LGPL-2.1).
// O MediaPipe (~30 MB) não entra no git: publicar.mjs copia de node_modules no build.
// Rode depois de mudar uma versão: npm run vendor.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const NM = join(RAIZ, 'node_modules')
export const VENDOR = join(RAIZ, 'vendor')

/** Troca `from "pacote"` (com ou sem espaço, aspas simples ou duplas) pelo caminho relativo. Falha se não achar. */
const importar = (pacote, caminho) => (texto, de) => {
  const re = new RegExp(`(from\\s*)(["'])${pacote.replace(/[/\\^$*+?.()|[\]{}-]/g, '\\$&')}\\2`, 'g')
  const novo = texto.replace(re, `$1$2${caminho}$2`)
  if (novo === texto) throw new Error(`import de "${pacote}" não encontrado em ${de}`)
  return novo
}
const semMapa = (texto) => texto.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n')

/** Os .js de typed-cstruct/dist (sem os .d.ts), em ordem estável. */
function arquivosJs(pasta, base = '') {
  const lista = []
  for (const e of readdirSync(join(pasta, base), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) lista.push(...arquivosJs(pasta, rel))
    else if (e.name.endsWith('.js')) lista.push(rel)
  }
  return lista
}

const LIBRAW = '@colorhythm/libraw-wasm'

/** Cada arquivo de vendor/: de onde vem e o que muda no caminho (`mudar`: lista de funções texto → texto). */
export function itens() {
  const cstruct = importar('typed-cstruct', '../typed-cstruct/index.js')
  return [
    // LibRaw em WebAssembly (invólucro MIT; LibRaw LGPL-2.1 ou CDDL-1.0)
    { de: `${LIBRAW}/dist/index.js`, para: 'libraw/index.js', mudar: [cstruct] },
    { de: `${LIBRAW}/dist/libraw-types.js`, para: 'libraw/libraw-types.js', mudar: [cstruct] },
    { de: `${LIBRAW}/dist/libraw.mjs`, para: 'libraw/libraw.mjs' },
    { de: `${LIBRAW}/dist/libraw.wasm`, para: 'libraw/libraw.wasm' },
    { de: `${LIBRAW}/LICENSE`, para: 'libraw/LICENSE-libraw-wasm.txt' },
    { de: `${LIBRAW}/LibRaw/COPYRIGHT`, para: 'libraw/LibRaw/COPYRIGHT' },
    { de: `${LIBRAW}/LibRaw/LICENSE.LGPL`, para: 'libraw/LibRaw/LICENSE.LGPL' },
    { de: `${LIBRAW}/LibRaw/LICENSE.CDDL`, para: 'libraw/LibRaw/LICENSE.CDDL' },
    // typed-cstruct (dependência do invólucro)
    ...arquivosJs(join(NM, 'typed-cstruct/dist')).map((f) => ({ de: `typed-cstruct/dist/${f}`, para: `typed-cstruct/${f}` })),
    { de: 'typed-cstruct/LICENSE', para: 'typed-cstruct/LICENSE' },
    // Preact e hooks
    { de: 'preact/dist/preact.mjs', para: 'preact/preact.mjs', mudar: [semMapa] },
    { de: 'preact/hooks/dist/hooks.mjs', para: 'preact/hooks.mjs', mudar: [importar('preact', './preact.mjs'), semMapa] },
    { de: 'preact/LICENSE', para: 'preact/LICENSE' },
    // htm e a ponte com o Preact
    { de: 'htm/dist/htm.mjs', para: 'htm/htm.mjs', mudar: [semMapa] },
    { de: 'htm/preact/index.mjs', para: 'htm/preact.mjs', mudar: [importar('preact', '../preact/preact.mjs'), importar('htm', './htm.mjs'), semMapa] },
    { de: 'htm/LICENSE', para: 'htm/LICENSE' },
  ]
}

/** O conteúdo que vai para vendor/ (Buffer), já com as trocas. */
export function conteudo(item) {
  const bruto = readFileSync(join(NM, item.de))
  if (!item.mudar?.length) return bruto
  return Buffer.from(item.mudar.reduce((t, f) => f(t, item.de), bruto.toString('utf8')))
}

export const versao = (pacote) => JSON.parse(readFileSync(join(NM, pacote, 'package.json'), 'utf8')).version
const sha256 = (b) => createHash('sha256').update(b).digest('hex')

/** A versão do LibRaw compilado no .wasm (pergunta ao próprio binário). */
export async function versaoDoLibRaw() {
  const { LibRaw } = await import(new URL(`../node_modules/${LIBRAW}/dist/index.js`, import.meta.url).href)
  const lr = new LibRaw()
  await lr.waitUntilReady()
  return String(LibRaw.version())
}

/** O vendor/README.md, gerado. Sem nome de produto: esta pasta vai para o site estático. */
export async function leiame() {
  const libraw = await versaoDoLibRaw()
  const wasm = readFileSync(join(NM, LIBRAW, 'dist/libraw.wasm'))
  return `# Bibliotecas de terceiros

Cópias de \`node_modules\` feitas por \`npm run vendor\` (\`scripts/vendor.mjs\`). Ninguém edita à mão:
\`test/vendor.test.js\` confere que cada arquivo bate com o pacote.

| Pasta | Pacote | Versão | Licença |
| --- | --- | --- | --- |
| \`libraw/\` | [@colorhythm/libraw-wasm](https://github.com/colorhythm/libraw-wasm) | ${versao(LIBRAW)} | MIT (invólucro), \`libraw/LICENSE-libraw-wasm.txt\` |
| \`libraw/libraw.wasm\` | [LibRaw](https://www.libraw.org) | ${libraw} | LGPL-2.1 (eleita) ou CDDL-1.0, \`libraw/LibRaw/\` |
| \`typed-cstruct/\` | [typed-cstruct](https://github.com/ssssota/typed-cstruct) | ${versao('typed-cstruct')} | MIT, \`typed-cstruct/LICENSE\` |
| \`preact/\` | [Preact](https://preactjs.com) (com hooks) | ${versao('preact')} | MIT, \`preact/LICENSE\` |
| \`htm/\` | [htm](https://github.com/developit/htm) | ${versao('htm')} | Apache-2.0, \`htm/LICENSE\` |

## LibRaw

- **Licença eleita:** GNU LGPL 2.1 (o LibRaw sai sob LGPL-2.1 ou CDDL-1.0, à escolha de quem distribui). Os textos estão
  em \`libraw/LibRaw/LICENSE.LGPL\` e \`libraw/LibRaw/LICENSE.CDDL\`; os avisos de direito autoral (LibRaw, dcraw, DCB e
  FBDD, X3F, Adobe DNG SDK) em \`libraw/LibRaw/COPYRIGHT\`.
- **Versão:** LibRaw ${libraw}, compilado em WebAssembly pelo pacote @colorhythm/libraw-wasm ${versao(LIBRAW)}.
  \`libraw.wasm\` tem ${wasm.length} bytes, sha256 \`${sha256(wasm)}\`.
- **Código-fonte:** https://github.com/LibRaw/LibRaw (a etiqueta da versão) e https://www.libraw.org/download. A receita
  de compilação está em https://github.com/colorhythm/libraw-wasm (\`packages/libraw.wasm\`, com o LibRaw como submódulo).
- **Sem alteração:** \`libraw.wasm\` é o arquivo do pacote, byte a byte, separado do resto e substituível por outra
  compilação do LibRaw com a mesma interface.

## O que muda nas cópias

- Imports de pacote viram caminho relativo (o site não usa import map, que pediria script inline na CSP):
  \`"typed-cstruct"\` → \`../typed-cstruct/index.js\` em \`libraw/index.js\` e \`libraw/libraw-types.js\`;
  \`"preact"\` → \`./preact.mjs\` em \`preact/hooks.mjs\`; \`"preact"\` e \`"htm"\` em \`htm/preact.mjs\`.
- A linha \`//# sourceMappingURL=\` sai de \`preact/*.mjs\` e \`htm/*.mjs\` (os mapas não são copiados).
- Os arquivos \`.d.ts\` não são copiados.

## Como importar

\`\`\`js
import { render } from '/vendor/preact/preact.mjs'
import { useState } from '/vendor/preact/hooks.mjs'
import { html } from '/vendor/htm/preact.mjs'
import { LibRaw } from '/vendor/libraw/index.js' // carrega libraw.wasm do lado dele
\`\`\`

## Fora do git

- [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) ${versao('@mediapipe/tasks-vision')}
  (Apache-2.0): \`publicar.mjs\` copia de \`node_modules\` para \`vendor/mediapipe/\` no build (cerca de 30 MB).
- Os modelos de visão (\`modelos.json\`, Apache-2.0): \`scripts/modelos.mjs\` baixa dos endereços oficiais e confere o sha256.
`
}

// ───────── ONNX Runtime Web (rosto em evento) ─────────
// 14,8 MB de WebAssembly: grande demais para o git. Como o MediaPipe, vem de node_modules (está em dependencies) e o
// build copia só os três arquivos que a busca por rosto usa (WASM de uma thread; sem WebGPU, sem WebGL), sem alteração.
// A pasta leva a versão no nome: o cache de /vendor é imutável.

export const ORT = 'onnxruntime-web'
export const ORT_VERSAO = '1.31.1'
export const PASTA_ORT = `onnxruntime-${ORT_VERSAO}`
/** Os três arquivos e o sha256 de cada um (docs/estudo/rosto-em-evento.md, D.1). */
export const DO_ORT = {
  'ort.wasm.min.mjs': 'c21d9c326d453a4a61398270c804d5979e118540597cb0c07f7b3d64e6098234',
  'ort-wasm-simd-threaded.mjs': '30ed0b5cd1182ede931fea448afb567d4dc705ec957af09f108a2be5f770dac3',
  'ort-wasm-simd-threaded.wasm': '4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d',
}
const LICENCA_ORT = `MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

/**
 * Copia o ONNX Runtime Web de node_modules para `<vendor>/onnxruntime-<versão>/` (o build). Confere a versão e o
 * sha256 de cada arquivo. Devolve a versão, ou null (com aviso) se o pacote não estiver lá: a busca por rosto fica
 * indisponível, o resto do app segue.
 */
export function copiarOrt(vendorDestino, { nm = NM, log = () => {} } = {}) {
  const pacote = join(nm, ORT)
  const faltam = Object.keys(DO_ORT).filter((f) => !existsSync(join(pacote, 'dist', f)))
  if (faltam.length || !existsSync(join(pacote, 'package.json'))) {
    log(`aviso: ${ORT} não está em node_modules; a busca por rosto fica indisponível`)
    return null
  }
  const v = JSON.parse(readFileSync(join(pacote, 'package.json'), 'utf8')).version
  if (v !== ORT_VERSAO) throw new Error(`${ORT} ${v} em node_modules; o build espera ${ORT_VERSAO}`)
  const destino = join(vendorDestino, PASTA_ORT)
  mkdirSync(destino, { recursive: true })
  for (const [f, hash] of Object.entries(DO_ORT)) {
    const bytes = readFileSync(join(pacote, 'dist', f))
    if (sha256(bytes) !== hash) throw new Error(`${ORT}/dist/${f}: sha256 não confere`)
    writeFileSync(join(destino, f), bytes)
  }
  writeFileSync(join(destino, 'LICENSE'), LICENCA_ORT)
  writeFileSync(
    join(destino, 'README.md'),
    `# ONNX Runtime Web\n\n${ORT} ${v}, MIT (\`LICENSE\`). Cópia de \`node_modules\` feita no build, sem alteração: ${Object.keys(DO_ORT)
      .map((f) => `\`${f}\``)
      .join(', ')}.\n`,
  )
  return v
}

/** Refaz vendor/ do zero. */
export async function vendorizar() {
  rmSync(VENDOR, { recursive: true, force: true })
  for (const i of itens()) {
    const alvo = join(VENDOR, i.para)
    mkdirSync(dirname(alvo), { recursive: true })
    writeFileSync(alvo, conteudo(i))
  }
  writeFileSync(join(VENDOR, 'README.md'), await leiame())
  return itens().length + 1
}

/** Todos os arquivos de vendor/ (caminho relativo, com barra), em ordem. */
export function arquivosDoVendor(base = '') {
  if (!existsSync(VENDOR)) return []
  const lista = []
  for (const e of readdirSync(join(VENDOR, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) lista.push(...arquivosDoVendor(rel))
    else lista.push(rel)
  }
  return lista.sort()
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  console.log(`vendor/ atualizado: ${await vendorizar()} arquivos`)
}

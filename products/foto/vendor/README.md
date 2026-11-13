# Bibliotecas de terceiros

Cópias de `node_modules` feitas por `npm run vendor` (`scripts/vendor.mjs`). Ninguém edita à mão:
`test/vendor.test.js` confere que cada arquivo bate com o pacote.

| Pasta | Pacote | Versão | Licença |
| --- | --- | --- | --- |
| `libraw/` | [@colorhythm/libraw-wasm](https://github.com/colorhythm/libraw-wasm) | 1.1.1 | MIT (invólucro), `libraw/LICENSE-libraw-wasm.txt` |
| `libraw/libraw.wasm` | [LibRaw](https://www.libraw.org) | 0.22.1-Release | LGPL-2.1 (eleita) ou CDDL-1.0, `libraw/LibRaw/` |
| `typed-cstruct/` | [typed-cstruct](https://github.com/ssssota/typed-cstruct) | 0.10.2 | MIT, `typed-cstruct/LICENSE` |
| `preact/` | [Preact](https://preactjs.com) (com hooks) | 10.27.2 | MIT, `preact/LICENSE` |
| `htm/` | [htm](https://github.com/developit/htm) | 3.1.1 | Apache-2.0, `htm/LICENSE` |

## LibRaw

- **Licença eleita:** GNU LGPL 2.1 (o LibRaw sai sob LGPL-2.1 ou CDDL-1.0, à escolha de quem distribui). Os textos estão
  em `libraw/LibRaw/LICENSE.LGPL` e `libraw/LibRaw/LICENSE.CDDL`; os avisos de direito autoral (LibRaw, dcraw, DCB e
  FBDD, X3F, Adobe DNG SDK) em `libraw/LibRaw/COPYRIGHT`.
- **Versão:** LibRaw 0.22.1-Release, compilado em WebAssembly pelo pacote @colorhythm/libraw-wasm 1.1.1.
  `libraw.wasm` tem 853083 bytes, sha256 `c4cb97a7e4372da41a1ff6ec6e1146f38deb125b733b8bbb2e9c52727953aba8`.
- **Código-fonte:** https://github.com/LibRaw/LibRaw (a etiqueta da versão) e https://www.libraw.org/download. A receita
  de compilação está em https://github.com/colorhythm/libraw-wasm (`packages/libraw.wasm`, com o LibRaw como submódulo).
- **Sem alteração:** `libraw.wasm` é o arquivo do pacote, byte a byte, separado do resto e substituível por outra
  compilação do LibRaw com a mesma interface.

## O que muda nas cópias

- Imports de pacote viram caminho relativo (o site não usa import map, que pediria script inline na CSP):
  `"typed-cstruct"` → `../typed-cstruct/index.js` em `libraw/index.js` e `libraw/libraw-types.js`;
  `"preact"` → `./preact.mjs` em `preact/hooks.mjs`; `"preact"` e `"htm"` em `htm/preact.mjs`.
- A linha `//# sourceMappingURL=` sai de `preact/*.mjs` e `htm/*.mjs` (os mapas não são copiados).
- Os arquivos `.d.ts` não são copiados.

## Como importar

```js
import { render } from '/vendor/preact/preact.mjs'
import { useState } from '/vendor/preact/hooks.mjs'
import { html } from '/vendor/htm/preact.mjs'
import { LibRaw } from '/vendor/libraw/index.js' // carrega libraw.wasm do lado dele
```

## Fora do git

- [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.2.3
  (Apache-2.0): `publicar.mjs` copia de `node_modules` para `vendor/mediapipe/` no build (cerca de 30 MB).
- Os modelos de visão (`modelos.json`, Apache-2.0): `scripts/modelos.mjs` baixa dos endereços oficiais e confere o sha256.

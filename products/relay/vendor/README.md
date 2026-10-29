# Bibliotecas de terceiros

- [Mediabunny](https://mediabunny.dev) 1.62.1: MPL-2.0, licença em `LICENSE-mediabunny.txt`.
- @mediabunny/prores 1.62.1: MPL-2.0.
- @mediabunny/aac-encoder 1.62.1: MPL-2.0.
- @mediabunny/mp3-encoder 1.62.1: MPL-2.0.
- O codificador de AAC é o do FFmpeg (libavcodec, LGPL 2.1) e o de MP3 é o LAME (LGPL, https://lame.sourceforge.io),
  compilados em WebAssembly dentro das extensões; o código-fonte deles está nos repositórios do Mediabunny e dos
  projetos.
- Cópias de `node_modules` feitas por `npm run vendor`. Única modificação: nas extensões, o import de
  `"mediabunny"` aponta para `./mediabunny.min.mjs`. `test/vendor.test.js` confere que as cópias batem com os pacotes.

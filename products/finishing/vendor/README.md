# Bibliotecas de terceiros

- [Mediabunny](https://mediabunny.dev) 1.62.1 e @mediabunny/prores 1.62.1 (com o
  decodificador TurboRes): MPL-2.0, licença em `LICENSE-mediabunny.txt`.
- Cópias de `node_modules` feitas por `npm run vendor`. Única modificação: em `mediabunny-prores.min.mjs`, o import
  de `"mediabunny"` aponta para `./mediabunny.min.mjs`. Um teste confere que as cópias batem com os pacotes.

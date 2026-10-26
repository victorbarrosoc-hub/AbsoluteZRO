# ADR 0017 — Marca flat: anel com centelha

Data: 26/10/2026 · Decisão do titular

## Contexto

O O da marca era um anel de luz com feixe ("diamond ring") em imagem. Em fundo claro (o tema padrão desde 25/10)
o brilho virava mancha, no cinza sumia, em tamanho pequeno perdia o desenho, e como imagem não trocava de cor.

## Decisão

- O O passa a ser um **anel com centelha de 4 pontas** centrada na borda direita, **por trás do traço**: só as pontas
  horizontais aparecem (opção C do quadro de opções, com o ajuste pedido pelo titular).
- **Flat em qualquer lugar**, uma cor só. **Na animação**, a estrela aparece com as 4 pontas e recolhe as verticais até
  a forma flat.
- As letras do wordmark são as originais, vetorizadas a partir da arte oficial (`scripts/marca/vetor`).
- Tudo passa a vir de uma geometria só: SVG mestres, `@zro/ui` (`ZroWordmark`, `ZroSymbol`) e o gerador de ícones.

## Consequências

- Site, HUB, login único, ícones (navegador, iPhone, manifest, Mac, Windows), OG e app de computador usam a marca nova.
- NOSSOM e SOBEDESCE trocaram o anel antigo dos botões "Entrar com Absolute ZRO" pelo símbolo flat em SVG.
- As imagens do feixe de luz (`absolute-zro-o*`, `absolute-zro-wordmark*`, `eclipse-alta`, `feixe-de-luz`,
  `paisagem-feixe`) saíram do site. O PNG original do wordmark fica só como fonte da vetorização.
- Manual: [docs/marca/README.md](../marca/README.md).

# Marca: geometria, ícones e OG

Manual de uso: [docs/marca/README.md](../../docs/marca/README.md). Marca flat aprovada em 26/10/2026
([ADR 0017](../../docs/decisions/0017-marca-flat-centelha.md)): anel com a centelha de 4 pontas por trás do traço.

- `vetor/vetorizar.py`: vetoriza as letras do wordmark original (`vetor/wordmark-original.png`) e monta o anel com a
  centelha. Gera os SVG mestres em `apps/hub-web/public/brand/absolute-zro*.svg` e `packages/ui/src/marca.ts`
  (`ZroWordmark`, `ZroSymbol`). `pip install potracer pillow numpy && python3 scripts/marca/vetor/vetorizar.py`.
- `icones.py`: desenha a marca a partir da mesma geometria e gera `out/claro` e `out/escuro` (iPhone/Safari 180, PWA
  192/512/maskable, favicon com placa escura, Mac no grid da Apple, Windows `icon.ico` com traço reforçado; abaixo de
  24 px só o anel). `python3 scripts/marca/icones.py --instalar` copia para o HUB; o app de computador lê `out/claro`
  com `cd apps/hub-desktop && npm run icons -- ../../scripts/marca/out/claro`.
- `og-claro.html` (padrão: símbolo grande à esquerda, fundo branco chapado, apps sem placa) e `og-escuro.html`: OG 1200×630. Abra no Chromium/Playwright e capture
  `apps/hub-web/app/opengraph-image.jpg` (o `twitter-image.jpg` é a mesma imagem).
- `produto-hub-claro.png` e `produto-hub-og.png`: o HUB real num MacBook e num iPhone, base do OG.

## Telas dos apps (Padrão Apple)

- `aparelhos/aparelhos-{claro,escuro}-verde.png`: MacBook + iPhone de frente com tela verde (Higgsfield).
- `aparelhos/compor.py modelo.png tela-mac.png tela-iphone.png saida.png`: troca o verde pelas capturas.
- `aparelhos/produtos.py <pasta> [app…]`: gera `public/brand/produto-<app>-{claro,escuro}.webp` a partir de capturas
  reais (1440×916 e 390×860 @2x, claro e escuro). Só alguns apps: `produtos.py <pasta> hub`.
- `aparelhos/transparente.py`: depois do `produtos.py`, tira o fundo chapado das fotos (máscara do molde: aparelhos
  opacos, sombra e reflexo meio transparentes), para não aparecer retângulo atrás do notebook em nenhum fundo.

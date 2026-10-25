# 0016 — Identidade visual da Revela

**Contexto.** A plataforma de finalização e cor ganhou nome (Revela, ADR 0015) e o titular pediu a IDV em 25/10/2026.
Até então ela aparecia em tons neutros e com iniciais, porque a regra é não inventar logo de produto sem pedido.

**Decisão (pedido do titular; desenho feito aqui).** Três rodadas no mesmo dia: "sala escura" (quadro revelado sob a
luz de segurança); depois, a pedido do titular, cores "na pegada da Kodak, colorido" com três símbolos estudados (slide,
perfurado, emulsão); o titular escolheu o **perfurado** e pediu **roxo** nas cores.

- **Conceito:** a película. Quadro de filme perfurado no amarelo das caixas de filme; dentro, a imagem se revela na
  diagonal, do latente (grafite) ao colorido. A linha clara é o instante da revelação, e o corte é o antes e depois da
  ferramenta.
- **Símbolo:** `products/finishing/marca/revela-icone.svg` (azulejo grafite da família; cópia em
  `apps/hub-web/public/products/finishing.svg`), versão plana (revelado em faixas chapadas, furos vazados) e de uma
  cor. Alternativas (slide, emulsão, sala escura) em `marca/alternativas`.
- **Cores:** amarelo filme `#FFB800` (`--p-finishing`), roxo `#8B3FE8` (`--p-finishing-2`), roxo profundo `#4B1FB8`,
  vermelho `#E52B1A`, laranja `#FF7A1A`, papel `#FFF4E0`, banho `#0E0E10`. Gradiente da revelação sempre do roxo
  (embaixo, à esquerda) ao amarelo (em cima, à direita). Cor em ícone, brilho, ilustração e detalhe; texto pequeno
  neutro.
- **Inspiração só de cor:** nada de nome, logotipo ou desenho de marcas de filme (Kodak, Fuji etc.).
- **Tipografia e nome:** Inter, como a família. Nome em Inter 750, espaçamento −0,045em, nunca em caixa alta e nunca
  redesenhado. Assinatura "An Absolute ZRO Company".
- **Guia:** `products/finishing/marca/index.html`.

**Consequências.** O HUB mostra o ícone da Revela no catálogo e usa as cores dela nos brilhos dos cartões. A tela da
Revela usa favicon, assinatura, brilho amarelo e roxo e controles em amarelo; botão principal continua branco em
pílula, como a família. AI Edit segue sem marca.

**Como reverter.** Voltar `--p-finishing` para os neutros, tirar `finishing` do `ProductMark` e o ícone da pasta pública.

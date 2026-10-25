# 0016 — Identidade visual da Revela

**Contexto.** A plataforma de finalização e cor ganhou nome (Revela, ADR 0015) e o titular pediu a IDV em 25/10/2026.
Até então ela aparecia em tons neutros e com iniciais, porque a regra é não inventar logo de produto sem pedido.

**Decisão (pedido do titular; desenho feito aqui).** Primeira versão: "sala escura" (quadro revelado sob a luz de
segurança). Revisada no mesmo dia a pedido do titular: "na pegada das cores da Kodak, colorido" e um símbolo mais legal.

- **Conceito:** o slide. A cor de um filme se conferia projetando o diapositivo: moldura no amarelo das caixas de filme,
  a imagem revelada na janela e o ponto vermelho de orientação do projecionista no canto. Na janela, um pôr do sol em
  laranja e verde-mar (a dupla clássica do color grading).
- **Símbolo:** a moldura é o ícone (`products/finishing/marca/revela-icone.svg`, cópia em
  `apps/hub-web/public/products/finishing.svg`); versão plana e de uma cor. Alternativas estudadas (perfurado, emulsão,
  sala escura) em `marca/alternativas`.
- **Cores:** amarelo filme `#FFB800` (`--p-finishing`), vermelho `#E52B1A` (`--p-finishing-2`), pôr do sol `#FF7A1A`,
  verde-mar `#0E8F8C`, sol `#FFE07A`, papel `#FFF4E0`, banho `#0E0E10`. Cor em ícone, brilho, ilustração e detalhe;
  texto pequeno fica neutro.
- **Inspiração só de cor:** nada de nome, logotipo ou desenho de marcas de filme (Kodak, Fuji etc.).
- **Tipografia e nome:** Inter, como a família. Nome em Inter 750, espaçamento −0,045em, nunca em caixa alta e nunca
  redesenhado. Assinatura "An Absolute ZRO Company".
- **Guia:** `products/finishing/marca/index.html`.

**Consequências.** O HUB mostra o ícone da Revela no catálogo e usa as cores dela nos brilhos dos cartões. A tela da
Revela usa favicon, assinatura, brilho amarelo e laranja e controles em amarelo; botão principal continua branco em
pílula, como a família. AI Edit segue sem marca.

**Como reverter.** Voltar `--p-finishing` para os neutros, tirar `finishing` do `ProductMark` e o ícone da pasta pública.

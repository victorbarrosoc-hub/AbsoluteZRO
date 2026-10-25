# 0016 — Identidade visual da Revela

**Contexto.** A plataforma de finalização e cor ganhou nome (Revela, ADR 0015) e o titular pediu a IDV em 25/10/2026.
Até então ela aparecia em tons neutros e com iniciais, porque a regra é não inventar logo de produto sem pedido.

**Decisão (proposta pelo titular, desenho feito aqui).**

- **Conceito:** a sala escura. Sob a luz de segurança a imagem sai do escuro; um lado do quadro latente, o outro
  revelado. É o antes e depois da própria ferramenta.
- **Símbolo:** quadro de filme (16:10, cantos arredondados) cortado na diagonal; à direita o revelado em gradiente
  revelador → luz de segurança → âmbar → papel, à esquerda o latente em grafite; linha clara no corte. Ícone de app no
  mesmo azulejo grafite da família (`products/finishing/marca/revela-icone.svg`, cópia em
  `apps/hub-web/public/products/finishing.svg`), símbolo solto e versão de uma cor.
- **Cores:** luz de segurança `#FF5A36` (`--p-finishing`), âmbar `#FFB547` (`--p-finishing-2`), papel `#FFF1DC`,
  revelador `#C8321C`, banho `#0E0E10` (preto fosco da família). Só em ícone, brilho e detalhe; nunca texto pequeno.
- **Tipografia e nome:** Inter, como a família. Nome em Inter 750, espaçamento −0,045em, nunca em caixa alta e nunca
  redesenhado. Assinatura "An Absolute ZRO Company".
- **Guia:** `products/finishing/marca/index.html` (conceito, versões, cores, uso).

**Consequências.** O HUB mostra o ícone da Revela no catálogo e usa as cores dela nos brilhos dos cartões. A tela da
Revela usa favicon, assinatura, brilho de luz de segurança e controles em âmbar; botão principal continua branco em
pílula, como a família. AI Edit segue sem marca.

**Como reverter.** Voltar `--p-finishing` para os neutros, tirar `finishing` do `ProductMark` e o ícone da pasta pública.

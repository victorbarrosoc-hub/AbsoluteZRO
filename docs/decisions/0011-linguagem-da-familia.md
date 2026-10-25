# 0011 — Interface na linguagem das ferramentas da família

**Contexto.** O titular achou o visual da primeira versão fraco e pediu um HUB no espírito de uma suíte (como a Adobe
com as suas ferramentas), seguindo o visual, o motion e a UX de SOBEDESCE, NOSSOM, Synquei, TPeasy e Carro do Freela.
Pediu também preto fosco em vez de preto puro.

**Análise das origens (cópias em `products/`, só leitura).**

- Synquei e TPeasy: Inter/SF em bold com tracking fechado, títulos grandes e curtos, superfícies grafite (#1c1c1e),
  linhas finas, pílulas (branca sólida + escura com contorno), palco com brilho azul/lavanda e demo viva do produto,
  mola `cubic-bezier(.32,.72,0,1)`. O app do Synquei tem a casca de referência: sidebar com "Novo projeto",
  saudação, atalhos em blocos e cartão do plano no rodapé.
- NOSSOM: vidro líquido (aro em gradiente, brilho especular) e navegação flutuante em cápsula.
- SOBEDESCE: duas barras sobe/desce em azul→violeta. Carro do Freela: magenta sobre escuro quente.

**Decisão.**

- Tokens: preto fosco (`#0e0e10` + grão SVG fixo de 4,5%), Inter para títulos e texto, raio 16/24/32, pílulas,
  cor de cada marca em `--p-<produto>` (só em ícones e brilhos, nunca em texto pequeno). AI Edit e Finishing ficam em
  tons neutros: não têm marca ainda.
- Casca: sidebar com ícones de linha, "Novo projeto" no topo, organização e perfil no rodapé; topbar fina em vidro.
- Início como suíte: saudação, palco "continue de onde parou" com as ferramentas orbitando o O, atalhos, números,
  listas e grade "Seus apps" com a ação real de cada app (abrir, contratar, em breve).
- Landing: cápsula de vidro, hero com palco de exemplo (rotulado "Exemplo") e capítulos por produto com demos em CSS.
- Marca: versões com transparência derivadas da arte oficial (`*-alpha.webp`), sem redesenhar nada.

**Tema claro.** Papel fosco (`#f4f4f6`), superfícies brancas e marca em tinta (`absolute-zro-wordmark-ink.webp`,
derivada da arte oficial com o anel azul preservado). Palcos (demos, hero da suíte, Ciclo do O, faixa com foto)
ficam escuros nos dois temas pela classe `.on-dark`, como nas páginas claras do Synquei e do TPeasy. No login claro, a
foto do eclipse vira um anel de luz em CSS. Seletor claro/escuro em todas as telas (`ThemeToggle`): troca na hora,
sem recarregar, grava o cookie `zro_theme`; sem escolha salva, segue o sistema antes da primeira pintura; sem
JavaScript, o mesmo formulário grava pelo servidor.

**Movimento.** Só `transform`/`opacity` em CSS. `MotionGate` pausa as animações fora da tela e com a aba oculta;
"reduzir movimento" desliga tudo. Nenhuma renderização React por frame.

**Consequências.** Montserrat e Instrument Serif saíram da interface (a marca continua na imagem oficial). Testes E2E
com axe (WCAG 2.1 A/AA) seguem verdes.

**Como reverter.** `packages/ui/src/tokens.css`, `components.css` e `apps/hub-web/app/globals.css` concentram a
linguagem; o histórico do git tem a versão anterior.

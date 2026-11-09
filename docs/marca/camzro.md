# CAMZRO — marca

Aprovada pelo titular em 09/11/2026 (pedido "Crie a logo da CAMZRO"; entre três estudos, escolheu o **Obturador 180°**).

- **Símbolo**: o anel e a centelha da Absolute ZRO com meio disco dentro: o obturador em 180°, meio fechado, meio
  aberto. A luz entra pela metade aberta. A centelha fica atrás do anel, só com as pontas horizontais (a forma flat do
  manual).
- **Abaixo de 20 px** (favicon): só o anel, mais grosso, e o meio disco; a centelha some.
- **Cor**: uma só (grafite `#1d1d1f` no claro, branco no escuro). Sem degradê, brilho, sombra ou contorno.
- **Ícone do app**: a placa escura da família (`#232327` → `#0c0c0e`, canto 232 em 1024) com o símbolo branco; no
  maskable a placa vai até a borda e o símbolo cabe no círculo seguro.
- **Assinatura**: símbolo + `CAM` (Figtree Light) + `ZRO` (ExtraBold). O símbolo não troca o O do nome.
- **Em movimento** (herói da página inicial): o meio disco gira e para em 180°; a centelha entra por último, inteira
  (4 pontas), e recolhe as verticais para trás do anel. Com "reduzir movimento", o símbolo já parado.
- **Geometria só em** `products/camzro/scripts/marca.mjs`; `node scripts/marca.mjs` (na pasta do app) escreve
  `app/marca/simbolo-grafite.svg`, `simbolo-branco.svg`, `favicon.svg`, `icone.svg` e os PNG 180/192/512/maskable. A
  `og.png` sai de `node scripts/telas-do-site.mjs`.
- Sem imagem gerada por IA na marca; tudo vetor no código.
- Estudos descartados: **Tally** (anel aberto com o ponto do REC), **Meia-luz** (anel metade grosso, metade fino),
  Tally com corte reto, ponto fora do anel (lembra o Instagram), ponto de REC no centro (alvo), lente com arco externo,
  obturador inclinado sem centelha, meia-luz a 45° (ícone de atualizar), claquete (lia "Ō"), parênteses "(•)" (ícone de
  ao vivo), íris de diafragma, cantos de visor.

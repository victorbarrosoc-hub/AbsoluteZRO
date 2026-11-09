# CAMZRO — marca (em estudo)

Pedido do titular em 09/11/2026: "Crie a logo da CAMZRO". **Nada aprovado ainda**: três estudos de símbolo esperam a
escolha do titular. Até lá o app e o site seguem com o símbolo Absolute ZRO e o nome `CAM` (Figtree Light) + `ZRO`
(ExtraBold).

## Os três estudos

1. **Tally** (recomendado): o anel abre onde mora a centelha da Absolute ZRO e ali fica um ponto, a luz do REC. Lê como
   o C de CAM. Uma cor só na marca; o ponto fica vermelho (`#ff3b30`) só no ícone do app e gravando. Em movimento: a
   estrela de 4 pontas recolhe e vira o ponto.
2. **Obturador 180°**: o anel e a centelha da Absolute ZRO com meio disco dentro, o obturador em 180°. Abaixo de 20 px,
   só o anel e o meio disco. Em movimento: o obturador gira e para em 180°; a centelha entra por último.
3. **Meia-luz**: um anel só, metade grossa e metade fina (o C de CAM e o O de ZRO; ExtraBold × Light). Em movimento: o
   anel fino engrossa até a metade.

## Regras (valem para o que for escolhido)

- Família do símbolo Absolute ZRO ([manual](README.md)): anel, uma cor (grafite no claro, branco no escuro), sem
  degradê, brilho, sombra ou contorno. Assinatura = símbolo + `CAM`/`ZRO`; o símbolo não troca o O do nome.
- **Geometria só em** `products/camzro/scripts/marca.mjs` (caixa 0 0 100 100); `node scripts/marca.mjs` escreve os SVG
  de `products/camzro/marca/estudos/` (símbolo grafite e branco, forma reforçada para favicon, ícone escuro e claro).
  Nada disso é servido pelo app.
- Sem imagem gerada por IA na marca; tudo vetor no código.
- Estudos descartados: Tally com corte reto, ponto fora do anel (lembra o Instagram), ponto de REC no centro (alvo),
  lente com arco externo, obturador inclinado sem centelha, meia-luz a 45° (ícone de atualizar), claquete (lia "Ō"),
  parênteses "(•)" (ícone de ao vivo), íris de diafragma, cantos de visor.

## Depois da escolha

Gerador final (símbolo, favicon, ícones 180/192/512/maskable, assinatura com as letras em contorno), troca em
`app.html`, `site.html`, `manifest.webmanifest` e na `og.png`, e este documento passa a "aprovada".

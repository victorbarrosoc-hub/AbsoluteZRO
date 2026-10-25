#!/usr/bin/env node
/**
 * O ÍCONE DA TELA DE INÍCIO — `node src/icone.js`
 *
 * Roda só quando a marca mudar; os PNG ficam versionados em public/ e
 * o publicar.js os copia para a raiz do domínio. O iOS ignora `data:`
 * em apple-touch-icon, então aqui não tem jeito de embutir no HTML.
 *
 * Desenho (19/out, pedido do Victor: "pode se basear um pouco no ícone do
 * menu do mobile"): o DISCO DO BOTÃO MENU — anel azul e rosa, as três
 * barras e o carrinho estacionado no anel — sobre o grafite da casa, com
 * um brilho por trás. É o mesmo emblema do `src/emblema.js`, que também
 * desenha o cartão de link. É o ícone que o Safari mostra ao compartilhar
 * a página e o que fica na tela de início.
 *
 * Sem texto (ícone de 60px com palavra vira borrão) e sem canto
 * arredondado (o iOS arredonda por fora; arredondar aqui daria dois raios
 * sobrepostos). Opaco: o iOS põe PRETO atrás de PNG transparente.
 *
 * ⚠️ O MASKABLE É UM ARQUIVO PRÓPRIO, com o emblema menor. O Android
 * recorta o maskable num círculo de 80% do lado, e o carrinho mora na
 * borda do anel: no tamanho do ícone comum ele perderia a ponta.
 */
const {chromium}=require("playwright");
const fs=require("fs"),path=require("path");
const {CSS,emblema}=require("./emblema.js");
const SAIDA=path.resolve(__dirname,"..","public");

/* [arquivo, lado, fração do lado que o disco ocupa]
   ⚠️ A MARCA É MAIOR QUE NO BOTÃO (.62 do disco, contra .52): na tela de
   início o ícone tem 60px e, no tamanho do botão, as barras viravam um
   risco. Medido na prévia com o canto do iOS. */
/* ⚠️ .76 e .58 desde 19/out · 2: o carro passou a andar POR FORA do anel,
   como no botão, e precisa caber no quadrado (e, no maskable, no círculo
   de 80% que o Android recorta) com o brilho junto */
const ICONES=[
  ["apple-touch-icon.png",180,.76],
  ["icone-192.png",192,.76],
  ["icone-512.png",512,.76],
  ["icone-maskable.png",512,.58]
];
const pagina=(lado,frac)=>`<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${lado}px;height:${lado}px;overflow:hidden}
body{display:grid;place-items:center;background:#121110;
  background-image:radial-gradient(circle at 50% 46%,rgba(59,140,255,.16),rgba(176,76,255,.07) 46%,transparent 68%)}
${CSS}</style>${emblema(Math.round(lado*frac),"em-grad",.62)}`;

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  for(const [nome,lado,frac] of ICONES){
    const ctx=await b.newContext({viewport:{width:lado,height:lado},deviceScaleFactor:1});
    const p=await ctx.newPage();
    await p.setContent(pagina(lado,frac));
    await p.waitForTimeout(150);
    await p.screenshot({path:path.join(SAIDA,nome),omitBackground:false});
    const kb=(fs.statSync(path.join(SAIDA,nome)).size/1024).toFixed(1);
    console.log(nome.padEnd(24)+lado+"×"+lado+"  "+kb+" KB");
    await ctx.close();
  }
  await b.close();
})();

#!/usr/bin/env node
/**
 * O CARTÃO DO LINK — `node docs/gerar-og.cjs` → public/og.jpg (1200×630)
 *
 * É a imagem que aparece quando o endereço é colado no WhatsApp, no
 * iMessage ou compartilhado pelo Safari. O build.js aponta a tag para
 * `/og.jpg` e o publicar.js a leva para a raiz do domínio.
 *
 * Desenho (19/out): o emblema do botão Menu (`src/emblema.js`) à direita,
 * a manchete da home à esquerda com o fim no degradê da marca, a linha de
 * baixo e o endereço. Tudo derivado do que a home JÁ diz: manchete e sub
 * saem do `FASE_HERO[0]` e do `FASE_HERO[1]` do template — nenhum número,
 * nenhuma promessa que a página não faça.
 *
 * ⚠️ NADA DE DINHEIRO NA IMAGEM. O mesmo cartão serve ao produto completo
 * e à `/fase1`, que não tem sinal nem garantia: a imagem só diz o que as
 * duas fazem (achar quem está livre e chamar).
 *
 * ⚠️ O SELO "PRÉVIA" FICA. É o lugar único onde a casa se declara antes do
 * lançamento (17/out · 5), e o cartão é a primeira coisa que alguém vê.
 *
 * ⚠️ As fontes são as da casa, embutidas de `src/assets/fonts.json` — com
 * a do sistema o título sai em outra letra e ninguém percebe no terminal.
 * O script espera `document.fonts.ready` antes da foto.
 */
const {chromium}=require("playwright");
const fs=require("fs"),path=require("path");
const RAIZ=path.resolve(__dirname,"..");
const {CSS,emblema,MARCA}=require(path.join(RAIZ,"src","emblema.js"));
const fontes=JSON.parse(fs.readFileSync(path.join(RAIZ,"src","assets","fonts.json"),"utf8"));
const faces=Object.values(fontes).map(f=>`@font-face{font-family:"${f.fam}";font-weight:${f.weight};`+
  `src:url(data:font/woff2;base64,${f.b64}) format("woff2")}`).join("\n");

const W=1200,H=630;
const html=`<!doctype html><meta charset="utf-8"><style>
${faces}
${CSS}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{position:relative;background:#121110;color:#E9EEF0;font-family:"Schibsted Grotesk",sans-serif;
  background-image:radial-gradient(ellipse 60% 80% at 80% 46%,rgba(59,140,255,.13),rgba(176,76,255,.06) 50%,transparent 75%)}
.marca{position:absolute;left:80px;top:62px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:30px;letter-spacing:-.025em}
.marca .em-mk{width:44px;height:44px;margin:0;filter:drop-shadow(0 0 10px rgba(23,209,232,.45))}
h1{position:absolute;left:80px;top:150px;width:660px;margin:0;font-weight:900;font-size:74px;line-height:.98;letter-spacing:-.045em}
h1 em{font-style:normal;background:linear-gradient(100deg,#17D1E8 0%,#3B8CFF 38%,#B04CFF 68%,#FF3D9A 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.sub{position:absolute;left:80px;top:410px;width:600px;margin:0;font-size:27px;line-height:1.35;color:#AEB9C0;letter-spacing:-.01em}
.pe{position:absolute;left:80px;bottom:54px;display:flex;align-items:center;gap:18px}
.dom{font-family:"Spline Sans Mono",monospace;font-size:22px;color:#8C979E}
.previa{font-size:15px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#AEB9C0;
  border:1px solid rgba(233,238,240,.16);border-radius:999px;padding:6px 14px}
.palco{position:absolute;left:780px;top:118px;width:320px;height:320px;display:grid;place-items:center}
.orbita{position:absolute;inset:-46px;border-radius:50%;border:1.5px dashed rgba(127,235,247,.18)}
.faixa{position:absolute;left:0;right:0;bottom:0;height:7px;background:linear-gradient(100deg,#17D1E8 0%,#3B8CFF 38%,#B04CFF 68%,#FF3D9A 100%)}
</style>
<div class="marca">${MARCA("og-mk")}Carro do Freela</div>
<h1>Ache freela de audiovisual <em>livre na sua data.</em></h1>
<p class="sub">A agenda do audiovisual de Natal. Veja quem está livre e chame em um toque.</p>
<div class="pe"><span class="dom">carrodofreela.com.br</span><span class="previa">Prévia</span></div>
<div class="palco"><i class="orbita"></i>${emblema(320,"og-em")}</div>
<i class="faixa"></i>`;

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
  await p.setContent(html);
  await p.evaluate(()=>document.fonts.ready);
  const familias=await p.evaluate(()=>["900 74px 'Schibsted Grotesk'","400 22px 'Spline Sans Mono'"].map(f=>document.fonts.check(f)));
  if(familias.includes(false)) throw new Error("as fontes da casa não carregaram: "+familias);
  await p.waitForTimeout(150);
  const saida=path.join(RAIZ,"public","og.jpg");
  await p.screenshot({path:saida,type:"jpeg",quality:90});
  console.log("public/og.jpg  "+W+"×"+H+"  "+(fs.statSync(saida).size/1024).toFixed(1)+" KB");
  await b.close();
})();

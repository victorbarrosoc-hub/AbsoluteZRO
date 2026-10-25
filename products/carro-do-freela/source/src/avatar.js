#!/usr/bin/env node
/**
 * O AVATAR DO GRUPO DO WHATSAPP — `node src/avatar.js <pasta de saída>`
 *
 * Victor (19/out): "me manda uma imagem de avatar pra o grupo do WhatsApp".
 * É o emblema da casa (`src/emblema.js`) num quadrado de 2048 que o WhatsApp
 * recorta em círculo, com o disco a 68% do lado para o carro, que anda por
 * fora do anel, caber inteiro no círculo. NÃO sobe para o domínio: é
 * arquivo para ele subir no grupo, e não fica versionado (5,9 MB).
 *
 * ⚠️ "Tá em baixa, o brilho tá todo pixelado" — a primeira versão tinha dois
 * defeitos que a compressão do WhatsApp (640px, JPEG) transforma em blocos:
 *   1. o degradê roxo LARGO do fundo, quase preto, vira faixas em 8 bits —
 *      o grão não segura, o JPEG alisa o grão e as faixas voltam. Saiu: o
 *      fundo é liso e o brilho fica só em volta do anel, onde a cor muda
 *      depressa;
 *   2. `filter:blur()` e `drop-shadow` de raio grande o Chromium desenha em
 *      blocos. Os brilhos aqui são só degradê (o do carro é um disco de
 *      degradê atrás dele, na mesma órbita).
 * E ainda: renderizado a 2× e com um grão de ±2,5 níveis. Para conferir,
 * passe a saída por 640px em JPEG antes de mandar.
 */
const {chromium}=require("playwright"); const fs=require("fs"); const path=require("path");
const {CSS,emblema}=require("./emblema.js");
const L=1024, FRAC=.68, SAIDA=path.resolve(process.argv[2]||".");
fs.mkdirSync(SAIDA,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${L}px;height:${L}px;overflow:hidden;background:#121110}
.q{position:relative;width:${L}px;height:${L}px;display:grid;place-items:center;background:#121110;
}
${CSS}
/* os brilhos sem filter: o degradê já é macio, e com mais paradas */
.em-brilho{filter:none!important;
  background:radial-gradient(closest-side,rgba(23,209,232,.30),rgba(60,150,240,.22) 35%,rgba(176,76,255,.15) 62%,rgba(176,76,255,.05) 82%,transparent)!important}
.em-car{filter:drop-shadow(0 0 calc(var(--s) * .012) rgba(23,209,232,.9))!important}
.halo{position:absolute;width:calc(var(--s) * .62);height:calc(var(--s) * .62);left:50%;top:calc(var(--s) * -.06);
  margin-left:calc(var(--s) * -.31);margin-top:calc(var(--s) * -.21);border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(23,209,232,.42),rgba(23,209,232,.22) 40%,rgba(23,209,232,.07) 72%,transparent)}
</style><div class="q">${emblema(Math.round(L*FRAC),"av-grad",.62)}</div>
<script>/* o halo do carro: um disco de degradê ATRÁS dele, na mesma órbita */
const orb=document.querySelector('.em-orb'), h=document.createElement('i'); h.className='halo';
orb.insertBefore(h,orb.firstChild);</script>`;
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage({viewport:{width:L,height:L},deviceScaleFactor:2});
  await p.setContent(html); await p.waitForTimeout(300);
  const cru=await p.screenshot({type:"png"});
  /* o grão: ruído triangular de ±1,5 nível, igual nos três canais */
  const q=await b.newPage({viewport:{width:200,height:200}});
  const res=await q.evaluate(async b64=>{
    const im=new Image(); im.src="data:image/png;base64,"+b64; await im.decode();
    const c=document.createElement("canvas"); c.width=im.width; c.height=im.height;
    const x=c.getContext("2d"); x.drawImage(im,0,0);
    const d=x.getImageData(0,0,c.width,c.height), a=d.data;
    for(let i=0;i<a.length;i+=4){ const n=(Math.random()+Math.random()-1)*2.5;
      a[i]=Math.min(255,Math.max(0,a[i]+n)); a[i+1]=Math.min(255,Math.max(0,a[i+1]+n)); a[i+2]=Math.min(255,Math.max(0,a[i+2]+n)) }
    x.putImageData(d,0,0);
    const png=c.toDataURL("image/png");
    /* o que o WhatsApp faz: 640px em JPEG */
    const w=document.createElement("canvas"); w.width=640; w.height=640;
    const wx=w.getContext("2d"); wx.imageSmoothingQuality="high"; wx.drawImage(c,0,0,640,640);
    return {png, jpg:w.toDataURL("image/jpeg",.72), lado:c.width};
  },cru.toString("base64"));
  fs.writeFileSync(path.join(SAIDA,"carro-do-freela-avatar.png"),Buffer.from(res.png.split(",")[1],"base64"));
  fs.writeFileSync(path.join(SAIDA,"simula-whatsapp.jpg"),Buffer.from(res.jpg.split(",")[1],"base64"));
  console.log("lado",res.lado); await b.close();
})();

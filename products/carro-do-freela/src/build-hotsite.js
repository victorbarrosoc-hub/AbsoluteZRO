const fs=require('fs');
const D=__dirname+'/';
let tpl=fs.readFileSync(D+'hotsite.template.html','utf8');
const fontes=JSON.parse(fs.readFileSync(D+'assets/fonts3.json','utf8'));
const faces=Object.values(fontes)
  .filter(f=>!(f.fam==='Schibsted Grotesk'&&f.weight==='500'))
  .map(f=>`@font-face{font-family:"${f.fam}";font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${f.b64}) format("woff2")}`).join('\n');
tpl=tpl.replace('/*__FONTS__*/',faces);
fs.writeFileSync(D+'../docs/hotsite.html',tpl);
const n=(tpl.match(/data-cena=/g)||[]).length;
console.log('hotsite.html —',(Buffer.byteLength(tpl)/1024).toFixed(0)+'KB ·',n,'cenas');

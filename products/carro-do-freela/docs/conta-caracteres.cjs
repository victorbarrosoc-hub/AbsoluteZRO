const { chromium } = require("playwright");
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
await p.goto('file:///home/claude/repo/output/carro-do-freela/docs/dossie-edital.html');
const r=await p.evaluate(()=>[...document.querySelectorAll('.resp')].map(bl=>{
  const rot=bl.querySelector('.cap span').textContent.trim();
  const dec=bl.querySelector('.ct').textContent.trim();
  const txt=[...bl.querySelectorAll('p')].filter(x=>!x.closest('.cap'))
    .map(x=>x.textContent.trim()).join('\n\n');
  return {rot, dec, real: txt.length};
}));
r.forEach(x=>{
  const n=parseInt(x.dec.replace(/[^\d]/g,''),10);
  const ok=Math.abs(n-x.real)<=2;
  console.log((ok?'OK  ':'ERRO')+'  declarado '+String(n).padStart(5)+' | real '+String(x.real).padStart(5)+'  · '+x.rot);
});
await b.close();
})();

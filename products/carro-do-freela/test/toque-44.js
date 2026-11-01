/* TODO BOTÃO COM 44 PX DE TOQUE NO IPHONE (01/nov).
 *
 * Victor, depois de aprovar o HUB no iPhone: "pode revisar os outros apps de
 * celular?". As telas não estouravam (sem-zoom.js) e os campos já tinham 16px,
 * mas o dedo errava: .btn.sm com 35px, a barra do post com 31, o "← Voltar"
 * com 21, as setas do mês com 30, o tema com 27×24. A Apple pede 44 × 44.
 *
 * O conserto (fim da folha, `@media(pointer:coarse)`) não muda o desenho: a
 * área de toque cresce por um ::after invisível com inset negativo. Por isso a
 * conta aqui soma o que o ::after passa da caixa. Só conta o que está POR CIMA
 * (o centro do botão é dele) e fica de fora o link no meio de uma frase.
 *
 * Guarda: nas telas logadas principais, dos dois lados da conta, em 375, 393
 * e 430 (e a home deitada, 852 × 393), nenhum alvo à vista abaixo de 44 × 44
 * e a página nunca mais larga que a tela. */
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const TELAS=['home','feed','buscar','agenda','equipe','guildas','perfil','meu','propostas','jobs','cofre','planos','orcar','malas'];

const pequenos=()=>{
  const a=[];
  for(const el of document.querySelectorAll("button, a[href], select, summary, [role='tab'], [role='button']")){
    const r=el.getBoundingClientRect();
    if(r.width<=2||r.height<=2||r.bottom<=0||r.top>=innerHeight) continue;
    if(!el.checkVisibility({opacityProperty:true,visibilityProperty:true})||el.closest("[aria-hidden='true'],[inert]")) continue;
    const no=document.elementFromPoint(Math.min(innerWidth-1,r.left+r.width/2),Math.min(innerHeight-1,r.top+r.height/2));
    if(!no||!(el.contains(no)||no.contains(el))) continue;
    // o seletor dentro de um rótulo do tamanho de um dedo: tocar no rótulo já abre o seletor
    const rot=el.tagName==='SELECT'&&el.closest('label');
    if(rot){ const q=rot.getBoundingClientRect(); if(q.width>=43.5&&q.height>=43.5) continue }
    if(el.tagName==='A'&&getComputedStyle(el).display==='inline'&&[...el.parentElement.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) continue;
    let [cima,dir,baixo,esq]=[0,0,0,0];
    for(const p of ['::after','::before']){
      const cs=getComputedStyle(el,p);
      if(cs.content==='none'||cs.position!=='absolute') continue;
      cima=Math.max(cima,-parseFloat(cs.top)||0); baixo=Math.max(baixo,-parseFloat(cs.bottom)||0);
      esq=Math.max(esq,-parseFloat(cs.left)||0); dir=Math.max(dir,-parseFloat(cs.right)||0);
    }
    const w=r.width+esq+dir, h=r.height+cima+baixo;
    if(w<43.5||h<43.5) a.push((el.id?'#'+el.id:(el.className||el.tagName))+' '+Math.round(w)+'×'+Math.round(h));
  }
  return a;
};

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const errs=[];
  const entrar=async(W,H,lado)=>{
    const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:true,hasTouch:true});
    const p=await ctx.newPage();
    p.on('pageerror',e=>errs.push(W+': '+e.message));
    await p.addInitScript(()=>{ try{ localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-guia','1'); localStorage.removeItem('cdf-uso') }catch(e){} });
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
    await p.evaluate(()=>show('entrar')); await p.waitForTimeout(200);
    await p.locator('[data-lgtipo="'+lado+'"]').click(); await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
    return {ctx,p};
  };
  t(await (async()=>{ const {ctx,p}=await entrar(393,852,'freela'); const m=await p.evaluate(()=>matchMedia('(pointer:coarse)').matches); await ctx.close(); return m })(),
    'o navegador de teste se apresenta como tela de toque (senão a guarda não mediria nada)');
  for(const [W,H] of [[375,667],[393,852],[430,932]]) for(const lado of ['freela','contratante']){
    const {ctx,p}=await entrar(W,H,lado);
    const achados=[];
    for(const tela of TELAS){
      await p.evaluate(x=>{show(x);scrollTo(0,0)},tela); await p.waitForTimeout(300);
      const largo=await p.evaluate(()=>document.documentElement.scrollWidth);
      if(largo>W) achados.push(tela+': página com '+largo+'px');
      for(const x of await p.evaluate(pequenos)) achados.push(tela+': '+x);
    }
    t(achados.length===0,W+'px · '+lado+': todo alvo à vista com 44 × 44 de toque em '+TELAS.length+' telas'+(achados.length?' — '+achados.slice(0,6).join(' | '):''));
    await ctx.close();
  }
  {
    const {ctx,p}=await entrar(852,393,'contratante');
    await p.evaluate(()=>{show('home');scrollTo(0,0)}); await p.waitForTimeout(300);
    const a=await p.evaluate(pequenos);
    const largo=await p.evaluate(()=>document.documentElement.scrollWidth);
    t(a.length===0&&largo<=852,'deitado (852 × 393): a home cabe e todo alvo tem 44 × 44'+(a.length?' — '+a.slice(0,6).join(' | '):''));
    await ctx.close();
  }
  t(errs.length===0,'zero erro de página'+(errs.length?' — '+errs[0]:''));
  console.log('TOQUE 44');
  ok.forEach(x=>console.log('  ✓ '+x));
  bad.forEach(x=>console.log('  ✗ '+x));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

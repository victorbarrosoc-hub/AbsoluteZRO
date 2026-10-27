/* OS BALÕES (27/out) — o que espera uma ação da pessoa em cada aba.
 *
 * Pedido do titular para o ecossistema Absolute ZRO (o SOBEDESCE e o HUB já
 * tinham): aba com alguma coisa esperando a pessoa mostra a quantidade num
 * balão. A régua é "só conta o que a tela já pede com botão":
 *
 *   1. `contarPendencias` é PURA — estado montado à mão, número por aba;
 *   2. a lateral, a barra de baixo e a gaveta acendem e apagam AO VIVO
 *      quando o estado muda (pedido de aluguel chega e é recusado, contrato
 *      a assinar aparece e é assinado);
 *   3. o balão diz para leitor de tela "N pendências" e o item diz no title
 *      o que espera; acima de 99 vira "99+";
 *   4. lateral recolhida e celular: o balão vira o pontinho no canto do ícone.
 */
const {servir,URL}=require('./_servir.js');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const errs=[];
  const entrar=async(W,H,mob,lado)=>{
    const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:mob,hasTouch:mob});
    const p=await ctx.newPage(); await servir(p);
    p.on('pageerror',e=>errs.push(W+': '+e.message));
    p.on('console',m=>{ if(m.type()==='error'&&!/web3forms/.test(m.text())) errs.push(W+': '+m.text()) });
    await p.addInitScript(()=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1'); localStorage.setItem('cdf-guia','1');
      localStorage.removeItem('cdf-uso'); localStorage.removeItem('cdf-lado-min');
    }catch(e){} });
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
    await p.locator('[data-lgtipo="'+(lado||'freela')+'"]').click(); await p.waitForTimeout(170);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
    return {ctx,p};
  };

  /* ============ 1. a conta, pura ============ */
  const {ctx,p}=await entrar(1440,960,false);
  const puro=await p.evaluate(()=>({
    nada:contarPendencias({}),
    prop:contarPendencias({jobsNovos:2,equipRecebidas:1}),
    jobsFreela:contarPendencias({prod:false,vagas:[
      {fase:'contrato',jaAssinei:false},{fase:'contrato',jaAssinei:true},
      {fase:'conferir'},{fase:'liberado',avaliado:false},{fase:'liberado',avaliado:true},
      {fase:'ativa'},{fase:'direto'},{fase:'antigo'}]}),
    jobsProd:contarPendencias({prod:true,vagas:[{fase:'conferir'},{fase:'conferir'},{fase:'contrato',jaAssinei:false}]}),
    brecho:contarPendencias({pedidosAluguel:3}),
    n99:numeroBalao(99), n100:numeroBalao(100), r1:rotuloBalao(1), r4:rotuloBalao(4)
  }));
  t(JSON.stringify(puro.nada)==='{}','sem nada esperando, nenhum balão');
  t(puro.prop.propostas&&puro.prop.propostas.n===3&&/2 consultas de job/.test(puro.prop.propostas.t)&&/1 oferta no brechó/.test(puro.prop.propostas.t),
    'Propostas soma consulta de job e oferta no brechó (a mesma conta do "Esperando você")');
  t(puro.jobsFreela.jobs&&puro.jobsFreela.jobs.n===2,
    'Jobs do freela: contrato que falta ele assinar + avaliação por fazer (conferir é de quem contrata; ativa, direto e antigo não pedem nada) — '+JSON.stringify(puro.jobsFreela));
  t(puro.jobsProd.jobs&&puro.jobsProd.jobs.n===3&&/2 entregas para conferir/.test(puro.jobsProd.jobs.t),
    'Jobs de quem contrata: entrega para conferir conta');
  t(puro.brecho.brecho&&puro.brecho.brecho.n===3&&/pedidos de aluguel/.test(puro.brecho.brecho.t),'Brechó: pedido de aluguel numa peça minha');
  t(puro.n99==='99'&&puro.n100==='99+','acima de 99 vira 99+');
  t(puro.r1==='1 pendência'&&puro.r4==='4 pendências','rótulo de leitor de tela: "N pendências"');

  /* ============ 2. ao vivo, na lateral ============ */
  const top=await p.evaluate(()=>{ const el=document.getElementById('bg-top');
    return {vis:!el.hidden,n:el.textContent,aria:el.getAttribute('aria-label'),
      tit:document.querySelector('.tabs .tab[data-tab="propostas"]').title,esp:esperandoVoce()} });
  t(top.vis&&top.n===String(top.esp)&&top.aria===top.esp+' pendências','Propostas: o balão da lateral é o "esperando você" ('+top.n+'), com aria-label');
  t(/esperando você/.test(top.tit),'e o item diz no title o que espera: '+top.tit);

  const semBrecho=await p.evaluate(()=>!document.querySelector('.tabs .tab[data-tab="brecho"] .bg[data-balao]:not([hidden])'));
  t(semBrecho,'Brechó sem pedido: sem balão');
  await p.evaluate(()=>pedidoChegou({id:'pdT1',itemId:'x',t:'Sony FX3',quem:CREW[3].id,de:key(diasApos(2)),ate:key(diasApos(4)),dias:2,valor:400,job:''}));
  await p.waitForTimeout(150);
  const comBrecho=await p.evaluate(()=>{ const h=document.querySelector('.tabs .tab[data-tab="brecho"]'), el=h.querySelector('.bg[data-balao]');
    return el&&{vis:!el.hidden&&getComputedStyle(el).display!=='none',n:el.textContent,aria:el.getAttribute('aria-label'),tit:h.title} });
  t(comBrecho&&comBrecho.vis&&comBrecho.n==='1'&&comBrecho.aria==='1 pendência','pedido de aluguel chega: o Brechó acende na hora');
  t(comBrecho&&/1 pedido de aluguel esperando você/.test(comBrecho.tit),'e o title conta o que espera: '+(comBrecho&&comBrecho.tit));
  await p.screenshot({path:require('path').join(__dirname,'saida','baloes-lateral.png')});
  await p.evaluate(()=>recusarPedido('pdT1')); await p.waitForTimeout(120);
  const apagou=await p.evaluate(()=>{ const h=document.querySelector('.tabs .tab[data-tab="brecho"]'), el=h.querySelector('.bg[data-balao]');
    return {hid:!el||el.hidden,tit:h.getAttribute('title')} });
  t(apagou.hid,'recusou: o balão apaga');
  t(!apagou.tit||!/pedido/.test(apagou.tit),'e o title volta ao que era');

  /* Jobs: um contrato que falta o freela assinar */
  const jobs=await p.evaluate(()=>{
    const e=ESCALAS.find(j=>j.equipe.some(x=>x.quem===EU.id)), x=e.equipe.find(y=>y.quem===EU.id);
    Object.assign(x,{gar:true,sinal:Math.round(x.valor*.2),assProd:true,assFreela:false});
    drawJobs();
    const el=document.querySelector('.tabs .tab[data-tab="jobs"] .bg[data-balao]');
    const antes=el&&!el.hidden?el.textContent:'';
    x.assFreela=true; drawJobs();
    return {antes,depois:el&&!el.hidden?el.textContent:'',tit:document.querySelector('.tabs .tab[data-tab="jobs"]').title};
  });
  t(jobs.antes==='1','contrato a assinar: Jobs mostra 1');
  t(jobs.depois==='','assinou: Jobs apaga');
  t(jobs.tit==='Meus jobs','o title original do item ("Meus jobs") volta inteiro: '+jobs.tit);

  /* 99+ na tela, não só na conta */
  const muitos=await p.evaluate(()=>{ for(let i=0;i<120;i++) PEDIDOS.push({id:'m'+i,quem:CREW[1].id,t:'x',de:key(HOJE),ate:key(HOJE),dias:1,valor:1});
    pintarBaloes(); const el=document.querySelector('.tabs .tab[data-tab="brecho"] .bg[data-balao]'); const r=el.textContent;
    PEDIDOS.length=0; pintarBaloes(); return r });
  t(muitos==='99+','120 pedidos: o balão mostra 99+');

  /* ============ 3. lateral recolhida: o balão vai para o canto do ícone ============ */
  await p.evaluate(()=>{ PEDIDOS.push({id:'pdT2',quem:CREW[1].id,t:'x',de:key(HOJE),ate:key(HOJE),dias:1,valor:1}); pintarBaloes(); recolherLado(true) });
  await p.waitForTimeout(500);
  const min=await p.evaluate(()=>{ const h=document.querySelector('.tabs .tab[data-tab="brecho"]'), el=h.querySelector('.bg[data-balao]');
    const r=el.getBoundingClientRect(), rh=h.getBoundingClientRect(), cs=getComputedStyle(el);
    return {pos:cs.position,dentro:r.left>=rh.left-1&&r.right<=rh.right+1&&r.top>=rh.top-1,w:Math.round(r.width)} });
  t(min.pos==='absolute'&&min.dentro&&min.w<=22,'recolhida: o balão é o pontinho no canto do ícone, dentro do item ('+JSON.stringify(min)+')');
  await p.screenshot({path:require('path').join(__dirname,'saida','baloes-recolhida.png')});
  await p.evaluate(()=>recolherLado(false));
  await ctx.close();

  /* ============ 4. celular: a barra de baixo e a gaveta ============ */
  const m=await entrar(390,844,true);
  await m.p.evaluate(()=>{ PEDIDOS.push({id:'pdM',quem:CREW[1].id,t:'Gimbal',de:key(HOJE),ate:key(HOJE),dias:1,valor:1}); pintarBaloes() });
  await m.p.waitForTimeout(150);
  const mob=await m.p.evaluate(()=>{ const h=document.querySelector('.bottombar .bt[data-tab="brecho"]'), el=h&&h.querySelector('.bg[data-balao]');
    if(!el) return null; const r=el.getBoundingClientRect(), ic=h.querySelector('svg').getBoundingClientRect(), cs=getComputedStyle(el);
    return {vis:!el.hidden&&cs.display!=='none',pos:cs.position,canto:r.left>ic.left&&r.top<ic.top+ic.height/2,n:el.textContent,
      prop:!document.getElementById('bg-bot').hidden} });
  t(mob&&mob.vis&&mob.pos==='absolute'&&mob.canto&&mob.n==='1','celular: o Brechó da barra de baixo tem o balão no canto do ícone '+JSON.stringify(mob));
  t(mob&&mob.prop,'e Propostas continua com o dela');
  await m.p.screenshot({path:require('path').join(__dirname,'saida','baloes-celular.png')});
  await m.p.evaluate(()=>abrirGaveta()); await m.p.waitForTimeout(450);
  const gav=await m.p.evaluate(()=>{ const s=document.querySelector('#gaveta [data-sanf="brecho"] > .mn-abre .bg[data-balao]');
    return s&&{vis:!s.hidden,n:s.textContent,msg:!!document.getElementById('g-msg-bg')} });
  t(gav&&gav.vis&&gav.n==='1','a gaveta também: o grupo Brechó mostra o balão');
  t(gav&&gav.msg,'e o contador de conversa de Propostas (#g-msg-bg) continua o mesmo');
  await m.ctx.close();

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));
  console.log('BALÕES');
  ok.forEach(x=>console.log('  ✓ '+x));
  bad.forEach(x=>console.log('  ✗ '+x));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

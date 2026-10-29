/* A PÁGINA NUNCA MAIS LARGA QUE O CELULAR (17/out · 11).
 *
 * Victor, com dois prints do iPhone: "quando abre tá com zoom na tela,
 * tenho que tirar toda vez". Era a barra de cima: marca, selo Prévia, as
 * duas moedas e a chave de lado, que com o pedágio de boas-vindas (P$ 200,
 * toda conta nova ganha) passava 23px dos 430 do iPhone. Página mais larga
 * que a tela é o que o Safari abre ampliado.
 *
 * ⚠️ O PLAYWRIGHT SÓ ENXERGA ISSO COM `isMobile:true`: aí o viewport de
 * layout cresce junto com o conteúdo (innerWidth vira 453 numa tela de 430),
 * que é o mesmo que o Safari faz. Sem isMobile a página só ganharia rolagem
 * lateral e a conta pareceria certa.
 *
 * Guarda: em cinco larguras de celular, dos dois lados da conta, com as duas
 * moedas à vista — e num caso de estresse com saldo de cinco dígitos —, a
 * janela continua do tamanho do aparelho em todas as telas principais, e
 * nada da barra de cima fica cortado. O que saiu da barra (selo e chave)
 * continua alcançável no menu. */
const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const TELAS=['feed','propostas','jobs','brecho','planos','cofre','vagas','orcar'];

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const errs=[];
  const entrar=async(W,lado,stress)=>{
    const ctx=await b.newContext({viewport:{width:W,height:860},isMobile:true,hasTouch:true});
    const p=await ctx.newPage();
    p.on('pageerror',e=>errs.push(W+': '+e.message));
    await p.addInitScript(()=>{ try{ localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-guia','1'); localStorage.removeItem('cdf-uso') }catch(e){} });
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
    await p.evaluate(()=>show('entrar')); await p.waitForTimeout(200);
    await p.locator('[data-lgtipo="'+lado+'"]').click(); await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
    await p.evaluate(st=>{
      if(!pedagio()) darPedagio(200,'boas-vindas',null);
      if(st){ movAdd('venda','teste de largura',80000,0); darPedagio(1500,'teste de largura',null) }
      pintarSaldoTopo();
    },stress);
    return {ctx,p};
  };
  const mede=(p,W)=>p.evaluate(W=>{
    const pecas=[...document.querySelectorAll('.top .wrap > *, .top .acoes > *')]
      .filter(e=>e.offsetParent&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).position!=='fixed');
    return {iw:innerWidth, sw:document.documentElement.scrollWidth,
      cortado:pecas.filter(e=>e.getBoundingClientRect().right>W-4).map(e=>e.id||e.className),
      moedas:['saldo-top','pedagio-top'].every(id=>{const e=document.getElementById(id); return e&&!e.hidden&&e.offsetParent}),
      marca:(()=>{const bb=document.querySelector('.top .brand b'); return bb.scrollWidth<=bb.clientWidth+1})()};
  },W);

  for(const W of [360,375,390,414,430]) for(const lado of ['freela','contratante']){
    const {ctx,p}=await entrar(W,lado,false);
    let pior=null;
    for(const tela of TELAS){
      await p.evaluate(x=>{show(x);scrollTo(0,0)},tela); await p.waitForTimeout(220);
      const m=await mede(p,W);
      if(m.iw!==W||m.sw>W) { pior=tela+' ('+m.iw+'/'+m.sw+')'; break }
    }
    t(!pior,W+'px · '+lado+': ⟶⟶ a janela fica do tamanho do aparelho em todas as telas'+(pior?' — estourou em '+pior:''));
    const m=await mede(p,W);
    t(m.moedas,W+'px · '+lado+': as DUAS moedas continuam na barra (pedido de 20/ago)');
    t(m.cortado.length===0&&m.marca,W+'px · '+lado+': nada da barra fica cortado e a marca aparece inteira'+(m.cortado.length?' — '+m.cortado.join(','):''));
    if(W===390&&lado==='freela'){
      t(!await p.locator('.top #modo-tog').isVisible()&&!await p.locator('.top [data-previa]').count(),
        'o que saiu da barra é o que já mora no menu: a chave de lado (e o selo Prévia saiu do topo em 27/out)');
      await p.locator('#bt-menu').click(); await p.waitForTimeout(550);
      t(await p.locator('#gaveta [data-previa]').isVisible(),'o selo Prévia abre a gaveta');
      t(await p.locator('#g-ladoseg').isVisible()&&
        await p.locator('#g-ladoseg [data-glado="freela"]').getAttribute('aria-pressed')==='true',
        'e a chave de lado virou o segmentado da gaveta, marcando o lado atual');
      await p.locator('#g-ladoseg [data-glado="contratante"]').click(); await p.waitForTimeout(500);
      t(await p.evaluate(()=>MODO)==='contratante'&&!await p.locator('#gaveta').isVisible(),
        'um toque troca de lado e fecha o menu');
    }
    await ctx.close();
  }

  /* estresse: saldo de cinco dígitos e pedágio de quatro, na menor tela */
  {
    const {ctx,p}=await entrar(360,'contratante',true);
    await p.evaluate(()=>{show('feed');scrollTo(0,0)}); await p.waitForTimeout(250);
    const m=await mede(p,360);
    t(m.iw===360&&m.sw<=360,'360px com T$ de cinco dígitos e P$ de quatro: a página continua do tamanho da tela ('+m.iw+')');
    t(m.cortado.length===0,'e nada da barra é cortado mesmo assim'+(m.cortado.length?' — '+m.cortado.join(','):''));
    await ctx.close();
  }

  /* a faixa do meio (481–600) é onde o avatar e o rótulo da chave ainda
     tentavam caber: o clip esconderia o estouro, então aqui a guarda é de
     CORTE, não de largura */
  for(const W of [500,540,600]){
    const {ctx,p}=await entrar(W,'freela',false);
    await p.evaluate(()=>{show('feed');scrollTo(0,0)}); await p.waitForTimeout(250);
    const m=await mede(p,W);
    t(m.iw===W&&m.cortado.length===0&&m.moedas,W+'px: a barra cabe inteira, sem nada cortado pelo clip'+(m.cortado.length?' — '+m.cortado.join(','):''));
    await ctx.close();
  }
  /* acima de 560 (tablet em pé) a barra tem lugar: selo e chave voltam */
  {
    const {ctx,p}=await entrar(600,'freela',false);
    await p.evaluate(()=>{show('feed');scrollTo(0,0)}); await p.waitForTimeout(250);
    const m=await mede(p,600);
    t(await p.locator('.top #modo-tog').isVisible()&&m.iw===600&&m.cortado.length===0,
      'a 600px a barra tem lugar: a chave volta para ela, e tudo cabe');
    await ctx.close();
  }

  t(errs.length===0,'zero erro de página'+(errs.length?' — '+errs[0]:''));
  console.log('SEM ZOOM');
  ok.forEach(x=>console.log('  ✓ '+x));
  bad.forEach(x=>console.log('  ✗ '+x));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

const { chromium } = require('playwright');const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  const out={};
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(350);
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(500);
  out.subabas=await p.locator('#v-brecho [data-bp]').allTextContents();
  out.categorias=await p.locator('#b-catgrid .catcard').count();
  out.gridVisivel=await p.locator('#b-catgrid').isVisible();
  await p.screenshot({path:require('path').join(__dirname,'saida','z-catalogo.png'),fullPage:true});
  await p.locator('.catcard[data-cat2="lente"]').click(); await p.waitForTimeout(400);
  out.entrou=await p.locator('#b-dentro').isVisible();
  out.itensNaCat=await p.locator('#b-lista .an').count();
  await p.locator('#b-volta').click(); await p.waitForTimeout(300);
  out.voltou=await p.locator('#b-catgrid').isVisible();
  await p.locator('[data-bp="oport"]').click(); await p.waitForTimeout(450);
  out.oport=await p.locator('#bp-oport .an').count();
  out.badge=await p.locator('#bg-oport').textContent();
  out.desconto=await p.locator('#bp-oport .opb').first().textContent().catch(()=>'—');
  await p.screenshot({path:require('path').join(__dirname,'saida','z-oport.png'),fullPage:true});
  await p.locator('[data-bp="vender"]').click(); await p.waitForTimeout(450);
  out.temTb=await p.locator('#vd-ativos [data-tb]').count();
  out.antes=(await p.locator('#vd-ativos .msg').last().textContent()).slice(0,88);
  await p.locator('#vd-ativos [data-tb]').first().click(); await p.waitForTimeout(500);
  out.depois=(await p.locator('#vd-ativos .msg').last().textContent()).slice(0,88);
  out.turbo=await p.evaluate(()=>meusAn().some(a=>a.turbo));
  const alvo=await p.evaluate(()=>{const a=meusAn().find(x=>x.turbo);return a?{cat:a.cat,id:a.id,preco:a.preco}:null});
  out.alvo=alvo;
  out.taxaTurbo=await p.evaluate(()=>{const a=meusAn().find(x=>x.turbo);return {c:taxaVenda(a.preco,a),s:taxaVenda(a.preco)}});
  await p.locator('[data-bp="comprar"]').click(); await p.waitForTimeout(300);
  await p.locator('.catcard[data-cat2="'+alvo.cat+'"]').click(); await p.waitForTimeout(400);
  out.noTopo=await p.locator('#b-lista .an').first().evaluate(e=>e.className.includes('turbo'));
  await p.screenshot({path:require('path').join(__dirname,'saida','z-turbo.png'),fullPage:true});
  out.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  const m=await b.newPage({viewport:{width:390,height:844}});
  const errsM=[];m.on('pageerror',e=>errsM.push('ERR: '+e.message));
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await m.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await m.goto(URL,{waitUntil:'networkidle'});
  await m.locator('.homenav .entrar-cta').click(); await m.waitForTimeout(200);
  await m.locator('[data-login="Google"]').click(); await m.waitForTimeout(350);
  await m.locator('.bt[data-tab="brecho"]').click(); await m.waitForTimeout(450);
  await m.screenshot({path:require('path').join(__dirname,'saida','z-mob-cat.png')});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();

const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
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

  /* --- caixa única --- */
  await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(400);
  out.subabas=await p.locator('#v-propostas [data-pp]').count();
  out.badgeReceb=await p.locator('#bg-receb').textContent();
  out.equipRecebidas=await p.locator('#pp-equip .vitem').count();
  out.jobsRecebidos=await p.locator('#pp-lista .prop').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','w-receb.png'),fullPage:true});

  /* contraproposta com tela */
  await p.locator('#pp-equip [data-ect]').first().click(); await p.waitForTimeout(400);
  out.modalContra=await p.locator('#ct-sub').textContent();
  out.difInicial=await p.locator('#ct-dif').textContent();
  await p.locator('#ct-valor').fill('50'); await p.waitForTimeout(200);
  out.difBaixo=await p.locator('#ct-dif').textContent();
  await p.locator('#ct-valor').fill('11400'); await p.waitForTimeout(200);
  await p.screenshot({path:require('path').join(__dirname,'saida','w-contra.png')});
  await p.locator('#ct-ok').click(); await p.waitForTimeout(400);
  out.confirmContra=(await p.locator('#ct-txt').textContent()).slice(0,80);
  await p.locator('#ct-f').click(); await p.waitForTimeout(350);

  /* --- comprar, receber contraproposta e responder --- */
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(400);
  await p.evaluate(()=>{const a=ANUNCIOS.find(x=>x.dono!==EU.id&&x.estadoVenda==="disponivel"&&x.gar);abrirAnuncio(a.id)});
  await p.waitForTimeout(400);
  await p.locator('#a-propor').click(); await p.waitForTimeout(350);
  await p.locator('#pr-ok').click(); await p.waitForTimeout(400);
  await p.locator('#pr-f').click(); await p.waitForTimeout(300);
  await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(350);
  await p.locator('[data-pp="env"]').click(); await p.waitForTimeout(400);
  out.enviadas=await p.locator('#pp-enviadas .vitem').count();
  out.textoEnviada=(await p.locator('#pp-enviadas .msg').first().textContent()).slice(0,60);
  await p.screenshot({path:require('path').join(__dirname,'saida','w-enviadas.png'),fullPage:true});
  /* o vendedor contrapropõe e eu respondo */
  await p.evaluate(()=>{
    const x=equipEnviadas()[0];
    x.p.estado="contra"; x.p.contra=Math.round(x.p.valor*1.06);
    drawPropostas();
  });
  await p.waitForTimeout(350);
  out.temAceitarContra=await p.locator('#pp-enviadas [data-eca]').count();
  out.badgeEnv=await p.locator('#bg-env').textContent();
  await p.locator('#pp-enviadas [data-eca]').first().click(); await p.waitForTimeout(400);
  out.aposAceitarContra=await p.evaluate(()=>{
    const a=ANUNCIOS.find(x=>x.compradorId===EU.id&&x.dono!==EU.id);
    return a?a.estadoVenda+" @ "+a.fechado:"nada";
  });

  /* --- entrega + entra no equipamento --- */
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(400);
  const comprado=await p.evaluate(()=>{
    const a=ANUNCIOS.find(x=>x.compradorId===EU.id&&x.dono!==EU.id&&x.estadoVenda==="reservado");
    if(a){a.entregaEscolhida="Envio por transportadora (por minha conta)";abrirAnuncio(a.id)}
    return a?{id:a.id,cat:a.cat,t:a.t}:null;
  });
  await p.waitForTimeout(400);
  out.temBotaoRecebi=await p.locator('#a-recebi').count();
  out.textoComprador=(await p.locator('#a-acoes').textContent()).slice(0,90);
  await p.locator('#a-recebi').click(); await p.waitForTimeout(500);
  out.comprados=await p.evaluate(()=>COMPRADOS.map(x=>x.t+" ("+x.cat+")"));

  await p.evaluate(()=>{abrirPerfil(EU.id);S.ptab="equip";drawPtabs()});
  await p.waitForTimeout(400);
  out.blocoCompradosVisivel=await p.locator('#p-comp-blk').isVisible();
  out.itensNoPerfil=await p.locator('#p-comp .fl').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','w-perfil-equip.png'),fullPage:true});

  out.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  /* produtora também vê a caixa */
  await p.evaluate(()=>{MODO="produtora";aplicarModo();show("propostas");drawPropostas()});
  await p.waitForTimeout(400);
  out.prodVeCaixa=await p.locator('.tab[data-tab="propostas"]').isVisible();
  out.prodVeJobs=await p.locator('#pp-lista').isVisible();

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
  await m.locator('.bt[data-tab="propostas"]').click(); await m.waitForTimeout(400);
  await m.screenshot({path:require('path').join(__dirname,'saida','w-mob-receb.png')});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();

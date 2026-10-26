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
  await p.evaluate(()=>{LG_TIPO="contratante";pintarLogin()});
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(350);
  /* a conta de contratante é paga: fecha a assinatura para seguir */
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350); await p.locator('#as-f').click(); await p.waitForTimeout(300);

  await p.evaluate(()=>show("equipe")); await p.waitForTimeout(400);
  out.botaoVazio=await p.locator('#e-fechar').textContent();
  out.desabilitado=await p.locator('#e-fechar').isDisabled();

  /* monta uma escala de 3 pessoas */
  await p.locator('#e-add [data-f]').first().click(); await p.waitForTimeout(200);
  await p.locator('#e-add [data-f]').nth(1).click(); await p.waitForTimeout(200);
  await p.locator('#e-add [data-f]').nth(2).click(); await p.waitForTimeout(250);
  const sels=await p.locator('#e-vagas [data-sel]').count();
  for(let i=0;i<sels;i++){
    const op=await p.locator('#e-vagas [data-sel]').nth(i).locator('option').nth(1).getAttribute('value');
    if(op) await p.locator('#e-vagas [data-sel]').nth(i).selectOption(op);
    await p.waitForTimeout(150);
  }
  out.botaoCheio=await p.locator('#e-fechar').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','f-equipe.png'),fullPage:true});

  const saldoAntes=await p.evaluate(()=>saldo());
  const custAntes=await p.evaluate(()=>pagoRetido());
  await p.locator('#e-fechar').click(); await p.waitForTimeout(400);
  out.linhas=await p.locator('#fe-lista .mov').count();
  out.diarias=await p.locator('#fe-diarias').textContent();
  out.taxa=await p.locator('#fe-taxa').textContent();
  out.totalSemSaldo=await p.locator('#fe-tot').textContent();
  out.metodos=await p.evaluate(()=>[...document.querySelectorAll('#fe-pgm [data-m]')].map(b=>b.dataset.m));
  out.usarTxt=await p.locator('#fe-pgm [data-m="saldo"] small').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','f-modal.png')});
  await p.locator('#fe-pgm [data-m="saldo"]').click(); await p.waitForTimeout(250);
  out.totalComSaldo=await p.locator('#fe-tot').textContent();
  out.linhaSaldo=await p.locator('#fe-saldo').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','f-modal-saldo.png')});
  await p.locator('#fe-ok').click(); await p.waitForTimeout(450);
  out.confirmacao=(await p.locator('#fe-txt').textContent()).slice(0,120);
  await p.locator('#fe-f').click(); await p.waitForTimeout(350);

  out.gastouSaldo=saldoAntes-(await p.evaluate(()=>saldo()));
  out.custodiaSubiu=(await p.evaluate(()=>pagoRetido()))-custAntes;
  out.pagosTotal=await p.evaluate(()=>PAGOS.length);

  /* o espelho da produtora reflete */
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(400);
  await p.locator('[data-bp="vender"]').click(); await p.waitForTimeout(450);
  out.espelho=await p.evaluate(()=>[...document.querySelectorAll('#vd-pagos .fato')].map(f=>f.querySelector('.lab').textContent+': '+f.querySelector('b').textContent));
  out.movimentos=await p.locator('#vd-pagos .mov').count();
  out.extrato=await p.evaluate(()=>CARTEIRA.mov.map(m=>m.tipo));
  await p.screenshot({path:require('path').join(__dirname,'saida','f-espelho.png'),fullPage:true});

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
  await m.locator('[data-lgtipo="contratante"]').click(); await m.waitForTimeout(150);
  await m.locator('[data-login="Google"]').click(); await m.waitForTimeout(350);
  /* a conta de contratante é paga: fecha a assinatura para seguir */
  await m.evaluate(()=>abrirAssinatura()); await m.waitForTimeout(250);
  await m.locator('#as-ok').click(); await m.waitForTimeout(350); await m.locator('#as-f').click(); await m.waitForTimeout(300);
  await m.evaluate(()=>show("equipe")); await m.waitForTimeout(350);
  await m.locator('#e-add [data-f]').first().click(); await m.waitForTimeout(250);
  const op=await m.locator('#e-vagas [data-sel]').first().locator('option').nth(1).getAttribute('value');
  if(op) await m.locator('#e-vagas [data-sel]').first().selectOption(op);
  await m.waitForTimeout(250);
  await m.locator('#e-fechar').click(); await m.waitForTimeout(400);
  await m.screenshot({path:require('path').join(__dirname,'saida','f-mob-modal.png')});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();

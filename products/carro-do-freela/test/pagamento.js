const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
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
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(350);
  /* a conta de contratante é paga: fecha a assinatura para seguir */
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350); await p.locator('#as-f').click(); await p.waitForTimeout(300);

  /* ---- compra de equipamento ---- */
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(400);
  await p.evaluate(()=>{const a=ANUNCIOS.find(x=>x.dono!==EU.id&&x.estadoVenda==="disponivel"&&x.gar);abrirAnuncio(a.id)});
  await p.waitForTimeout(400);
  await p.locator('#a-comprar').click(); await p.waitForTimeout(400);
  out.metodos=await p.evaluate(()=>[...document.querySelectorAll('#cp-pgm [data-m]')].map(b=>b.dataset.m));
  out.pixVisivelPorPadrao=await p.locator('#cp-pgm .pixbox').count();
  out.totalInicial=await p.locator('#cp-tot').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','p-compra-pix.png')});
  await p.locator('#cp-pgm [data-m="cartao"]').click(); await p.waitForTimeout(250);
  out.aposCartao=await p.evaluate(()=>({pix:document.querySelectorAll('#cp-pgm .pixbox').length,
    cartaoOn:document.querySelector('#cp-pgm [data-m="cartao"]').getAttribute('aria-pressed')}));
  out.avisoCartao=await p.locator('#cp-pgm [data-m="cartao"] small').textContent();
  await p.locator('#cp-pgm [data-m="saldo"]').click(); await p.waitForTimeout(250);
  out.comSaldoTotal=await p.locator('#cp-tot').textContent();
  out.metodosComSaldoCheio=await p.evaluate(()=>[...document.querySelectorAll('#cp-pgm [data-m]')].map(b=>b.dataset.m));
  await p.screenshot({path:require('path').join(__dirname,'saida','p-compra-saldo.png')});
  await p.locator('#cp-ok').click(); await p.waitForTimeout(400);
  out.confirmCompra=(await p.locator('#cp-txt').textContent()).slice(0,110);
  await p.locator('#cp-f').click(); await p.waitForTimeout(300);

  /* ---- fechar escala ---- */
  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(400);
  for(let i=0;i<2;i++){await p.locator('#e-add [data-f]').nth(i).click();await p.waitForTimeout(200)}
  for(let i=0;i<2;i++){
    const op=await p.locator('#e-vagas [data-sel]').nth(i).locator('option').nth(1).getAttribute('value');
    if(op) await p.locator('#e-vagas [data-sel]').nth(i).selectOption(op);
    await p.waitForTimeout(180);
  }
  await p.locator('#e-fechar').click(); await p.waitForTimeout(400);
  out.metodosEscala=await p.evaluate(()=>[...document.querySelectorAll('#fe-pgm [data-m]')].map(b=>b.dataset.m));
  out.escalaTotal=await p.locator('#fe-tot').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','p-escala-pix.png')});
  await p.locator('#fe-pgm [data-m="pix"]').click(); await p.waitForTimeout(200);
  out.temPix=await p.locator('#fe-pgm .pixbox').count();
  await p.locator('#fe-ok').click(); await p.waitForTimeout(450);
  out.confirmEscala=(await p.locator('#fe-txt').textContent()).slice(0,130);
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);

  out.semDepositoSolto=await p.evaluate(()=>
    !/depositar na (carteira|plataforma)|recarregar|adicionar saldo/i.test(document.body.innerText));
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
  /* a conta de contratante é paga: fecha a assinatura para seguir */
  await m.locator('.bt[data-tab="brecho"]').click(); await m.waitForTimeout(400);
  await m.evaluate(()=>{const a=ANUNCIOS.find(x=>x.dono!==EU.id&&x.estadoVenda==="disponivel"&&x.gar);abrirAnuncio(a.id)});
  await m.waitForTimeout(400);
  await m.locator('#a-comprar').click(); await m.waitForTimeout(400);
  await m.screenshot({path:require('path').join(__dirname,'saida','p-mob-compra.png')});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();

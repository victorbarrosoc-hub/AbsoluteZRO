const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await require('./_navegador.js').abrir();
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
  out.abasLogin=await p.locator('.lgaba').allTextContents();
  await p.evaluate(()=>{LG_TIPO="contratante";pintarLogin()});
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(400);
  /* a conta de contratante é paga: fecha a assinatura se ela aparecer */
  out.modo=await p.evaluate(()=>MODO);
  out.abaPerfil=await p.locator('.tab[data-tab="minhaprod"]').textContent();
  out.nomeTopo=await p.locator('#eu-nome').textContent();

  /* avatar: sem sobra de estado entre modos */
  out.avContratante=await p.evaluate(()=>{const a=document.getElementById('eu-ini');
    return {txt:a.textContent,bg:getComputedStyle(a).backgroundImage.slice(0,12)}});
  await p.evaluate(()=>{MODO="freela";aplicarModo()}); await p.waitForTimeout(250);
  out.avFreela=await p.evaluate(()=>{const a=document.getElementById('eu-ini');
    return {txt:a.textContent,bg:getComputedStyle(a).backgroundImage.slice(0,12)}});
  out.semSobra=!(out.avFreela.txt && out.avFreela.bg.startsWith('url'));

  /* clicar no nome vai para o painel */
  await p.locator('#eu-bt').click(); await p.waitForTimeout(350);
  out.cliqueNoNome=await p.evaluate(()=>S.tab);

  /* menu lateral */
  await p.locator('#menu-bt').click(); await p.waitForTimeout(400);
  out.gavetaAberta=await p.locator('#gaveta').evaluate(e=>e.classList.contains('on'));
  out.itensNav=await p.locator('#g-nav .gitem').count();
  out.gNome=await p.locator('#g-nome').textContent();
  out.gTipo=await p.locator('#g-tipo').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','y-gaveta.png')});
  /* desde 17/out · 10 a documentação mora no grupo Ajuda, recolhido */
  { const ab=p.locator('#gaveta [data-sanf="ajuda"] .mn-abre'); if(await ab.getAttribute('aria-expanded')!=='true'){ await ab.click(); await p.waitForTimeout(250) } }
  await p.locator('[data-ajuda="faq"]').click(); await p.waitForTimeout(400);
  out.ajudaTitulo=await p.locator('#aj-tit').textContent();
  out.perguntas=await p.locator('#aj-corpo .blk').count();
  out.gavetaFechou=!(await p.locator('#gaveta').evaluate(e=>e.classList.contains('on')));
  await p.screenshot({path:require('path').join(__dirname,'saida','y-faq.png'),fullPage:true});
  await p.locator('#aj-back').click(); await p.waitForTimeout(300);
  out.voltouPara=await p.evaluate(()=>S.tab);

  /* chat da negociação */
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(400);
  await p.locator('[data-bp="vender"]').click(); await p.waitForTimeout(450);
  out.temChat=await p.locator('#vd-andamento .chat').count();
  out.msgsSemeadas=await p.locator('#vd-andamento .bolha').count();
  await p.locator('#vd-andamento .chatbar input').first().fill('Combinado, levo a nota fiscal.');
  await p.locator('#vd-andamento .chatbar button').first().click(); await p.waitForTimeout(350);
  out.msgsDepois=await p.locator('#vd-andamento .bolha').count();
  out.ultima=(await p.locator('#vd-andamento .bolha.minha').last().textContent()).slice(0,32);
  /* .eu é o chip do topbar: se a bolha herdar dele, vem white-space:nowrap e
     a mensagem longa vira uma linha só, estourando a coluna do chat. */
  await p.locator('#vd-andamento .chatbar input').first().fill('Mensagem bem comprida de propósito para conferir se a bolha quebra linha em vez de virar uma tira só atravessando a tela inteira do chat');
  await p.locator('#vd-andamento .chatbar button').first().click(); await p.waitForTimeout(350);
  out.bolhaQuebra=await p.locator('#vd-andamento .bolha.minha').last().evaluate(e=>{
    const cs=getComputedStyle(e), r=e.getBoundingClientRect();
    return {ws:cs.whiteSpace,display:cs.display,linhas:Math.round(r.height/parseFloat(cs.lineHeight)),cabe:r.width<=e.parentElement.getBoundingClientRect().width};
  });
  await p.screenshot({path:require('path').join(__dirname,'saida','y-chat.png'),fullPage:true});

  out.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
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
  await m.locator('[data-login="Google"]').click(); await m.waitForTimeout(400);
  /* a conta de contratante é paga: fecha a assinatura se ela aparecer */
  out.btsMobile=await m.locator('#bottombar .bt:visible').count();
  out.rotulosMobile=await m.locator('#bottombar .bt:visible span:not(.bg)').allTextContents();
  await m.screenshot({path:require('path').join(__dirname,'saida','y-mob-barra.png')});
  await m.locator('#bt-menu').click(); await m.waitForTimeout(450);
  await m.screenshot({path:require('path').join(__dirname,'saida','y-mob-gaveta.png')});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();

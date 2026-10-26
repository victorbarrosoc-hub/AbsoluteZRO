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

  /* --- login com abas --- */
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(250);
  out.abas=await p.locator('.lgaba').allTextContents();
  out.provedoresFreela=await p.locator('[data-login]').count();
  out.subFreela=(await p.locator('#lg-sub').textContent()).slice(0,44);
  /* 17/out · 13: os selos por provedor saíram junto com Apple, WhatsApp e
     Microsoft — sobraram o Google e a conta oficial */
  await p.evaluate(()=>{LG_TIPO="contratante";pintarLogin()});
  out.provedoresProd=await p.locator('[data-login]').count();
  out.subProd=(await p.locator('#lg-sub').textContent()).slice(0,44);
  await p.screenshot({path:require('path').join(__dirname,'saida','lg-prod.png')});
  /* produtora entrando por Google (antes só existia Microsoft) */
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(400);
  /* a conta de contratante é paga: fecha a assinatura se ela aparecer */
  out.modoDepois=await p.evaluate(()=>MODO);
  out.abaProdVisivel=await p.locator('.tab[data-tab="minhaprod"]').isVisible();

  /* --- painel de vendas --- */
  /* saldo no topo, visível em qualquer tela */
  out.saldoTopoVisivel=await p.locator('#saldo-top').isVisible();
  out.saldoTopo=await p.locator('#saldo-top-v').textContent();
  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(250);
  out.saldoTopoEmOutraTela=await p.locator('#saldo-top-v').textContent();
  await p.locator('#saldo-top').click(); await p.waitForTimeout(400);
  out.saldoTopoAbrePainel=await p.locator('#bp-vender').isVisible();
  out.moeda=await p.evaluate(()=>MOEDA.simbolo+" · "+MOEDA.paridade);
  out.naoDaParaComprarMoeda=await p.evaluate(()=>
    /* innerText, não textContent: o comentário do código também é texto do body */
    !new RegExp('recarreg|adicionar\\s+saldo|comprar\\s+(moeda|'+MOEDA.nome+'|'+MOEDA.plural+')','i').test(document.body.innerText));
  await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(400);
  out.badge=await p.locator('#bg-vendas').textContent();
  await p.locator('[data-bp="vender"]').click(); await p.waitForTimeout(400);
  out.fatos=await p.evaluate(()=>[...document.querySelectorAll('#ct-fatos .fato')].map(f=>f.querySelector('.lab').textContent+': '+f.querySelector('b').textContent));
  out.grupos=await p.evaluate(()=>[...document.querySelectorAll('#bp-vender .vcab')].map(c=>c.textContent.replace(/\s+/g,' ').trim()));
  out.precisaAcao=await p.locator('#vd-acao .vitem').count();
  out.extrato=await p.locator('#vd-extrato .mov').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','vd-painel.png'),fullPage:true});

  /* aceitar a proposta de valor */
  out.ofertaTxt=(await p.locator('#vd-acao .oferta').first().textContent()).trim();
  const saldoAntes=await p.evaluate(()=>saldo());
  await p.locator('#vd-acao [data-ap]').first().click(); await p.waitForTimeout(400);
  out.aposAceitar=await p.evaluate(()=>{const a=meusAn().find(x=>x.t.indexOf("A7 IV")>=0);return a.estadoVenda+" @ "+a.fechado});
  out.andamentoDepois=await p.locator('#vd-andamento .vitem').count();

  /* confirmar a compra pedida */
  await p.locator('#vd-acao [data-cv]').first().click(); await p.waitForTimeout(400);
  out.sigmaDepois=await p.evaluate(()=>meusAn().find(x=>x.t.indexOf("Sigma")>=0).estadoVenda);
  out.badgeDepois=await p.evaluate(()=>document.getElementById('bg-vendas').hidden);

  /* entregar e liberar → crédito entra */
  await p.locator('#vd-andamento [data-me]').first().click(); await p.waitForTimeout(350);
  out.temLiberar=await p.locator('#vd-andamento [data-lb]').count();
  await p.locator('#vd-andamento [data-lb]').first().click(); await p.waitForTimeout(400);
  const saldoDepois=await p.evaluate(()=>saldo());
  out.creditou=saldoDepois-saldoAntes;
  /* a taxa tem que sair na liberação, não no saque */
  const brutoLib=await p.evaluate(()=>{const m=CARTEIRA.mov.find(x=>x.tipo==="venda");return m.bruto});
  out.brutoLiberado=brutoLib;
  out.taxaConfere=(out.creditou===Math.round(brutoLib*.95));
  out.taxaRetida=brutoLib-out.creditou;
  out.extratoDepois=await p.locator('#vd-extrato .mov').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','vd-depois.png'),fullPage:true});

  /* --- saque com 5% --- */
  await p.locator('#ct-sacar').click(); await p.waitForTimeout(350);
  out.sqBruto=await p.locator('#sq-bruto').textContent();
  out.sqTaxa=await p.locator('#sq-taxa').textContent();
  out.sqLiq=await p.locator('#sq-liq').textContent();
  await p.locator('#sq-valor').fill('2000'); await p.waitForTimeout(250);
  out.sq2=[await p.locator('#sq-bruto').textContent(),await p.locator('#sq-taxa').textContent(),await p.locator('#sq-liq').textContent()].join(' / ');
  await p.screenshot({path:require('path').join(__dirname,'saida','vd-saque.png')});
  await p.locator('#sq-ok').click(); await p.waitForTimeout(400);
  out.sqTxt=(await p.locator('#sq-txt').textContent()).slice(0,70);
  await p.locator('#sq-f').click(); await p.waitForTimeout(350);
  out.saldoPosSaque=await p.evaluate(()=>saldo());
  out.saldoTopoAposSaque=await p.locator('#saldo-top-v').textContent();
  out.sacadoTot=await p.evaluate(()=>sacadoTot());
  out.saqueSemTaxa=await p.evaluate(()=>taxaPaga()===CARTEIRA.mov.filter(m=>m.tipo==="venda").reduce((t,m)=>t+m.bruto-m.valor,0));
  out.taxaTotalPaga=await p.evaluate(()=>taxaPaga());

  /* --- comprar usando crédito --- */
  await p.locator('[data-bp="comprar"]').click(); await p.waitForTimeout(300);
  await p.evaluate(()=>{const a=ANUNCIOS.find(x=>x.dono!==EU.id&&x.estadoVenda==="disponivel"&&x.gar);abrirAnuncio(a.id)});
  await p.waitForTimeout(400);
  out.temPropor=await p.locator('#a-propor').count();
  await p.locator('#a-comprar').click(); await p.waitForTimeout(350);
  out.temCredito=await p.locator('#cp-pgm [data-m="saldo"]').isVisible();
  out.creditoTxt=await p.locator('#cp-pgm [data-m="saldo"] small').textContent();
  out.totalSemCredito=await p.locator('#cp-tot').textContent();
  await p.locator('#cp-pgm [data-m="saldo"]').click(); await p.waitForTimeout(250);
  out.totalComCredito=await p.locator('#cp-tot').textContent();
  out.linhaCredito=await p.locator('#cp-cred').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','vd-compra.png')});
  const antesCompra=await p.evaluate(()=>saldo());
  await p.locator('#cp-ok').click(); await p.waitForTimeout(400);
  out.gastouCredito=antesCompra-(await p.evaluate(()=>saldo()));
  await p.locator('#cp-f').click(); await p.waitForTimeout(350);

  /* --- proposta pelo lado do comprador --- */
  await p.evaluate(()=>{const a=ANUNCIOS.find(x=>x.dono!==EU.id&&x.estadoVenda==="disponivel"&&x.gar);abrirAnuncio(a.id)});
  await p.waitForTimeout(350);
  await p.locator('#a-propor').click(); await p.waitForTimeout(350);
  out.prSugerido=await p.locator('#pr-valor').inputValue();
  out.prDif=await p.locator('#pr-dif').textContent();
  await p.locator('#pr-valor').fill('100'); await p.waitForTimeout(250);
  out.prDifBaixo=await p.locator('#pr-dif').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','vd-proposta.png')});
  await p.locator('#pr-x').click(); await p.waitForTimeout(250);

  /* --- freela vê o mesmo painel --- */
  await p.evaluate(()=>{MODO="freela";aplicarModo();painelBrecho("vender");show("brecho")});
  await p.waitForTimeout(400);
  out.freelaVePainel=await p.locator('#bp-vender').isVisible();
  out.freelaVeCarteira=await p.locator('#ct-fatos .fato').count();

  out.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  /* --- mobile --- */
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
  await m.screenshot({path:require('path').join(__dirname,'saida','vd-mob-login.png')});
  await m.evaluate(()=>{LG_TIPO="contratante";pintarLogin()});
  await m.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await m.waitForTimeout(350);
  /* a conta de contratante é paga: fecha a assinatura se ela aparecer */
  out.mobModo=await m.evaluate(()=>MODO);
  await m.locator('.bt[data-tab="brecho"]').click(); await m.waitForTimeout(400);
  await m.locator('[data-bp="vender"]').click(); await m.waitForTimeout(400);
  await m.screenshot({path:require('path').join(__dirname,'saida','vd-mob-painel.png'),fullPage:true});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();

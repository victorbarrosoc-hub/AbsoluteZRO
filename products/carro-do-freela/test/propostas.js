const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[];p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  p.on('pageerror',e=>errs.push('ERR: '+e.message));
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(300);

  const badge0=await p.locator('#bg-top').textContent();
  const badgeVis=await p.locator('#bg-top').isVisible();
  await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(300);
  const cards=await p.locator('#pp-lista .prop').count();
  const novas=await p.locator('#pp-novas').textContent();
  const emJogo=await p.locator('#pp-valor').textContent();
  const resp0=await p.locator('#pp-resp').textContent();
  const conflito=await p.locator('.pflag.aviso2').count();
  const abaixo=await p.locator('.pflag.baixo').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','p-lista.png'),fullPage:true});

  const jobsAntes=await p.evaluate(()=>JOBS.length);

  /* aceitar a primeira (Agência Vetor, garantida) */
  await p.locator('.prop[data-p="1"] [data-ac]').click(); await p.waitForTimeout(400);
  const jobsDepois=await p.evaluate(()=>JOBS.length);
  const st1=await p.locator('.prop[data-p="1"] .pill').textContent();
  const resp1=await p.locator('#pp-resp').textContent();
  const badge1=await p.locator('#bg-top').textContent();
  // o job entrou na agenda e na custódia?
  const naAgenda=await p.evaluate(()=>{
    const pr=PROPOSTAS.find(x=>x.id===1);
    const j=JOBS.find(x=>x.data===pr.data&&x.cliente===pr.de);
    return j?{cliente:j.cliente,valor:j.valor,gar:j.gar,esc:garStatus(j)}:null;
  });

  /* recusar a do casamento (valor baixo) */
  await p.locator('.prop[data-p="3"] [data-rc]').click(); await p.waitForTimeout(250);
  const motivos=await p.locator('#rc-3 option').count();
  await p.locator('#rc-3').selectOption({index:1});
  await p.locator('#rcok-3').click(); await p.waitForTimeout(350);
  const st3=await p.locator('.prop[data-p="3"] .pill').textContent();
  const txt3=await p.locator('.prop[data-p="3"] .pfech').textContent();

  /* job não tem contraproposta: é aceita ou recusa, e mais nada */
  const semContrapor=await p.locator('.prop [data-ct]').count();
  const botoes=await p.locator('.prop[data-p="2"] .pacts .btn').allTextContents();
  /* o aviso de valor abaixo da tabela precisa apontar para a recusa com motivo,
     que é o que devolve o preço para quem chamou sem abrir rodada de barganha */
  const flagBaixo=await p.locator('.prop .pflag.baixo').first().textContent().catch(()=>'—');
  const valorProposto=await p.locator('.prop[data-p="2"] .pval b').textContent();
  await p.locator('.prop[data-p="2"] [data-ac]').click(); await p.waitForTimeout(400);
  const stDepois=await p.locator('.prop[data-p="2"] .pill').textContent();
  const jobContra=await p.evaluate(()=>{
    const j=JOBS.find(x=>x.cliente==="Prefeitura de Parnamirim");
    return j?{valor:j.valor,gar:j.gar}:null;
  });
  await p.screenshot({path:require('path').join(__dirname,'saida','p-depois.png'),fullPage:true});
  const badge2=await p.locator('#bg-top').isVisible();

  /* enviar consulta -> volta pra caixa */
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(200);
  await p.evaluate(()=>abrirPerfil(CREW.find(c=>c.me).id)); await p.waitForTimeout(250);
  await p.locator('#p-cta').click(); await p.waitForTimeout(300);
  await p.locator('#m-cli').fill('Produtora Teste');
  await p.locator('#m-desc').fill('Cobertura de evento de um dia.');
  await p.locator('#m-send').click(); await p.waitForTimeout(300);
  await p.locator('#m-close').click(); await p.waitForTimeout(200);
  await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(300);
  const novaCard=await p.locator('#pp-lista .prop').first().locator('.pfrom').textContent();
  const avisoDemo=await p.locator('#pp-lista .prop').first().locator('.pflag.info').count();
  const badge3=await p.locator('#bg-top').textContent();

  /* reputação do perfil reflete o novo tempo de resposta */
  const respPerfil=await p.evaluate(()=>{abrirPerfil(CREW.find(c=>c.me).id);return document.querySelector('#p-rep .rp:nth-child(2) b').textContent});

  const ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  /* mobile */
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
  await m.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await m.waitForTimeout(300);
  const bbBadge=await m.locator('#bg-bot').isVisible();
  const nBt=await m.locator('#bottombar .bt').count();
  await m.locator('.bt[data-tab="propostas"]').click(); await m.waitForTimeout(350);
  const propMob=await m.locator('#v-propostas').isVisible();
  await m.screenshot({path:require('path').join(__dirname,'saida','p-mobile.png')});
  const ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  console.log(JSON.stringify({badge0,badgeVis,cards,novas,emJogo,resp0,conflito,abaixo,
    jobsAntes,jobsDepois,st1,resp1,badge1,naAgenda,
    motivos,st3,txt3:txt3.replace(/\s+/g,' ').trim(),
    semContrapor,botoes,flagBaixo,valorProposto,stDepois,jobContra,badge2,
    novaCard,avisoDemo,badge3,respPerfil,ov,bbBadge,nBt,propMob,ovm,errs,errsM},null,1));
  await b.close();
})();

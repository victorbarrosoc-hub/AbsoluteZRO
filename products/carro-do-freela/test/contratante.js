const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const out={};

  /* ---------- freela vê a produtora ---------- */
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
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
  /* a conta de contratante é paga: fecha a assinatura se ela aparecer */
  out.modoFreela=await p.evaluate(()=>MODO);
  out.abaProdutoraEscondida=!(await p.locator('.tab[data-tab="minhaprod"]').isVisible());
  out.abaPropostasVisivel=await p.locator('.tab[data-tab="propostas"]').isVisible();

  /* tarja de confiança nas propostas */
  await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(350);
  out.tarjas=await p.locator('#pp-lista .tarja').count();
  out.tarjaNova=await p.locator('#pp-lista .tarja.novo').count();
  out.tarjaTxt=(await p.locator('#pp-lista .tarja').first().textContent()).replace(/\s+/g,' ').trim();
  out.tarjaNovaTxt=(await p.locator('#pp-lista .tarja.novo').first().textContent()).replace(/\s+/g,' ').trim();
  await p.screenshot({path:require('path').join(__dirname,'saida','pr-proposta.png')});

  /* abre a produtora pela tarja */
  await p.locator('#pp-lista .tarja').first().click(); await p.waitForTimeout(400);
  out.perfilAberto=await p.locator('#v-produtora').isVisible();
  out.qNome=await p.locator('#q-nome').textContent();
  out.qNums=await p.locator('#q-nums b').allTextContents();
  out.qFatos=await p.locator('#q-fatos .fato').count();
  out.qLeitura=(await p.locator('#q-leitura').textContent()).replace(/\s+/g,' ').trim().slice(0,110);
  out.qFuncs=await p.locator('#q-func .fb').count();
  out.qTrabVis=await p.locator('#q-trab-blk').isVisible();
  out.qMeu=(await p.locator('#q-meu').textContent()).replace(/\s+/g,' ').trim();
  await p.screenshot({path:require('path').join(__dirname,'saida','pr-perfil.png'),fullPage:true});
  await p.locator('#q-back').click(); await p.waitForTimeout(250);
  out.voltouParaPropostas=await p.locator('#v-propostas').isVisible();

  /* produtora sem cadastro */
  await p.evaluate(()=>abrirProdutora("Casamento Priscila & Iã")); await p.waitForTimeout(350);
  out.semCadTipo=await p.locator('#q-selos .tipo').textContent();
  out.semCadLeitura=(await p.locator('#q-leitura .leitura').getAttribute('class'));
  out.semCadFatos=(await p.locator('#q-fatos').textContent()).replace(/\s+/g,' ').trim().slice(0,60);
  await p.screenshot({path:require('path').join(__dirname,'saida','pr-semcad.png')});

  /* cliente clicável na agenda */
  await p.locator('.tab[data-tab="agenda"]').click(); await p.waitForTimeout(300);
  await p.evaluate(()=>{const j=JOBS.find(x=>x.cliente==="Loja Construir");S.selDia=j.data;
    S.mesRef=new Date(new Date(j.data+'T00:00:00').getFullYear(),new Date(j.data+'T00:00:00').getMonth(),1);drawAgenda()});
  await p.waitForTimeout(300);
  await p.locator('#ag-detail .linkc').first().click(); await p.waitForTimeout(350);
  out.daAgenda=await p.locator('#q-nome').textContent();

  /* cliente clicável no portfólio */
  /* o perfil passou a abrir em Publicações (20/ago · 9); a lista de
     clientes mora no painel do PORTFÓLIO, uma aba ao lado */
  await p.evaluate(()=>{abrirPerfil(EU.id);S.ptab='port';drawPtabs()}); await p.waitForTimeout(350);
  out.cliBotao=await p.locator('#p-clientes button.cli').count();
  await p.locator('#p-clientes button.cli').first().click(); await p.waitForTimeout(350);
  out.doPortfolio=await p.locator('#q-nome').textContent();

  /* ---------- conta de produtora ---------- */
  await p.locator('#q-back').click(); await p.waitForTimeout(200);
  await p.locator('#eu-bt').click(); await p.waitForTimeout(250);
  out.voltouAoLogin=await p.locator('#v-entrar').isVisible();
  await p.evaluate(()=>show("entrar"));
  await p.evaluate(()=>{LG_TIPO="contratante";pintarLogin()});
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(350);
  /* a conta de contratante é paga: fecha a assinatura se ela aparecer */
  out.modoProd=await p.evaluate(()=>MODO);
  out.nomeNoTopo=await p.locator('#eu-nome').textContent();
  out.propostasSomem=!(await p.locator('.tab[data-tab="propostas"]').isVisible());
  out.agendaSome=!(await p.locator('.tab[data-tab="agenda"]').isVisible());
  out.meuSome=!(await p.locator('.tab[data-tab="meu"]').isVisible());
  out.prodAparece=await p.locator('.tab[data-tab="minhaprod"]').isVisible();
  out.equipeSegue=await p.locator('.tab[data-tab="equipe"]').isVisible();
  out.cliPreenchido=await p.locator('#u-cli').inputValue();

  await p.evaluate(()=>show("minhaprod")); await p.waitForTimeout(300);
  out.prodPct=await p.locator('#mp-pct2').textContent();
  out.prodFalta=await p.locator('#mp-falta .fl').count();
  out.prodPendente=await p.evaluate(()=>ITENS_P.filter(i=>!i.ok()).map(i=>i.t));
  await p.screenshot({path:require('path').join(__dirname,'saida','pr-editor.png'),fullPage:true});
  await p.setInputFiles('#mp-logo', path.resolve(__dirname,'up-teste.png')); await p.waitForTimeout(600);
  out.prodPctComLogo=await p.locator('#mp-pct2').textContent();
  out.logoNoTopo=await p.evaluate(()=>getComputedStyle(document.getElementById('eu-ini')).backgroundImage.includes('data:image'));
  await p.locator('#mp-nome').fill('Produtora Maré Filmes'); await p.waitForTimeout(250);
  out.nomeAtualizado=await p.locator('#eu-nome').textContent();
  await p.locator('#mp-ver').click(); await p.waitForTimeout(400);
  out.previewNome=await p.locator('#q-nome').textContent();
  out.meuHistoricoOculto=!(await p.locator('#q-meu-blk').isVisible());
  await p.screenshot({path:require('path').join(__dirname,'saida','pr-preview.png')});
  await p.locator('#q-back').click(); await p.waitForTimeout(250);
  out.voltouAoEditor=await p.locator('#v-minhaprod').isVisible();

  out.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

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
  await m.evaluate(()=>{show("entrar");LG_TIPO="contratante";pintarLogin()});
  await m.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await m.waitForTimeout(350);
  /* a conta de contratante é paga: fecha a assinatura se ela aparecer */
  out.btsProd=await m.locator('#bottombar .bt:visible').count();
  await m.evaluate(()=>show("minhaprod")); await m.waitForTimeout(300);
  await m.screenshot({path:require('path').join(__dirname,'saida','pr-mob-editor.png')});
  await m.evaluate(()=>abrirProdutora("Agência Vetor")); await m.waitForTimeout(400);
  await m.screenshot({path:require('path').join(__dirname,'saida','pr-mob-perfil.png')});
  out.ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  out.errs=errs;out.errsM=errsM;
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();

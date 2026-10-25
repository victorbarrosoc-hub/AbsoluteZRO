const { chromium } = require('playwright');
const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
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
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(250);
  /* o login passou a cair no FEED (20/ago · 5, pedido do Victor). Estas
     suítes nasceram quando ele caía em Praças e clicavam direto lá —
     a suposição envelheceu, o código não. */
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(250);
  /* a conta de contratante é paga: fecha a assinatura para seguir */
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350); await p.locator('#as-f').click(); await p.waitForTimeout(300);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(300);

  const dbVis = await p.locator('#databar').isVisible();
  const dbData0 = await p.locator('#db-data').textContent();
  const nGrupos = await p.locator('#rows .secgrupo').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','g-buscar.png')});

  // favoritar 2
  await p.locator('#rows .star').nth(0).click(); await p.waitForTimeout(150);
  await p.locator('#rows .star').nth(3).click(); await p.waitForTimeout(200);
  const temMeuTime = await p.locator('#rows .secgrupo.fav').count();
  const favLabel = temMeuTime ? await p.locator('#rows .secgrupo.fav .gq').textContent() : '-';

  // recolher um grupo
  const antes = await p.locator('#rows .row').count();
  await p.locator('#rows .secgrupo').nth(1).click(); await p.waitForTimeout(200);
  const depois = await p.locator('#rows .row').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','g-grupos.png')});

  // data global: muda no databar, reflete em passar/equipe
  await p.locator('#scrub .day').nth(6).click(); await p.waitForTimeout(250);
  const dbData1 = await p.locator('#db-data').textContent();
  await p.locator('.tab[data-tab="passar"]').click(); await p.waitForTimeout(250);
  const dbNaPassar = await p.locator('#db-data').textContent();
  const semSelectData = await p.locator('#u-data').count();
  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(250);
  const dbNaEquipe = await p.locator('#db-data').textContent();

  // perfil com abas
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(200);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(250);
  await p.locator('#rows .row').first().click(); await p.waitForTimeout(300);
  const paneAgenda = await p.locator('#v-perfil .pane[data-pane="agenda"]:visible').count();
  await p.locator('.pt[data-pt="equip"]').click(); await p.waitForTimeout(200);
  const paneEquip = await p.locator('#v-perfil .pane[data-pane="equip"]:visible').count();
  const paneAgendaOff = await p.locator('#v-perfil .pane[data-pane="agenda"]:visible').count();
  await p.locator('.pt[data-pt="rep"]').click(); await p.waitForTimeout(200);
  const paneRep = await p.locator('#v-perfil .pane[data-pane="rep"]:visible').count();
  await p.screenshot({path:require('path').join(__dirname,'saida','g-perfil.png'),fullPage:true});

  const ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  // mobile: barra inferior
  const m=await b.newPage({viewport:{width:390,height:844}});
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await m.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await m.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await m.locator('.homenav .entrar-cta').click(); await m.waitForTimeout(200);
  await m.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await m.waitForTimeout(300);
  await m.evaluate(()=>show('pracas')); await m.waitForTimeout(250);
  const bbVis=await m.locator('#bottombar').isVisible();
  const topTabsVis=await m.locator('.top .tabs').isVisible();
  await m.locator('.bt[data-tab="agenda"]').click(); await m.waitForTimeout(250);
  const agendaVis=await m.locator('#v-agenda').isVisible();
  await m.evaluate(()=>show('pracas')); await m.waitForTimeout(200);
  await m.locator('#pracas .pc').first().click(); await m.waitForTimeout(250);
  await m.screenshot({path:require('path').join(__dirname,'saida','g-mobile.png')});
  const ovm=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  console.log(JSON.stringify({dbVis,dbData0,nGrupos,temMeuTime,favLabel,antes,depois,
    dbData1,dbNaPassar,dbNaEquipe,semSelectData,
    paneAgenda,paneEquip,paneAgendaOff,paneRep,bbVis,topTabsVis,agendaVis,ov,ovm,errs},null,1));
  await b.close();
})();

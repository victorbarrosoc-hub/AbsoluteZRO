const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const num=s=>+String(s).replace(/\D/g,'');
const entrar=async(p,plano)=>{
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
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  if(plano){
    await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(300);
    if(plano==='frota'){ await p.locator('[data-pl="frota"]').click(); await p.waitForTimeout(300) }
    await p.locator('#as-ok').click(); await p.waitForTimeout(350);
    await p.locator('#as-f').click(); await p.waitForTimeout(350);
  }
};
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));

  /* ================= os dois planos na mesma tela ================= */
  await entrar(p);
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(350);
  t(await p.locator('#as-plano [data-pl]').count()===2,'a assinatura mostra os dois planos, não só o Volante');
  t(num(await p.locator('#as-valor').textContent())===89,'abre no Volante');
  const vantVolante=await p.locator('#as-lista').textContent();
  t(/quem está livre/.test(vantVolante),'com as vantagens dele');
  t(/Frota/.test(await p.locator('#as-comp').textContent()),'e a comparação aponta o outro plano');

  await p.locator('[data-pl="frota"]').click(); await p.waitForTimeout(350);
  t(num(await p.locator('#as-valor').textContent())===189,'trocar para Frota muda o preço');
  const vantFrota=await p.locator('#as-lista').textContent();
  t(/Cláusulas próprias/.test(vantFrota)&&/Relatório/.test(vantFrota),'e as vantagens dela');
  t(vantFrota!==vantVolante,'as listas são diferentes de verdade');
  t(/mais barat/.test(await p.locator('#as-comp').textContent()),'a Frota diz quando NÃO compensa');
  t(/Frota/.test(await p.locator('#as-ok').textContent()),'e o botão nomeia o plano escolhido');

  await p.locator('#as-ok').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>planoAtual())==='frota','assinar pela Frota já entra como Frota');
  t(await p.evaluate(()=>taxaPct())===4,'com a taxa de 4%');
  await p.locator('#as-f').click(); await p.waitForTimeout(350);

  /* ================= a aba de guildas ================= */
  await p.locator('.tab[data-tab="guildas"][data-modo="contratante"]').click(); await p.waitForTimeout(500);
  t(await p.locator('#v-guildas').isVisible(),'a aba Guildas existe no menu e abre');
  const cards=await p.locator('#gl-rank .gcard').count();
  t(cards>=5,'o ranking lista as guildas: '+cards);
  /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner desta tela saiu; quem diz o que é ilustrativo é o
     selo "Prévia" ao lado da marca — e é ele que esta asserção cobra. */
  t(!/demonstração/.test(await p.locator('#v-guildas').innerText())&&await p.evaluate(()=>[...document.querySelectorAll('[data-previa]')].some(b=>b.offsetParent!==null)),
    'sem banner de demonstração nas guildas — a prévia se declara no selo');
  t(/Não existe posição comprada/.test(await p.locator('#v-guildas').textContent()),
    'e de que ninguém compra posição no ranking');

  /* o ranking é por número, e está de fato ordenado */
  const ordenado=await p.evaluate(()=>{
    const r=rankGuildas().map(g=>totJobsGuilda(g.id));
    return r.every((x,i)=>i===0||r[i-1]>=x);
  });
  t(ordenado,'ordenado por jobs fechados, do maior para o menor');
  const primeiro=await p.locator('#gl-rank .gcard').first().textContent();
  t(/líder:/.test(primeiro),'cada guilda mostra quem é o líder: "'+primeiro.replace(/\s+/g,' ').slice(0,60)+'"');
  t(/nível/i.test(primeiro)&&/jobs/i.test(primeiro)&&/movimentado/i.test(primeiro),
    'com nível, jobs e quanto movimentou');

  /* ================= entrar, e o que muda ================= */
  t(/ainda não tem guilda/.test(await p.locator('#gl-eu').textContent()),'sem guilda, a tela diz isso');
  await p.locator('#gl-rank .gcard').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl16').isVisible(),'clicar abre a guilda');
  t(/líder:/.test(await p.locator('#gu-sub').textContent()),'o modal também nomeia o líder');
  t(await p.locator('#gu-chatb').isHidden(),'e o chat NÃO aparece para quem está de fora');

  await p.locator('#gu-ok').click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>MINHA_GUILDA)!==null,'entrar funciona');
  t(await p.locator('#v-salao').isVisible(),'e entrar leva direto ao SALÃO da guilda');
  t(await p.locator('#sl-chat .bolha').count()>=1,'com o chat já aberto e a mensagem de boas-vindas');
  t(await p.locator('#sl-membros .slm').count()>=1,'e o quadro de membros na parede');

  /* o chat funciona */
  const antes=await p.locator('#sl-chat .bolha').count();
  await p.locator('#sl-chat input').fill('Alguém livre quinta pra um corporativo?');
  await p.locator('#sl-chat .chatbar button').click(); await p.waitForTimeout(400);
  t(await p.locator('#sl-chat .bolha').count()===antes+1,'mandar mensagem no salão funciona');
  t(/corporativo/.test(await p.locator('#sl-chat').textContent()),'e a mensagem fica no fio');

  /* o chat é por guilda: sair e entrar em outra não mistura */
  const fioAtual=await p.evaluate(()=>'guilda-'+MINHA_GUILDA);
  t(await p.evaluate(k=>FIOS[k]&&FIOS[k].msgs.some(m=>/corporativo/.test(m.txt)),fioAtual),
    'a conversa fica gravada no fio daquela guilda específica');

  await p.locator('.tab[data-tab="guildas"][data-modo="contratante"]').click(); await p.waitForTimeout(450);
  t(!/ainda não tem guilda/.test(await p.locator('#gl-eu').textContent()),'a tela passa a mostrar a sua guilda');
  t(await p.locator('#gl-rank .gcard.eu').count()===1,'e ela fica marcada no ranking');

  /* ================= o brasão com nome ================= */
  await p.evaluate(()=>{const c=CREW.find(x=>x.me);abrirPerfil(c.id)}); await p.waitForTimeout(500);
  const chip=await p.locator('#p-gar .col-selo').last().textContent();
  t(/·/.test(chip)&&chip.length>5,'o perfil mostra brasão E nome da guilda, não só a sigla: "'+chip+'"');
  await p.locator('#p-gar .col-selo').last().click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl16').isVisible(),'e clicar nele abre a guilda');
  await p.locator('#gu-x').click(); await p.waitForTimeout(300);

  /* ================= o que a pessoa está vendendo ================= */
  const dono=await p.evaluate(()=>{const a=ANUNCIOS.find(x=>!x.vendido);return a?a.dono:null});
  await p.evaluate(id=>abrirPerfil(id),dono); await p.waitForTimeout(450);
  t(await p.locator('.pt[data-pt="vende"]').count()===1,'o perfil tem aba "À venda"');
  await p.locator('.pt[data-pt="vende"]').click(); await p.waitForTimeout(400);
  const itens=await p.locator('#p-vende .clzl').count();
  t(itens>=1,'com o que a pessoa está vendendo no brechó: '+itens);
  const esperado=await p.evaluate(id=>anunciosDe(id).length,dono);
  t(itens===esperado,'e mostra todos os anúncios ativos dela: '+itens+' de '+esperado);
  await p.locator('#p-vende [data-vean]').first().click(); await p.waitForTimeout(500);
  t(await p.locator('#v-anuncio').isVisible(),'abrir leva direto para o anúncio');

  /* quem não vende nada tem estado vazio, não tela quebrada */
  const semAn=await p.evaluate(()=>{const ids=new Set(ANUNCIOS.map(a=>a.dono));return (CREW.find(c=>!ids.has(c.id))||{}).id});
  await p.evaluate(id=>{abrirPerfil(id);S.ptab='vende';drawPtabs()},semAn); await p.waitForTimeout(400);
  t(/não tem nada à venda/.test(await p.locator('#p-vende').textContent()),'e quem não vende nada tem estado vazio');

  /* ================= líder da equipe no job ================= */
  await p.evaluate(()=>{show('jobs');jobAberto=ESCALAS[0].id;drawJobs()}); await p.waitForTimeout(450);
  t(await p.locator('[data-lider]').count()===1,'o painel do job tem onde escolher quem lidera no set');
  t(/não vai estar no set/.test(await p.locator('#jb-det').textContent()),
    'com o motivo explicado: nem sempre quem contrata está lá');
  const opcoes=await p.locator('[data-lider] option').count();
  const naEquipe=await p.evaluate(()=>ESCALAS[0].equipe.length);
  t(opcoes===naEquipe+1,'o líder é escolhido entre quem já está escalado: '+opcoes+' opções para '+naEquipe+' pessoas');
  const alvo=await p.locator('[data-lider] option').nth(1).getAttribute('value');
  await p.locator('[data-lider]').selectOption(alvo); await p.waitForTimeout(400);
  t(await p.evaluate(()=>ESCALAS[0].lider)===+alvo,'escolher grava no job');
  t(/responde pelo dia/.test(await p.locator('#jb-det').textContent()),'e a tela diz o que isso significa');

  /* quem é freela vê quem lidera, mas não escolhe */
  const jobMeu=await p.evaluate(()=>{
    const e=ESCALAS.find(x=>x.equipe.some(y=>y.quem===EU.id));
    if(e) e.lider=e.equipe[0].quem;
    return e?e.id:null;
  });
  if(jobMeu){
    await p.evaluate(id=>{MODO='freela';aplicarModo();show('jobs');jobAberto=id;drawJobs()},jobMeu);
    await p.waitForTimeout(450);
    t(/Lidera no set/.test(await p.locator('#jb-det').textContent()),'o freela vê quem lidera');
    t(await p.locator('[data-lider]').count()===0,'mas não escolhe — isso é de quem contrata');
  }

  /* ================= som e animação do carro passando ================= */
  await p.evaluate(()=>{MODO='contratante';ASSINANTE=true;aplicarModo();show('passar')}); await p.waitForTimeout(500);
  const marcaveis=await p.locator('#u-list .sl input').count();
  if(marcaveis){
    await p.locator('#u-list .sl input').first().check(); await p.waitForTimeout(200);
    await p.locator('#u-send').click(); await p.waitForTimeout(400);
    t(await p.locator('#u-send').evaluate(e=>e.classList.contains('passou')),
      'passar o carro anima o botão');
  } else t(false,'não havia ninguém para marcar na chamada');

  /* as animações respeitam quem pediu menos movimento */
  const respeita=await p.evaluate(()=>{
    const css=[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch(e){return []}});
    return css.some(r=>r.conditionText&&/prefers-reduced-motion/.test(r.conditionText));
  });
  t(respeita,'e existe regra de prefers-reduced-motion para quem desliga movimento');

  /* ================= mobile ================= */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>show('guildas')); await p.waitForTimeout(450);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'o ranking de guildas cabe no mobile: '+ov);
  await p.screenshot({path:path.join(__dirname,'saida','guildas-mobile.png'),fullPage:true});

  t(!errs.length,'sem erro de JS no fluxo inteiro');
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const entrar=async(p,tipo)=>{
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  if(tipo==='contratante') await p.locator('[data-lgtipo="contratante"]').click();
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(400);
};
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));

  /* ============ conta de freela: a agenda alheia é trancada ============ */
  await entrar(p,'freela');
  t(await p.evaluate(()=>MODO)==='freela','entrou como freela');
  /* ⚠️ REVERTIDO EM 20/ago · 5, a pedido do Victor: "quando logar, a
     primeira página a abrir é o feed geral de postagens de todas as
     pessoas que o usuário segue". A regra velha era "o dia do freela
     começa em quem me chamou"; a nova é melhor porque Propostas só tem
     conteúdo quando alguém chamou, e na maioria dos dias ninguém chamou.
     O feed tem conteúdo todo dia — é o que faz abrir o app sem job. */
  t(await p.evaluate(()=>S.tab)==='feed','o dia começa no FEED, não em propostas nem na praça');
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(300);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#rows .row').count()===0,'busca não lista ninguém');
  t(await p.locator('#rows .trancado').count()===1,'busca mostra o painel trancado');
  t(await p.locator('#v-buscar .cols aside').isHidden(),'filtros somem junto');
  t(await p.locator('#scrub').isHidden(),'tira de dias some junto');
  const nomes=await p.locator('#rows').textContent();
  t(!/Op\. de câmera ·/.test(nomes),'nenhum nome de pessoa vaza no painel');
  const cbusca=(await p.locator('#rows .censo .ctit').textContent()).replace(/\s+/g,' ');
  t(/em Natal\/RN/.test(cbusca),'a busca conta a praça escolhida: '+cbusca);
  const nPraca=await p.evaluate(()=>contagemFuncoes(S.cidade).total);
  t(cbusca.trim().startsWith(String(nPraca)),'e o número bate com a praça: '+nPraca);

  /* Montar equipe FICA como vitrine; Passar o carro some — o freela não
     passa vaga, ele é quem recebe a chamada */
  /* pelo data-tab e não pelo rótulo: a faixa de cima passou a usar os
     mesmos nomes curtos da barra de baixo (Equipe, Agenda, Perfil), e o
     que este teste protege é QUAL TELA está à vista, não como ela se
     chama hoje */
  t(await p.locator('.tab[data-tab="equipe"]:visible').count()===1,'a aba de Montar equipe fica de amostra');
  t(await p.locator('.tab[data-tab="passar"]:visible').count()===0,'aba "Passar o carro" some do freela');
  t(await p.locator('.tab[data-tab="agenda"]:visible').count()===1,'a agenda dele continua no topo');
  await p.locator('#menu-bt:visible, #bt-menu:visible').first().click(); await p.waitForTimeout(300);
  const naGaveta=await p.locator('#gaveta .gitem:visible').allTextContents();
  t(!naGaveta.some(x=>/Passar o carro/.test(x)),'e some da gaveta também');
  await p.locator('#g-x').click(); await p.waitForTimeout(250);

  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(500);
  t(await p.locator('#e-trancado .trancado').count()===1,'montar equipe trancado');
  t(await p.locator('#v-equipe .jobcfg').isHidden(),'formulário de escala escondido');
  t(await p.locator('#v-equipe select[data-sel]').count()===0,'nenhum seletor de pessoa disponível');

  /* o censo é o que vende a conta: quantos existem, por função, sem nome */
  const cf=await p.locator('#e-trancado .plg').count();
  t(cf>=6,'censo lista as funções mais cheias: '+cf);
  const ctit=(await p.locator('#e-trancado .censo .ctit').textContent()).replace(/\s+/g,' ');
  t(/109/.test(ctit)&&/19 funções/.test(ctit),'censo bate com o cadastro: '+ctit);
  const linhas=await p.locator('#e-trancado .plg').allTextContents();
  t(/Op\. de câmera87/.test(linhas[0]),'maior função em cima com o número real: '+linhas[0]);
  t(!linhas.some(x=>/Não informado/.test(x)),'"Não informado" fica fora do argumento de venda');
  /* os nomes do rodapé saem dos dados, não de exemplo inventado */
  const nota=await p.locator('#e-trancado .censo .note').textContent();
  t(!/som direto/i.test(nota),'rodapé não inventa função que não existe no cadastro');
  const reais=await p.evaluate(()=>contagemFuncoes().lista.slice(8,12).map(x=>x[0].toLowerCase()));
  t(reais.every(f=>nota.toLowerCase().includes(f)),'rodapé lista as funções reais seguintes');

  /* passar o carro segue trancado mesmo alcançado por dentro */
  await p.evaluate(()=>show("passar")); await p.waitForTimeout(400);
  t(await p.locator('#u-trancado .trancado').count()===1,'passar o carro trancado');
  t(await p.locator('#v-passar .contratar').isHidden(),'formulário da chamada escondido');

  /* receber chamada continua sendo do freela — ele não vê a lista, recebe a vaga */
  await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(400);
  t(await p.locator('#v-propostas').isVisible(),'caixa de propostas segue aberta ao freela');

  /* perfil: portfólio público, agenda trancada */
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(300);
  await p.evaluate(()=>abrirPerfil(CREW.find(c=>!c.me).id)); await p.waitForTimeout(450);
  /* o perfil passou a abrir em Publicações (20/ago · 9, pedido do Victor);
     o portfólio continua público, uma aba ao lado */
  await p.locator('.pt[data-pt="port"]').click(); await p.waitForTimeout(300);
  t(await p.locator('#p-works').isVisible(),'portfólio do outro continua público');
  t(await p.locator('#p-cta').isHidden(),'botão de consultar sumiu');
  await p.locator('.pt[data-pt="agenda"]').click(); await p.waitForTimeout(350);
  t(await p.locator('#p-cal').isHidden(),'calendário do outro escondido');
  t(await p.locator('#p-ag-trancado .trancado').count()===1,'aba agenda mostra a tranca');
  await p.locator('.pt[data-pt="equip"]').click(); await p.waitForTimeout(250);
  t(await p.locator('#v-perfil [data-pane="equip"]').isVisible(),'equipamento segue público');

  /* a minha própria agenda é minha */
  await p.evaluate(()=>abrirPerfil(CREW.find(c=>c.me).id)); await p.waitForTimeout(400);
  await p.locator('.pt[data-pt="agenda"]').click(); await p.waitForTimeout(300);
  t(await p.locator('#p-cal').isVisible(),'a minha agenda continua visível para mim');
  await p.locator('.tab[data-tab="agenda"]').click(); await p.waitForTimeout(350);
  t(await p.locator('#v-agenda').isVisible(),'"Minha agenda" segue aberta');
  await p.screenshot({path:require('path').join(__dirname,'saida','gt-freela.png'),fullPage:true});

  /* ============ o botão do painel leva ao lado de contratante ============ */
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(250);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(400);
  /* o painel oferece os DOIS planos de quem contrata, não só o de baixo */
  t(await p.locator('#rows .dp').count()===2,'o painel trancado mostra os dois planos de contratante');
  const precos=await p.locator('#rows .dpv').allTextContents();
  t(/89/.test(precos.join())&&/189/.test(precos.join()),'com os dois preços: '+precos.join(' e '));
  const rotulo=await p.locator('#rows [data-virar]').first().textContent();
  t(/Volante/.test(rotulo),'e o botão nomeia o plano: "'+rotulo+'"');
  await p.locator('#rows [data-virar]').first().click(); await p.waitForTimeout(500);
  t(await p.locator('#ovl10').isVisible(),'o painel abre a assinatura, não vira contratante de graça');
  t(await p.evaluate(()=>MODO)==='freela','e não troca de lado antes de pagar');
  t(await p.locator('#as-censo .plg').count()>=5,'a assinatura mostra o censo antes do preço');
  t((await p.locator('#as-pgm .mtd b').allTextContents()).length===3,'três formas de pagar, saldo incluído');

  /* pagar com o take que veio de venda: é saída de saldo, não recarga */
  const antes=await p.evaluate(()=>saldo());
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-pgm [data-m="saldo"]').click(); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(500);
  const depois=await p.evaluate(()=>({s:saldo(),ASSINANTE,MODO,mov:CARTEIRA.mov[0].tipo}));
  t(depois.ASSINANTE&&depois.MODO==='contratante','assinou e virou contratante');
  t(depois.s===antes-89,'o take saiu da carteira: '+antes+' → '+depois.s);
  t(depois.mov==='assinatura','a mensalidade entra como movimento na carteira');
  await p.locator('#as-f').click(); await p.waitForTimeout(400);
  t(await p.locator('#rows .row').count()>0,'e a lista aparece: '+await p.locator('#rows .row').count());

  /* cancelar devolve a tranca — assinatura que não dá para cancelar é armadilha */
  await p.evaluate(()=>show('minhaprod')); await p.waitForTimeout(400);
  t(/ativa/.test(await p.locator('#mp-assin').textContent()),'o painel do contratante mostra a assinatura ativa');
  await p.locator('#mp-cancelar').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>!ASSINANTE),'cancelou');
  await p.evaluate(()=>show('buscar')); await p.waitForTimeout(450);
  t(await p.locator('#rows .trancado').count()===1,'e a agenda volta a ficar trancada');
  t(await p.evaluate(()=>CREW.length)===109,'cancelar não apaga nada do cadastro');

  /* ============ entrando direto como contratante ============ */
  await entrar(p,'contratante');
  t(await p.locator('#ovl10').isHidden(),'entrar como contratante não cobra nada — cai no Carona');
  t(await p.evaluate(()=>planoAtual())==='carona','e o plano começa em Carona');
  t(await p.evaluate(()=>!ASSINANTE),'e ainda não é assinante');
  /* o Carona já entra, mas a agenda continua trancada até assinar o Volante */
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(250);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#rows .trancado').count()===1,'Carona não vê quem está livre');
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>MODO)==='contratante'&&await p.evaluate(()=>ASSINANTE),'assinando o Volante, vira contratante assinante');
  await p.evaluate(()=>{show('buscar');render()}); await p.waitForTimeout(450);
  const n=await p.locator('#rows .row').count();
  t(n>0,'contratante vê a lista: '+n+' pessoas');
  t(await p.locator('#rows .trancado').count()===0,'sem tranca');
  t(await p.locator('#fbar .fpil').count()>=3,'a barra de filtros rápidos aparece');
  await p.locator('[data-fb="mais"]').click(); await p.waitForTimeout(350);
  t(await p.locator('#v-buscar .cols aside').isVisible(),'e o painel completo abre no botão Filtros');
  t(await p.locator('#scrub .day').count()>0,'tira de dias de volta');
  t(await p.locator('.tab[data-tab="equipe"]:visible').count()===1
    &&await p.locator('.tab[data-tab="passar"]:visible').count()===1,
    'contratante tem as duas abas de contratar');
  await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(450);
  t(await p.locator('#v-equipe .jobcfg').isVisible(),'montar equipe liberado');
  t(await p.locator('#e-trancado .trancado').count()===0,'sem tranca em montar equipe');
  await p.locator('.tab[data-tab="passar"]').click(); await p.waitForTimeout(450);
  t(await p.locator('#v-passar .contratar').isVisible(),'passar o carro liberado');
  t(await p.locator('#u-trancado .trancado').count()===0,'sem tranca em passar o carro');
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(250);
  await p.evaluate(()=>abrirPerfil(CREW.find(c=>!c.me).id)); await p.waitForTimeout(450);
  t(await p.locator('#p-cta').isVisible(),'botão de consultar disponível');
  await p.locator('.pt[data-pt="agenda"]').click(); await p.waitForTimeout(300);
  t(await p.locator('#p-cal').isVisible(),'calendário da pessoa visível');
  await p.screenshot({path:require('path').join(__dirname,'saida','gt-contratante.png'),fullPage:true});

  /* mobile: a tranca cabe na tela */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(300);
  await entrar(p,'freela');
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(300);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(500);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  await p.screenshot({path:require('path').join(__dirname,'saida','gt-mobile.png')});

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

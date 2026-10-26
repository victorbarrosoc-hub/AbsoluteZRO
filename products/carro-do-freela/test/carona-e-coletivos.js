const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const entrar=async(p,tipo)=>{
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  if(tipo==='contratante'){ await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150) }
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(500);
};
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));

  /* ================= CARONA: entra de graça ================= */
  await entrar(p,'contratante');
  t(await p.locator('#ovl10').isHidden(),'entrar como contratante não abre cobrança nenhuma');
  t(await p.evaluate(()=>planoAtual())==='carona','o plano inicial é Carona');
  t(await p.evaluate(()=>!ASSINANTE),'Carona não é assinante');
  t(await p.evaluate(()=>taxaPct())===6,'e paga a taxa cheia de 6% por job');

  /* o perfil de contratante funciona no Carona */
  await p.evaluate(()=>show('minhaprod')); await p.waitForTimeout(450);
  t(await p.locator('#mp-nome').isVisible(),'o Carona monta o perfil de contratante normalmente');
  const painel=await p.locator('#mp-assin').textContent();
  t(/[Cc]arona/.test(painel),'o painel diz em que plano ele está: "'+painel.slice(0,60).replace(/\s+/g,' ')+'"');
  t(/grátis/.test(painel),'e que é grátis');
  t(await p.locator('#mp-assinar').count()===1,'com o convite para o Volante');

  /* ================= o que o Carona NÃO vê ================= */
  await p.evaluate(()=>{show('buscar');render()}); await p.waitForTimeout(500);
  t(await p.locator('#rows .trancado').count()===1,'a busca continua trancada no Carona');
  t(!await p.locator('#v-buscar .cols aside').isVisible(),'e os filtros não aparecem');
  t(await p.locator('#fbar').isHidden(),'nem a barra de filtros rápidos');
  t(await p.evaluate(()=>!podeVerAgenda()),'podeVerAgenda continua falso');

  /* ================= mas PODE chamar quem já conhece ================= */
  await p.evaluate(()=>{const c=CREW.find(x=>!x.me);abrirPerfil(c.id)}); await p.waitForTimeout(500);
  t(await p.locator('#p-cta').isVisible(),'no perfil de alguém, o botão de consultar aparece no Carona');
  await p.evaluate(()=>{S.ptab='agenda';drawPtabs()}); await p.waitForTimeout(300);
  t(!await p.locator('#p-ag').isVisible(),'mas a agenda daquela pessoa continua trancada');
  t(await p.locator('#p-ag-trancado').isVisible(),'com o painel explicando o Volante');
  t(/Volante/.test(await p.locator('#p-ag-trancado').textContent()),'que chama o plano pelo nome');
  await p.evaluate(()=>{S.ptab='port';drawPtabs()}); await p.waitForTimeout(200);
  await p.locator('#p-cta').click(); await p.waitForTimeout(500);
  t(await p.locator('#ovl1').isVisible()||await p.locator('.ovl:not([hidden])').count()>0,
    'e a consulta abre de verdade — é isso que ele já faria no WhatsApp');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  /* o freela não ganha botão de consultar */
  await entrar(p,'freela');
  await p.evaluate(()=>{const c=CREW.find(x=>!x.me);abrirPerfil(c.id)}); await p.waitForTimeout(500);
  t(!await p.locator('#p-cta').isVisible(),'quem é freela não vê botão de consultar — ele não contrata');

  /* ================= COLETIVOS ================= */
  await entrar(p,'freela');
  await p.evaluate(()=>{show('meu');pintarPerfilFreela()}); await p.waitForTimeout(450);
  t(await p.locator('#pr-col .clzl').count()>=1,'o freela vê os coletivos no próprio perfil');
  t(await p.evaluate(()=>MEUS_COLETIVOS.size)===0,'ninguém nasce dentro de um coletivo');
  t(await p.evaluate(()=>integrantesDe('elas'))===0,
    'e a contagem começa em zero — o protótipo não inventa integrante em cima de cadastro real');

  /* ⚠️ os coletivos moram dentro de "Tabela e regras", e "Meu perfil"
     virou sanfona em 23/ago: a página tinha 7,9 telas de iPhone com tudo
     aberto. Abrir o bloco é o que a pessoa faz — a suíte faz o mesmo,
     uma vez, e o resto da medição continua igual. */
  await p.evaluate(()=>{ if(typeof pfLer==='function'){ pfLer().add('Tabela e regras'); sanfonaPerfil() } });
  await p.waitForTimeout(350);

  await p.locator('[data-pcol]').first().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>MEUS_COLETIVOS.size)===1,'entrar no coletivo é um clique');
  t((await p.locator('[data-pcol]').first().textContent()).trim()==='Sair','e o botão vira "Sair"');
  await p.locator('[data-pcol]').first().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>MEUS_COLETIVOS.size)===0,'sair também');
  await p.locator('[data-pcol]').first().click(); await p.waitForTimeout(400);

  /* ---- o coletivo aparece na busca de quem contrata ---- */
  await p.evaluate(()=>{
    MODO='contratante'; ASSINANTE=true; aplicarModo();
    S.cidade='Natal/RN'; S.only=false; painelFiltros=true; show('buscar'); render(); drawFiltroCol();
  });
  await p.waitForTimeout(500);
  t(await p.locator('#f-col .chip').count()>=1,'a busca tem filtro por coletivo');
  const semFiltro=await p.evaluate(()=>filtrar().length);
  await p.locator('#f-col .chip').first().click(); await p.waitForTimeout(400);
  const comFiltro=await p.evaluate(()=>filtrar().length);
  t(comFiltro===1,'filtrar pelo coletivo devolve só quem entrou nele: '+comFiltro);
  t(comFiltro<semFiltro,'que é menos que a lista inteira: '+comFiltro+' de '+semFiltro);
  t(await p.evaluate(()=>filtrar().every(c=>coletivosDe(c).includes('elas'))),
    'e todo mundo que voltou está mesmo no coletivo');
  await p.locator('#f-col .chip').first().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>filtrar().length)===semFiltro,'desmarcar volta a lista inteira');

  /* ---- limpar filtros zera o coletivo ---- */
  await p.locator('#f-col .chip').first().click(); await p.waitForTimeout(300);
  await p.locator('#f-clear').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>S.col)==='','limpar filtros solta o coletivo também');

  /* ---- a página do coletivo ---- */
  await p.evaluate(()=>{S.col='elas';S.lim=PAGINA;render();drawFiltroCol()}); await p.waitForTimeout(400);
  t(await p.locator('#rows .col-selo').count()===1,'quem está no coletivo carrega o selo na busca');
  await p.locator('#rows .col-selo').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl15').isVisible(),'clicar no selo abre a página do coletivo');
  t(await p.locator('#co-t').textContent()==='Elas no Set','com o nome');
  const nums=await p.locator('#co-nums').textContent();
  t(/1/.test(nums),'a contagem de integrantes é a real: "'+nums.replace(/\s+/g,' ').slice(0,40)+'"');
  t(await p.locator('#co-ok').isHidden(),'quem contrata não entra em coletivo de freela');
  await p.locator('#co-x').click(); await p.waitForTimeout(300);

  /* o freela entra e sai pela própria página do coletivo */
  await p.evaluate(()=>{MODO='freela';ASSINANTE=false;aplicarModo();abrirColetivo('elas')}); await p.waitForTimeout(450);
  t(await p.locator('#co-ok').isVisible(),'o freela vê o botão de entrar/sair na página');
  t((await p.locator('#co-ok').textContent()).trim()==='Sair do coletivo','e ele reflete que já está dentro');
  await p.locator('#co-ok').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>MEUS_COLETIVOS.size)===0,'saiu pela página do coletivo');
  t((await p.locator('#co-ok').textContent()).trim()==='Entrar no coletivo','e o botão inverteu');
  await p.locator('#co-x').click(); await p.waitForTimeout(300);

  /* ---- coletivo é opt-in, e nenhum cadastro real vem com gênero ---- */
  const semGenero=await p.evaluate(()=>CREW.filter(c=>c.genero!==undefined).length);
  t(semGenero===0,'nenhum dos 109 cadastros vem com gênero preenchido — o campo é declarado por quem quiser');

  /* ================= APENAS MULHERES ================= */
  await p.evaluate(()=>{
    MODO='contratante'; ASSINANTE=true; aplicarModo();
    S.col=''; S.cidade='Natal/RN'; S.only=false; painelFiltros=true;
    show('buscar'); render(); drawFiltroMul(); drawFiltroCol();
  });
  await p.waitForTimeout(450);
  t(await p.locator('#f-mul').isVisible(),'existe o botão "Apenas mulheres"');
  t(/Apenas mulheres/.test(await p.locator('#f-mul').textContent()),'com esse nome');
  const inverso=await p.evaluate(()=>/apenas homens|só homens/i.test(document.getElementById('v-buscar').innerText));
  t(!inverso,'e NÃO existe o filtro contrário — é isso que impede o botão de virar ferramenta de exclusão');

  /* começa vazio, e a tela explica por quê em vez de parecer quebrada */
  t(await p.evaluate(()=>quantasMulheres(''))===0,'começa sem ninguém, porque ninguém declarou ainda');
  await p.locator('#f-mul').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>filtrar().length)===0,'com o filtro ligado e ninguém declarado, a lista fica vazia');
  t(/opcional/.test(await p.locator('#rows .empty').textContent()),
    'e o estado vazio explica que o campo é opcional, em vez de parecer defeito');
  await p.locator('#f-mul').click(); await p.waitForTimeout(400);

  /* declarar no perfil faz aparecer */
  await p.evaluate(()=>{MODO='freela';aplicarModo();show('meu')}); await p.waitForTimeout(400);
  await p.locator('#pr-genero').selectOption('mulher'); await p.waitForTimeout(350);
  t(await p.evaluate(()=>EU.genero)==='mulher','a pessoa declara no próprio perfil');
  await p.evaluate(()=>{
    MODO='contratante'; ASSINANTE=true; aplicarModo();
    S.col=''; S.cidade='Natal/RN'; S.only=false; painelFiltros=true; show('buscar'); render(); drawFiltroMul();
  });
  await p.waitForTimeout(450);
  t(/· 1/.test(await p.locator('#f-mul').textContent()),'o botão passa a mostrar a contagem: '+await p.locator('#f-mul').textContent());
  const geral=await p.evaluate(()=>filtrar().length);
  t(await p.evaluate(()=>filtrar().some(c=>ehMulher(c))),
    'quem declarou continua na lista geral — o filtro soma visibilidade, não separa em gueto');
  await p.locator('#f-mul').click(); await p.waitForTimeout(400);
  const soElas=await p.evaluate(()=>filtrar().length);
  t(soElas===1&&soElas<geral,'ligado, devolve só quem declarou: '+soElas+' de '+geral);
  t(await p.evaluate(()=>filtrar().every(ehMulher)),'e só elas mesmo');

  /* o campo não vira selo nem mexe na ordem */
  const semSelo=await p.evaluate(()=>!/genero|mulher/i.test(document.querySelector('#p-gar')?.innerHTML||''));
  t(semSelo,'o gênero declarado não vira selo no perfil');
  await p.locator('#f-mul').click(); await p.waitForTimeout(300);
  const ordemIgual=await p.evaluate(()=>{
    const com=filtrar().map(c=>c.id).join(',');
    const g=EU.genero; EU.genero=undefined;
    const sem=filtrar().map(c=>c.id).join(',');
    EU.genero=g;
    return com===sem;
  });
  t(ordemIgual,'e não muda a posição de ninguém na busca');

  await p.locator('#f-clear').click(); await p.waitForTimeout(350);
  t(await p.evaluate(()=>S.soMulheres)===false,'limpar filtros desliga o Apenas mulheres também');

  /* ================= mobile ================= */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>{MODO='contratante';ASSINANTE=true;aplicarModo();S.cidade='Natal/RN';show('buscar');render();drawFiltroCol()});
  await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  await p.evaluate(()=>abrirColetivo('elas')); await p.waitForTimeout(400);
  const ov2=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov2<=1,'a página do coletivo cabe no mobile: '+ov2);
  await p.screenshot({path:path.join(__dirname,'saida','coletivo-mobile.png')});

  /* ================= a home mostra os cinco planos ================= */
  await p.setViewportSize({width:1280,height:1400}); await p.waitForTimeout(300);
  await p.evaluate(()=>show('home')); await p.waitForTimeout(400);
  const planos=await p.locator('#h-planos').textContent();
  t(/Carona/.test(planos)&&/Volante/.test(planos)&&/Frota/.test(planos),'a home nomeia os três níveis de quem contrata');
  t(/R\$\s*0|Grátis/.test(planos),'com o Carona marcado como grátis (R$ 0)');
  t(/chamar quem quiser de graça/.test(planos)||/só quem paga sabe quem está livre/.test(planos),
    'e a frase que separa o que é grátis do que é pago');

  t(!errs.length,'sem erro de JS no fluxo inteiro');
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1200},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
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
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
  /* o login passou a cair no FEED (20/ago · 7) e Praças foi para o menu */
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(250);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(500);
  await p.evaluate(()=>{painelFiltros=true;render()}); await p.waitForTimeout(300);

  /* ---- busca por nome ---- */
  /* ⚠️ O TERMO SAI DA BASE, NÃO DA MINHA CABEÇA. Antes tinha um nome
     CRAVADO aqui; a lista mudou e a suíte passou a acusar "0 de 34" como se
     a busca estivesse quebrada — o defeito era da suíte. Além disso
     `--anon` corta o sobrenome, então só o primeiro nome é estável. Pego o
     primeiro nome mais repetido que ainda não seja de todo mundo: garante
     match e garante que sobre gente de fora para o filtro ter o que cortar. */
  t(await p.locator('#f-nome').isVisible(),'campo de busca por nome existe no painel');
  const total=await p.locator('#rows .row').count();
  const termo=await p.evaluate(()=>{
    const c={};
    CREW.forEach(x=>{const n=(x.nome||'').trim().split(/\s+/)[0].toLowerCase(); if(n) c[n]=(c[n]||0)+1});
    const pares=Object.entries(c).filter(([,n])=>n<CREW.length).sort((a,b)=>b[1]-a[1]);
    return pares.length?pares[0][0]:'';
  });
  t(!!termo,'a base tem primeiro nome para buscar: "'+termo+'"');
  await p.locator('#f-nome').fill(termo); await p.waitForTimeout(300);
  const filtrados=await p.locator('#rows .row .nm').allTextContents();
  t(filtrados.length>0 && filtrados.length<total,'filtra por nome: '+filtrados.length+' de '+total);
  t(filtrados.every(n=>n.toLowerCase().includes(termo)),'todos os resultados contêm o termo: '+filtrados.join(' | '));
  await p.locator('#f-nome').fill(termo.toUpperCase()); await p.waitForTimeout(300);
  t(await p.locator('#rows .row').count()===filtrados.length,'busca por nome ignora maiúscula/minúscula');
  await p.locator('#f-nome').fill('zzznomequenaoexiste'); await p.waitForTimeout(300);
  t(await p.locator('#rows .row').count()===0,'termo sem match não quebra a lista, só esvazia');
  t(await p.locator('#rows .empty').count()===1,'e mostra o estado vazio');
  await p.locator('#f-nome').fill(''); await p.waitForTimeout(300);
  t(await p.locator('#rows .row').count()===total,'limpar o campo volta ao total: '+total);

  /* ---- filtro garantia / acerto direto ---- */
  t(await p.locator('#f-pagto [data-pg]').count()===3,'três opções: todos, garantia, acerto direto');
  t(await p.locator('[data-pg=""]').getAttribute('aria-pressed')==='true','"Todos" começa selecionado');

  await p.locator('[data-pg="gar"]').click(); await p.waitForTimeout(300);
  t(await p.locator('[data-pg="gar"]').getAttribute('aria-pressed')==='true','clicar marca a opção');
  t(await p.locator('[data-pg=""]').getAttribute('aria-pressed')==='false','e desmarca "Todos"');
  const comGar=await p.evaluate(()=>filtrar().every(c=>c.gar));
  t(comGar,'filtro "Garantia" só devolve quem aceita garantia');
  const nGar=await p.locator('#rows .row').count();
  t(nGar>0 && nGar<total,'e realmente filtra: '+nGar+' de '+total);

  await p.locator('[data-pg="direto"]').click(); await p.waitForTimeout(300);
  const semGar=await p.evaluate(()=>filtrar().every(c=>!c.gar));
  t(semGar,'filtro "Direto" só devolve quem não usa garantia');
  const nDireto=await p.locator('#rows .row').count();
  t(nDireto>0,'com resultado: '+nDireto);
  const cobertura=await p.evaluate(()=>{
    const old=S.pagto;
    S.pagto='gar'; const g=filtrar().length;
    S.pagto='direto'; const d=filtrar().length;
    S.pagto='';      const tot=filtrar().length;
    S.pagto=old;
    return {g,d,tot};
  });
  t(cobertura.g+cobertura.d===cobertura.tot,'garantia + acerto direto cobre todo mundo, sem sobreposição: '+cobertura.g+' + '+cobertura.d+' = '+cobertura.tot);
  const badgeGarantia=await p.locator('#rows .row .selog').count();
  t(badgeGarantia===0,'no filtro "Direto" nenhuma linha mostra o selo de garantia');

  await p.locator('[data-pg=""]').click(); await p.waitForTimeout(300);
  t(await p.locator('#rows .row').count()===total,'"Todos" volta ao total');

  /* ---- combinando nome + pagamento ---- */
  await p.locator('[data-pg="gar"]').click(); await p.waitForTimeout(200);
  await p.locator('#f-nome').fill('a'); await p.waitForTimeout(300);
  const combinado=await p.evaluate(()=>filtrar().every(c=>c.gar&&titulo(c.nome).toLowerCase().includes('a')));
  t(combinado,'nome e forma de pagamento filtram juntos, não um sobrescreve o outro');

  /* ---- limpar filtros reseta tudo, inclusive os novos ----
     Atenção: #f-clear também limpa a cidade, então a lista pós-limpeza não
     precisa bater com o "total" capturado lá em cima (que tinha cidade
     selecionada). Em vez de comparar com um número antigo, confere que o
     DOM bate com a própria conta de paginação do app (favoritos + até
     S.lim do resto), que é a fonte da verdade de quantas linhas devem
     aparecer. */
  await p.locator('#f-clear').click(); await p.waitForTimeout(300);
  t(await p.locator('#f-nome').inputValue()==='','limpar filtros esvazia o campo de nome');
  t(await p.locator('[data-pg=""]').getAttribute('aria-pressed')==='true','e volta o pagamento para "Todos"');
  const domClear=await p.locator('#rows .row').count();
  const espClear=await p.evaluate(()=>{
    const list=filtrar();
    const favs=list.filter(c=>FAV.has(c.id));
    const resto=list.filter(c=>!FAV.has(c.id));
    return favs.length+Math.min(resto.length,S.lim);
  });
  t(domClear===espClear,'lista renderizada bate com a conta de paginação após limpar: '+domClear+' linhas, '+espClear+' esperadas');

  /* ---- mobile ---- */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.locator('#f-nome').fill(termo); await p.waitForTimeout(300);
  t(await p.locator('#rows .row').count()>0,'busca por nome funciona no mobile');
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  const rotDireto=await p.locator('[data-pg="direto"]').textContent();
  t(rotDireto.trim().length<=8,'o rótulo do filtro cabe sem cortar: "'+rotDireto+'"');
  await p.screenshot({path:require('path').join(__dirname,'saida','filtros-mobile.png')});

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

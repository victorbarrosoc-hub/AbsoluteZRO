const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
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

  /* ---- o catálogo é um só ---- */
  const cat=await p.evaluate(()=>({tipos:TIPOS, funcoes:FUNCOES.length}));
  t(cat.tipos.length>=12,'catálogo de tipos: '+cat.tipos.length+' opções');
  ['Corporativo','Casamento','Festa e evento','Conteúdo para redes'].forEach(x=>
    t(cat.tipos.includes(x),'catálogo tem "'+x+'"'));
  t(new Set(cat.tipos).size===cat.tipos.length,'sem tipo repetido no catálogo');
  t(!cat.tipos.some(x=>x===x.toUpperCase()&&x.length>4),'nenhum tipo em caixa alta');

  /* ---- o cadastro sujo foi normalizado ---- */
  const dados=await p.evaluate(()=>{
    const m={}; CREW.forEach(c=>(c.nicho||[]).forEach(n=>m[n]=(m[n]||0)+1));
    return {contagem:m, fora:Object.keys(m).filter(k=>!TIPOS.includes(k)),
            todos:CREW.filter(c=>c.todosTipos).length};
  });
  t(dados.fora.length===0,'todo tipo gravado no cadastro está no catálogo'+(dados.fora.length?': '+dados.fora:''));
  t(dados.contagem['Casamento']===2,'"CASAMENTOS E EVENTOS" e "CASAMENTOS e eventos" viraram um só: '+dados.contagem['Casamento']);
  t(!dados.contagem['Todos os nichos'],'"Todos os nichos" não vira chip solto');
  t(dados.todos===73,'vira a marca "atende qualquer tipo": '+dados.todos+' pessoas');

  /* ---- nenhum campo de tipo é texto livre ---- */
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(400);
  const n1=await p.locator('#m-tipo option').count();
  const n2=await p.locator('#cd-w-tp option').count();
  t(n1===cat.tipos.length,'consulta usa o catálogo inteiro: '+n1);
  t(n2===cat.tipos.length,'trabalho do cadastro usa o catálogo inteiro: '+n2);
  const iguais=await p.evaluate(()=>{
    const a=[...document.querySelectorAll('#m-tipo option')].map(o=>o.textContent);
    const c=[...document.querySelectorAll('#cd-w-tp option')].map(o=>o.textContent);
    return JSON.stringify(a)===JSON.stringify(c);
  });
  t(iguais,'as duas listas são idênticas, na mesma ordem');

  await p.locator('.tab[data-tab="meu"]').click(); await p.waitForTimeout(400);
  await p.locator('#pf-add').click(); await p.waitForTimeout(350);
  t(await p.locator('select#tb-tipo').count()===1,'editor de portfólio virou select');
  t(await p.locator('input#tb-tipo').count()===0,'e não é mais texto livre');
  t(await p.locator('#tb-tipo option').count()===cat.tipos.length,'com o catálogo inteiro');
  /* publica escolhendo um tipo e confere que ele chega inteiro */
  await p.locator('#tb-tit').fill('Festa de 15 anos da Lu');
  await p.locator('#tb-cli').fill('Família Nogueira');
  await p.locator('#tb-tipo').selectOption('Festa e evento');
  await p.locator('#tb-funcs .chip').first().click();
  await p.locator('#tb-ok').click(); await p.waitForTimeout(400);
  const novo=await p.evaluate(()=>TRABALHOS.find(x=>x.titulo==='Festa de 15 anos da Lu'));
  t(novo&&novo.tipo==='Festa e evento','o tipo escolhido chega no trabalho: '+(novo&&novo.tipo));
  t(await p.locator('#pf-lista .pfi').first().textContent().then(x=>/Festa e evento/.test(x)),'e aparece no cartão');

  /* ---- funções: já eram opções, conferindo que continuam ---- */
  await p.evaluate(()=>{fecharEditorTrab&&fecharEditorTrab();show('cadastro')}); await p.waitForTimeout(400);
  const chipsF=await p.locator('#cd-func .chip').count();
  const chipsT=await p.locator('#cd-nicho .chip').count();
  t(chipsF===cat.funcoes,'funções são chips do catálogo: '+chipsF);
  t(chipsT===cat.tipos.length,'tipos são chips do catálogo: '+chipsT);
  t(await p.locator('#v-cadastro input[type="text"]#cd-func, #v-cadastro input#cd-nicho').count()===0,'nenhum campo de digitar função ou tipo');

  /* "atendo qualquer tipo" existe e conta na completude */
  const antes=await p.evaluate(()=>{EU.nicho=[];EU.todosTipos=false;recalcular();return completude().pct});
  await p.evaluate(()=>{v('cd-todos').checked=true;v('cd-todos').dispatchEvent(new Event('change'))}); await p.waitForTimeout(250);
  const depois=await p.evaluate(()=>completude().pct);
  t(depois>antes,'"atendo qualquer tipo" fecha o item do cadastro: '+antes+'% → '+depois+'%');
  await p.screenshot({path:require('path').join(__dirname,'saida','tp-cadastro.png'),fullPage:true});

  /* perfil de quem aceita tudo mostra isso */
  await p.evaluate(()=>abrirPerfil(CREW.find(c=>c.todosTipos&&!c.me).id)); await p.waitForTimeout(400);
  /* o bloco vive numa aba do perfil; o que importa é ele não estar marcado hidden */
  t(!(await p.locator('#p-nicho-blk').getAttribute('hidden')),'o bloco de tipos aparece para quem aceita tudo');
  t(/qualquer tipo/i.test(await p.locator('#p-nicho').textContent()),'e diz "atende qualquer tipo"');

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const num=s=>+String(s).replace(/\D/g,'');
const entrar=async p=>{
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
};
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  /* ⚠️ O PREÂMBULO É DA PÁGINA, NÃO DO HELPER. Ele morava dentro de
     `entrar()`, e o primeiro bloco desta suíte navega SEM passar por ela —
     resultado: o aviso de primeira visita ficava de pé, interceptava o
     clique, e a suíte estourava 30 segundos depois num seletor que não
     tinha nada a ver com o problema. `addInitScript` vale para todo
     carregamento seguinte DAQUELA página; o lugar é logo após o newPage. */
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });

  /* ---- a conta de R$ 89 não vende mais a taxa reduzida ---- */
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl10').isHidden(),'entrar como contratante não cobra nada — cai no Carona');
  t(await p.evaluate(()=>planoAtual())==='carona','e o plano começa em Carona');
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  const lista=await p.locator('#as-lista').textContent();
  t(!/4%/.test(lista),'o Volante não promete mais 4%: "'+lista.slice(0,60)+'"');
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
  t(await p.evaluate(()=>taxaPct())===6,'assinante comum paga 6%');
  t(await p.evaluate(()=>PREMIUM_PROD)===false,'e não nasce premium');

  /* ---- as três funções aparecem trancadas, não escondidas ---- */
  await p.evaluate(()=>show('minhaprod')); await p.waitForTimeout(400);
  t(await p.locator('#mp-clz').isVisible(),'o bloco de cláusulas aparece mesmo sem premium');
  t(await p.locator('#mp-rel').isVisible(),'o de relatório também');
  t(await p.locator('#mp-prem2').count()===1,'com CTA para o premium nas cláusulas');
  t(await p.locator('#mp-prem3').count()===1,'e no relatório');
  t(await p.locator('#mp-csv').count()===0,'sem premium, o exportar nem existe');
  t(await p.locator('[data-clz]').count()===0,'e não dá para adicionar cláusula');

  /* repetir escala é vitrine trancada: o botão existe e leva ao premium */
  await p.evaluate(()=>{show('jobs');jobAberto=ESCALAS[0].id;drawJobs()}); await p.waitForTimeout(400);
  t(await p.locator('[data-rep]').count()===1,'o botão de repetir escala aparece sem premium');
  await p.locator('[data-rep]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl13').isVisible(),'e clicar abre o premium em vez de esconder o recurso');
  t(await p.locator('#ovl14').isHidden(),'sem abrir a tela de repetir');

  /* ---- a conta do premium é honesta sobre quando não vale ---- */
  const conta=await p.locator('#pm-conta').textContent();
  t(/5\.000/.test(conta),'a tela diz a partir de quanto o premium se paga: "'+conta.slice(0,80)+'"');
  t(/mais barat/.test(conta),'e admite quando o Volante sai mais barato');
  t(num(await p.locator('#pm-valor').textContent())===189,'o preço é R$ 189');

  await p.locator('#pm-ok').click(); await p.waitForTimeout(400);
  await p.locator('#pm-f').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>taxaPct())===4,'premium paga 4%');

  /* ---- cláusulas próprias ---- */
  await p.evaluate(()=>show('minhaprod')); await p.waitForTimeout(400);
  t(await p.locator('[data-clz]').count()===3,'o premium oferece modelos de cláusula');
  await p.locator('[data-clz="0"]').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>CLAUSULAS.length)===1,'adicionar modelo funciona');
  t(await p.locator('[data-clz="0"]').isDisabled(),'e o mesmo modelo não entra duas vezes');
  await p.locator('#mp-clz-t').fill('Exclusividade na praça');
  await p.locator('#mp-clz-d').fill('O contratado não presta serviço para concorrente direto do cliente final por 30 dias.');
  await p.locator('#mp-clz-add').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>CLAUSULAS.length)===2,'cláusula própria entra na lista');
  await p.locator('[data-clzx="0"]').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>CLAUSULAS.map(c=>c.t).join())==='Exclusividade na praça','e dá para remover');

  /* ---- relatório de custo ---- */
  t(await p.locator('#mp-rel .plg').count()>0,'o relatório lista as funções');
  const somaRel=await p.evaluate(()=>relatorioCusto().total);
  const somaJobs=await p.evaluate(()=>ESCALAS.filter(e=>!jobCancelado(e.id)).reduce((s,e)=>s+totalEsc(e),0));
  t(somaRel===somaJobs,'e o total bate com a soma das escalas: '+somaRel);
  const csv=await p.evaluate(()=>csvCusto().split('\n'));
  const pessoas=await p.evaluate(()=>ESCALAS.filter(e=>!jobCancelado(e.id)).reduce((s,e)=>s+e.equipe.length,0));
  t(csv.length===pessoas+1,'o CSV tem uma linha por pessoa por job, mais o cabeçalho: '+csv.length);
  t(/job;data;pessoa;funcao;valor;forma/.test(csv[0].replace(/"/g,'')),'com cabeçalho nomeado: '+csv[0]);
  await p.locator('#mp-csv').click(); await p.waitForTimeout(250);
  t(/não baixa/.test(await p.locator('#mp-csv-n').textContent()),
    'e a tela avisa que no protótipo o arquivo não baixa, em vez de fingir que baixou');

  /* ---- a cláusula entra no contrato do job novo ---- */
  await p.evaluate(()=>{const o=CREW.find(c=>c.gar&&!c.me);show('equipe');VAGAS=[{id:1,func:'Editor',quem:EU.id},{id:2,func:o.func[0],quem:o.id}];drawEquipe()});
  await p.waitForTimeout(300);
  await p.locator('#e-fechar').click(); await p.waitForTimeout(500);
  t(await p.locator('#fe-tx').textContent()==='4','o fechamento cobra a taxa do premium');
  await p.locator('#fe-ok').click(); await p.waitForTimeout(500);
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);
  const job=await p.evaluate(()=>ESCALAS[ESCALAS.length-1]);
  t(job.clausulas.length===1,'o job guarda as cláusulas do momento em que foi fechado');
  await p.evaluate(id=>{show('jobs');jobAberto=id;drawJobs()},job.id); await p.waitForTimeout(400);
  await p.locator('.ctl [data-ctr]').first().click(); await p.waitForTimeout(350);
  t(/Exclusividade na praça/.test(await p.locator('#ct2-doc').textContent()),'e ela aparece no contrato');
  await p.locator('#ct2-x').click(); await p.waitForTimeout(250);

  /* o contrato não pode mudar depois: tirar a cláusula não mexe no job fechado */
  await p.evaluate(()=>{CLAUSULAS.length=0});
  await p.locator('.ctl [data-ctr]').first().click(); await p.waitForTimeout(350);
  t(/Exclusividade na praça/.test(await p.locator('#ct2-doc').textContent()),
    'contrato já emitido não muda quando a cláusula sai do perfil');
  await p.locator('#ct2-x').click(); await p.waitForTimeout(250);

  /* ---- escala recorrente ---- */
  await p.locator('[data-rep]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl14').isVisible(),'com premium, repetir abre a tela certa');
  t(await p.locator('#rp-datas .clzl').count()===1,'começa propondo uma repetição');
  await p.locator('#rp-qtd').selectOption('3'); await p.waitForTimeout(300);
  t(await p.locator('#rp-datas .clzl').count()===3,'e recalcula quando muda a quantidade');
  const antes=await p.evaluate(()=>ESCALAS.length);
  await p.locator('#rp-ok').click(); await p.waitForTimeout(500);
  const novos=await p.evaluate(n=>ESCALAS.slice(n).map(e=>({off:e.off,ass:e.equipe.every(x=>!x.assProd&&!x.assFreela),eq:e.equipe.length})),antes);
  t(novos.length===3,'cria os três jobs');
  t(novos.every(x=>x.ass),'e nenhum nasce assinado — contrato de um não vale para o outro');
  t(new Set(novos.map(x=>x.off)).size===3,'em datas diferentes: '+novos.map(x=>x.off).join(', '));
  t(novos.every(x=>x.eq===job.equipe.length),'com a mesma equipe');
  const semSinal=await p.evaluate(n=>{
    const offs=ESCALAS.slice(n).map(e=>e.off);
    return !PAGOS.some(pg=>offs.includes(pg.off));
  },antes);
  t(semSinal,'e sem cobrar sinal nenhum — cada escala tem o próprio fechamento');
  await p.locator('#rp-f').click(); await p.waitForTimeout(300);

  /* ---- voltar para a conta de R$ 89 ---- */
  await p.evaluate(()=>show('minhaprod')); await p.waitForTimeout(400);
  await p.locator('#mp-baixar').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>taxaPct())===6,'voltando para R$ 89 a taxa sobe de novo');
  t(await p.locator('#mp-prem').count()===1,'e o convite do premium volta');

  /* ---- a home mostra os quatro planos ---- */
  await p.evaluate(()=>show('home')); await p.waitForTimeout(300);
  t(await p.locator('#h-planos .plano').count()===6,'a home tem os seis planos (três de cada lado)');
  t(await p.locator('#h-planos .plsep').count()===2,'separados entre quem é freela e quem contrata');
  const planos=await p.locator('#h-planos').textContent();
  t(/R\$\s*189/.test(planos),'com o premium do contratante');
  t(/5\.000/.test(planos),'e a conta de quando ele compensa');
  t(!/posição na busca/.test(planos)||/Nada em nenhum plano compra posição/.test(planos),
    'nenhum plano vende posição na busca');

  /* ---- mobile ---- */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  const ovHome=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ovHome<=1,'planos sem overflow horizontal no mobile: '+ovHome);
  await entrar(p);
  await p.evaluate(()=>{PREMIUM_PROD=true;show('minhaprod');pintarProd()}); await p.waitForTimeout(400);
  const ovPerfil=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ovPerfil<=1,'perfil premium sem overflow no mobile: '+ovPerfil);
  await p.screenshot({path:path.join(__dirname,'saida','premium-mobile.png'),fullPage:true});

  t(!errs.length,'sem erro de JS no fluxo inteiro');
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

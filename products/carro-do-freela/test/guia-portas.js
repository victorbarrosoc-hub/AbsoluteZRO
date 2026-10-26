/* O GUIA DAS QUATRO PORTAS
 *
 * Pedido de um testador, e ele foi específico sobre onde: *"seria
 * interessante ter uma espécie de guia mostrando como navegar entre as
 * abas"* — não no cadastro, *"depois, quando cê tem acesso à plataforma
 * mesmo"*.
 *
 * O que esta suíte protege:
 *   1. ele aparece UMA vez, depois do cadastro, e não volta sozinho;
 *   2. ele NÃO PRENDE ninguém — sai por fora, e o cadastro tinha acabado
 *      de ser encurtado justamente para não prender;
 *   3. as portas LEVAM: cada uma abre a tela de verdade, inclusive a
 *      carteira, que não é tela e sim painel dentro do brechó;
 *   4. o conteúdo muda com o lado da conta, porque a conta é uma só;
 *   5. quem dispensou reabre pelo menu — "dispensável" não pode virar
 *      "perdido".
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
/* ⚠️ SEM `cdf-entrou`: o guia mora no fim do cadastro de quem entra pela
   primeira vez. Com a marca de já ter entrado, o login pula o cadastro e
   não há guia nenhum para medir. */
const PRE=p=>p.addInitScript(() => { try {
  localStorage.setItem('cdf-pv','1');   /* o aviso nao intercepta clique */
  localStorage.removeItem('cdf-entrou');
  localStorage.removeItem('cdf-guia');
  localStorage.removeItem('cdf-uso');
} catch(e) {} });
const cadastrar=async(p,lado)=>{
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="'+lado+'"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(900);
  if(lado==='freela'){
    await p.locator('#cd-nome').fill('Teste da Silva');
    await p.locator('#cd-cidade').selectOption('Natal/RN'); await p.waitForTimeout(200);
    await p.locator('.stp[data-st="2"]').click(); await p.waitForTimeout(300);
    await p.locator('#cd-func [data-cf]').first().click(); await p.waitForTimeout(200);
    await p.locator('#cd-fim2').click();
  }
  await p.waitForTimeout(1600);
};

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const errs=[];
  const nova=async(w,h)=>{
    const c=await b.newContext({viewport:{width:w||1280,height:h||900},deviceScaleFactor:2});
    const p=await c.newPage();
    p.on('pageerror',e=>errs.push('ERR: '+e.message));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await PRE(p);
    return {c,p};
  };

  /* ============ ele aparece no fim do cadastro ============ */
  let {c,p}=await nova();
  await cadastrar(p,'freela');
  t(await p.locator('#ovl-guia').isVisible(),'o guia aparece depois do cadastro');
  t(await p.evaluate(()=>S.tab)==='feed','com o feed já pintado atrás — guia sobre tela em branco não mostra para onde as portas levam');
  const portas=await p.locator('#qp-portas .prt').count();
  t(portas===4,'com QUATRO portas, não as dez telas: '+portas);
  const tits=await p.locator('#qp-portas .prt b').allTextContents();
  t(/livre/i.test(tits[0]),'a primeira é aparecer livre — é o que faz a consulta chegar: "'+tits[0]+'"');
  t(/consulta/i.test(tits[1]),'a segunda é a consulta chegando: "'+tits[1]+'"');
  t(/job/i.test(tits[2]),'a terceira é o dia do job: "'+tits[2]+'"');
  t(/dinheiro/i.test(tits[3]),'e a quarta é o dinheiro: "'+tits[3]+'"');
  const nums=await p.locator('#qp-portas .prt em').allTextContents();
  t(nums.join('')==='1234','numeradas, porque a ordem é o ciclo de verdade e não enfeite');

  /* ⚠️ o aviso empilhado foi um defeito real: no celular os avisos ancoram
     no PÉ da tela, que é onde ficam os botões de dispensar */
  t(await p.locator('#avisos').evaluate(e=>getComputedStyle(e).display)==='none',
    'enquanto o guia está aberto os avisos saem da frente — no celular eles cobriam os botões');
  t(!await p.locator('#avisos .avz').filter({hasText:'Perfil criado'}).count(),
    'e o aviso "Perfil criado" nem chega a sair: ele diz o mesmo que o guia');

  /* ---- não prende ---- */
  await p.locator('#ovl-guia').click({position:{x:5,y:5}}); await p.waitForTimeout(350);
  t(!await p.locator('#ovl-guia').isVisible(),'um toque fora dispensa — guia que só sai pelo botão é tour disfarçado');
  t(await p.locator('#avisos').evaluate(e=>getComputedStyle(e).display)!=='none',
    'e os avisos voltam para o lugar deles');
  t(await p.evaluate(()=>{
    try{ return localStorage.getItem('cdf-guia')==='1' }catch(e){ return false }
  }),'dispensar marca que já foi visto');

  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(600);
  t(await p.locator('#ovl-guia').isHidden(),'e ele não volta a aparecer sozinho');
  await c.close();

  /* ============ as portas LEVAM ============ */
  ({c,p}=await nova());
  await cadastrar(p,'freela');
  await p.locator('#qp-portas .prt').nth(0).click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>S.tab)==='agenda','a porta 1 abre a agenda de verdade');
  t(!await p.locator('#ovl-guia').isVisible(),'e o guia sai junto');
  await p.evaluate(()=>abrirGuia()); await p.waitForTimeout(400);
  await p.locator('#qp-portas .prt').nth(1).click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>S.tab)==='propostas','a porta 2 abre a caixa de propostas');
  await p.evaluate(()=>abrirGuia()); await p.waitForTimeout(400);
  await p.locator('#qp-portas .prt').nth(2).click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>S.tab)==='jobs','a porta 3 abre meus jobs');
  /* ⚠️ A CARTEIRA NÃO É UMA TELA: ela mora dentro do brechó, no painel
     "vender". `show("brecho")` sozinho cairia no catálogo — e a carteira é
     justamente a porta menos descobrível, que é por que ela está aqui. */
  await p.evaluate(()=>abrirGuia()); await p.waitForTimeout(400);
  await p.locator('#qp-portas .prt').nth(3).click(); await p.waitForTimeout(600);
  t(await p.evaluate(()=>S.tab)==='brecho'&&await p.evaluate(()=>BPANEL)==='vender',
    'a porta 4 abre a CARTEIRA, não o catálogo do brechó');
  t(await p.locator('#ct-duas').count()===1,'que é onde as duas moedas são explicadas lado a lado');

  /* ---- volta pelo menu ---- */
  await p.evaluate(()=>abrirGaveta()); await p.waitForTimeout(350);
  /* desde 17/out · 10 a porta de volta mora em Ajuda, recolhida */
  { const ab=p.locator('#gaveta [data-sanf="ajuda"] .mn-abre'); if(await ab.getAttribute('aria-expanded')!=='true'){ await ab.click(); await p.waitForTimeout(250) } }
  t(await p.locator('#g-guia').isVisible(),'o guia tem porta de volta no menu, em Ajuda');
  await p.locator('#g-guia').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl-guia').isVisible(),'e reabre por ali — "dispensável" não pode virar "perdido"');
  /* ⚠️ o outro botão FAZ outra coisa: ele nasceu duplicando o "Entendi",
     dois botões lado a lado oferecendo uma escolha que não existia */
  await p.locator('#qp-menu').click(); await p.waitForTimeout(450);
  t(!await p.locator('#ovl-guia').isVisible()&&await p.locator('#gaveta').evaluate(e=>e.classList.contains('on')),
    '"Abrir o menu" abre o menu inteiro — não é um segundo botão de fechar');
  await p.evaluate(()=>fecharGaveta()); await p.waitForTimeout(250);

  /* ============ o outro lado da conta ============ */
  await p.evaluate(()=>{MODO='contratante';aplicarModo();abrirGuia()}); await p.waitForTimeout(450);
  const tc=await p.locator('#qp-portas .prt b').allTextContents();
  t(tc.length===4,'quem contrata também tem quatro');
  t(tc.join(' | ')!==tits.join(' | '),'e são OUTRAS quatro — a conta é uma só, mas o ciclo não é o mesmo');
  t(/livre/i.test(tc[0]),'começa por ver quem está livre, que é o que o Volante abre: "'+tc[0]+'"');
  t(/escala/i.test(tc[1]),'depois montar a escala: "'+tc[1]+'"');
  t(/contrato|sinal/i.test(tc[2]),'depois fechar com contrato e sinal: "'+tc[2]+'"');
  await p.locator('#qp-portas .prt').nth(0).click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>S.tab)==='buscar','e a primeira porta dela abre "Quem tá na escuta"');
  await c.close();

  /* ============ celular pequeno: os botões precisam caber ============
     ⚠️ 667px é o iPhone SE, e a primeira versão do guia passava disso: as
     descrições tinham três linhas, os botões caíam abaixo da dobra e os
     avisos cobriam o pé. Guia que precisa de rolagem para ser dispensado
     não é dispensável. */
  ({c,p}=await nova(390,667));
  await cadastrar(p,'freela');
  t(await p.locator('#ovl-guia').isVisible(),'no iPhone SE ele aparece');
  /* ⚠️ ESTA ASSERÇÃO JÁ PASSOU MEDINDO NADA: ela lia um id que tinha sido
     renomeado, o rect vinha zerado e `0 <= 667` passava alegremente. Por
     isso ela exige que o fundo seja MAIOR que zero antes de caber. */
  const cabe=await p.evaluate(()=>{
    const el=document.getElementById('qp-ok');
    const r=el?el.getBoundingClientRect():{bottom:0};
    return {fundo:Math.round(r.bottom),tela:innerHeight,achou:!!el};
  });
  t(cabe.achou,'o botão de dispensar existe com o id que o guia usa');
  t(cabe.fundo>0&&cabe.fundo<=cabe.tela,'e cabe na tela sem rolar: '+cabe.fundo+' de '+cabe.tela);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal: '+ov);
  await p.screenshot({path:path.join(__dirname,'saida','guia-portas.png')});
  await c.close();

  await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();

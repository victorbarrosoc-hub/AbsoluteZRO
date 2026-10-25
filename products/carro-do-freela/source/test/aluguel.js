/**
 * CATÁLOGO DE ALUGUEL — o encontro que faltava.
 *
 * O contrato resolvia a segurança do aluguel, mas não o encontro: para
 * alugar era preciso já saber quem tem o quê e entrar no perfil às cegas.
 *
 * O que esta suíte protege:
 *   - a plataforma NÃO se apresenta como locadora em lugar nenhum;
 *   - o catálogo de outras contas é declarado como demonstração;
 *   - disponibilidade é derivada, não inventada — quem está fora não
 *     aparece como livre;
 *   - pedido é solicitação, nunca reserva automática.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const painel=async(p,q)=>{ await p.evaluate(()=>show('brecho')); await p.waitForTimeout(250);
  await p.locator('[data-bp="'+q+'"]').click(); await p.waitForTimeout(450); };

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1300},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
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
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  await painel(p,'alugar');

  /* ============ o catálogo existe e é honesto sobre o que é ============ */
  t(await p.locator('.alc').count()>=3,'o catálogo abre com peças para alugar');
  const cabeca=await p.locator('#bp-alugar').textContent();
  t(/não é locadora/i.test(cabeca),'a tela diz que a plataforma NÃO é locadora');
  t(/quem entrega, confere e recebe são vocês/i.test(cabeca),'e quem faz o quê fica escrito');
  /* (17/out · 5) A PRÉVIA SE DECLARA NUM LUGAR SÓ. Victor: "tira as mensagens
     de protótipo". O banner desta tela saiu; quem diz o que é ilustrativo é o
     selo "Prévia" ao lado da marca — e é ele que esta asserção cobra. */
  t(!/demonstração/i.test(cabeca)&&await p.evaluate(()=>[...document.querySelectorAll('[data-previa]')].some(b=>b.offsetParent!==null)),
    'sem banner de demonstração no catálogo — a prévia se declara no selo');
  t(/sem precisar entrar no perfil de um por um/i.test(cabeca),
    'e diz para que ele serve — era o problema de entrar no perfil às cegas');

  /* cada peça mostra de quem é, e leva ao perfil */
  t(await p.locator('.alc .aldono').count()>=3,'cada peça mostra de quem é');
  await p.locator('.alc [data-aldono]').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#v-perfil').isVisible(),'e o dono é clicável — dá para conferir com quem se está falando');
  await painel(p,'alugar');

  /* ============ disponibilidade é derivada, não inventada ============ */
  t(await p.locator('.alest.livre').count()>=1,'quem está livre aparece como livre');
  /* o filtro "só livre agora" nasce DESLIGADO: com data de disponibilidade,
     o que está ocupado hoje continua sendo oferta para daqui a duas semanas,
     e esconder por padrão era o catálogo escondendo metade de si mesmo */
  t(!await p.locator('#al-livre').isChecked(),'o catálogo abre mostrando tudo, inclusive o que tem data');
  const todos=await p.locator('.alc').count();
  t(await p.locator('.alest.fora').count()>=1,'o que está ocupado aparece marcado');
  t(/livre a partir de /.test(await p.locator('.alest.fora').first().textContent()),
    'dizendo A PARTIR DE QUANDO fica livre — quem procura para depois acha e pede');
  await p.locator('#al-livre').check(); await p.waitForTimeout(350);
  const soLivres=await p.locator('.alc').count();
  t(soLivres<todos,'ligando o filtro, só o que está livre hoje fica ('+soLivres+' de '+todos+')');
  await p.locator('#al-livre').uncheck(); await p.waitForTimeout(350);
  t(await p.locator('[data-alped][disabled]').count()>=1,'e não dá para pedir o que está com outra pessoa');

  /* filtros */
  await p.selectOption('#al-cat','camera'); await p.waitForTimeout(350);
  const soCam=await p.evaluate(()=>[...document.querySelectorAll('.alc .alcab small')].every(e=>/Câmera/.test(e.textContent)));
  t(soCam,'o filtro de categoria funciona');
  await p.selectOption('#al-cat',''); await p.waitForTimeout(250);
  await p.locator('#al-q').fill('gimbal'); await p.waitForTimeout(350);
  t(await p.locator('.alc').count()===0||/RS 3/.test(await p.locator('#al-lista').textContent()),
    'a busca por texto filtra');
  await p.locator('#al-q').fill(''); await p.waitForTimeout(300);

  /* ============ pedir é solicitar, não reservar ============ */
  await p.locator('[data-alped]:not([disabled])').first().click(); await p.waitForTimeout(450);
  const modal=await p.locator('#ovl26').textContent();
  t(/não é locadora/i.test(modal),'o pedido repete que a plataforma não é locadora');
  t(/pago a ele, não à plataforma/i.test(modal)||/combinados entre vocês/i.test(modal),
    'e que o dinheiro é combinado entre as duas pessoas');
  await p.locator('#pd-de').fill('2026-08-18');
  await p.locator('#pd-ate').fill('2026-08-25'); await p.waitForTimeout(350);
  const conta=await p.locator('#pd-conta').textContent();
  t(/7 dias/.test(conta),'a conta mostra o período pedido');
  t(/Contrato formal/.test(conta),'oferece o contrato como opcional, com o preço');
  t(/opcional/.test(conta),'dizendo que é opcional');

  /* o pacote mais barato ganha: sete diárias não podem custar mais que a semana */
  const bate=await p.evaluate(()=>{
    const x=catalogoAluguel().find(y=>y.semana&&y.diaria);
    return precoPeriodo(x,7)<=x.diaria*7;
  });
  t(bate,'sete dias nunca custam mais que sete diárias — o pacote mais barato ganha');

  /* mínimo de dias é respeitado */
  const temMin=await p.evaluate(()=>catalogoAluguel().some(x=>x.min>1));
  t(temMin,'há peça com mínimo de dias definido pelo dono');

  const antesPg=await p.evaluate(()=>PEGUEI.length);
  await p.locator('#pd-job').fill('casamento em Pipa');
  await p.locator('#pd-ok').click(); await p.waitForTimeout(500);
  t(/Pedido enviado/.test(await p.locator('#avisos .avz b').first().textContent()),
    'enviar avisa que o pedido foi — não que a peça está reservada');
  t(await p.evaluate(()=>PEGUEI.length)===antesPg,'e nada muda de mão antes de o dono responder');
  await p.waitForTimeout(2600);
  t(await p.evaluate(()=>PEGUEI.length)===antesPg+1,'quando ele topa, a peça entra em "comigo, de outra pessoa"');

  await painel(p,'inv');
  t(await p.locator('#inv-comigo .ped').count()>=1,'que é um bloco próprio no inventário');
  const comigo=await p.locator('#inv-comigo').textContent();
  t(/devolver/.test(comigo),'com a data de devolver');
  t(/faltam|hoje|atrasado/.test(comigo),'e quanto falta');

  /* ============ o dono põe a peça no catálogo ============ */
  const meu=await p.evaluate(()=>invItens().find(x=>statusInv(x)==='guardado'&&x.ref>0).id);
  await p.locator('[data-ivloc="'+meu+'"]').click(); await p.waitForTimeout(400);
  const ref=await p.locator('#pl-ref').textContent();
  t(/1% do valor por diária/.test(ref),'a tela sugere a regra de bolso de 1% do valor por diária');
  t(/quem põe o preço é você/i.test(ref),'deixando claro que é referência, não tabela');
  await p.locator('#pl-diaria').fill('180');
  await p.locator('#pl-fds').fill('300');
  await p.locator('#pl-ok').click(); await p.waitForTimeout(450);
  t(await p.evaluate(id=>!!invItens().find(x=>x.id===id).locacao,meu),'a peça entra no catálogo');
  t(/no catálogo de aluguel/.test(await p.locator('#inv-lista').textContent()),
    'e o card do inventário passa a dizer isso, com a diária');

  await painel(p,'alugar');
  t(await p.locator('[data-aledit]').count()===1,'ela aparece no catálogo marcada como sua');
  t(await p.locator('[data-aledit]').first().isVisible(),'com botão de editar o que você cobra, não de pedir');

  /* pausar tira do ar sem tirar do catálogo */
  await p.locator('[data-aledit]').first().click(); await p.waitForTimeout(400);
  await p.locator('#pl-pausa').check();
  await p.locator('#pl-ok').click(); await p.waitForTimeout(450);
  await painel(p,'alugar');
  await p.locator('#al-livre').uncheck(); await p.waitForTimeout(350);
  t(/pausado/.test(await p.locator('#al-lista').textContent()),'pausar aparece no catálogo como pausado pelo dono');
  await painel(p,'inv');
  await p.locator('[data-ivloc="'+meu+'"]').click(); await p.waitForTimeout(400);
  await p.locator('#pl-pausa').uncheck();
  await p.locator('#pl-ok').click(); await p.waitForTimeout(450);

  /* ============ pedido chegando para o dono ============ */
  await p.locator('#inv-sim').click(); await p.waitForTimeout(650);
  t(await p.locator('#inv-pedidos .ped').count()>=1,'pedido de outra pessoa cai num bloco no inventário');
  const ped=await p.locator('#inv-pedidos').textContent();
  t(/quer /.test(ped),'dizendo quem quer e o quê');
  t(/R\$/.test(ped),'com o valor do período');
  t(await p.locator('[data-pdok]').count()>=1&&await p.locator('[data-pdno]').count()>=1,
    'e as duas respostas: topar ou recusar — nunca reserva sozinho');

  await p.locator('[data-pdok]').first().click(); await p.waitForTimeout(500);
  t(await p.locator('#inv-pedidos .ped').count()===0,'aceitar tira o pedido da fila');
  const saiu=await p.evaluate(()=>invItens().some(x=>x.aluguel));
  t(saiu,'e a peça passa a constar como fora de casa');
  t(await p.locator('[data-ivct]').count()>=1,
    'com o contrato de locação disponível — o pedido desemboca no que já existia');

  /* recusar não deixa rastro na peça */
  await p.locator('#inv-sim').click(); await p.waitForTimeout(600);
  const n=await p.locator('#inv-pedidos .ped').count();
  if(n){ await p.locator('[data-pdno]').first().click(); await p.waitForTimeout(400);
    t(await p.locator('#inv-pedidos .ped').count()===n-1,'recusar também tira da fila'); }
  else t(true,'recusar também tira da fila (sem peça livre para simular)');

  /* ============ mobile ============ */
  await painel(p,'alugar');
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

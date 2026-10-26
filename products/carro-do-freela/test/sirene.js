/* A SIRENE — a chamada que toma a tela, como corrida de aplicativo.
 *
 * O que esta suíte jura:
 * 1. A sirene NÃO muda o contrato: é a MESMA corrida e a MESMA proposta
 *    na caixa — aceitar vira job pelo caminho de sempre.
 * 2. Ninguém fica preso: "decidir com calma" fecha a tela e a chamada
 *    segue viva; expirar mata a URGÊNCIA, nunca a chamada.
 * 3. A contagem é DERIVADA de prop.ate — relógio não se guarda.
 * 4. prefers-reduced-motion desliga o pulso e mantém o número.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
  localStorage.removeItem('cdf-uso');
}catch(e){} });

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await PRE(p);
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.evaluate(()=>show('propostas'));

  /* ============ a sirene abre e diz tudo ============ */
  await p.click('#pp-sir'); await p.waitForTimeout(500);
  let m=await p.evaluate(()=>({
    aberta:!v('sirena').hidden,
    demo:!!v('sr-demo'),
    func:v('sr-func').textContent,
    seg:+v('sr-seg').textContent,
    srp:v('sr-ring').style.getPropertyValue('--srp'),
    okTem:v('sr-ok').textContent.includes('R$'),
    conc:v('sr-conc').textContent,
    ateFuturo:sirProp.ate>Date.now(),
    pulso:getComputedStyle(document.querySelector('.sranel i')).animationName
  }));
  t(m.aberta,'a sirene toma a tela');
  t(!m.demo,'sem rótulo de demonstração por cima da chamada — a prévia se declara no selo (17/out · 5)');
  t(m.func.length>2,'a função está na cara: '+m.func);
  t(m.seg>=118&&m.seg<=120,'a contagem parte de ~120s: '+m.seg);
  t(m.srp!=='','o anel de tempo está pintado por --srp');
  t(m.okTem,'o botão de aceitar carrega o valor');
  t(/primeiro que aceitar leva/.test(m.conc),'a corrida está dita: '+m.conc);
  t(m.ateFuturo,'o prazo mora na PROPOSTA (prop.ate), não num timer solto');
  t(m.pulso!=='none','o pulso anima quando movimento é permitido');

  /* ============ decidir com calma NÃO mata a chamada ============ */
  await p.click('#sr-dep'); await p.waitForTimeout(300);
  m=await p.evaluate(()=>({
    fechada:v('sirena').hidden,
    status:PROPOSTAS[0].status,
    naCaixa:!!document.querySelector('#pp-lista .pcard, #pp-lista [data-ac]'),
    ateVivo:PROPOSTAS[0].ate>Date.now()
  }));
  t(m.fechada,'"decidir com calma" fecha a tela');
  t(m.status==='novo','e a chamada continua NOVA na caixa');
  t(m.naCaixa,'com o card dela visível em Propostas');
  t(m.ateVivo,'e o relógio dela continua contando — derivado, não zerado');

  /* ============ recusar pelo atalho leva o motivo junto ============ */
  await p.click('#pp-sir'); await p.waitForTimeout(400);
  await p.locator('[data-srm]').first().click(); await p.waitForTimeout(250);
  m=await p.evaluate(()=>({fechada:v('sirena').hidden,st:PROPOSTAS[0].status,mot:PROPOSTAS[0].motivo||''}));
  t(m.fechada&&m.st==='recusada','o atalho de motivo recusa e fecha');
  t(m.mot.includes('job'),'e o motivo é o do chip, não um genérico: '+m.mot);

  /* ============ recusar seco também é resposta ============ */
  await p.click('#pp-sir'); await p.waitForTimeout(400);
  await p.click('#sr-nao'); await p.waitForTimeout(250);
  m=await p.evaluate(()=>({st:PROPOSTAS[0].status,mot:PROPOSTAS[0].motivo||''}));
  t(m.st==='recusada'&&m.mot.includes('sirene'),'recusar seco registra que foi pela sirene');

  /* ============ aceitar vira job PELO CAMINHO DE SEMPRE ============ */
  const antes=await p.evaluate(()=>JOBS.length);
  await p.click('#pp-sir'); await p.waitForTimeout(400);
  await p.click('#sr-ok'); await p.waitForTimeout(350);
  m=await p.evaluate(()=>({st:PROPOSTAS[0].status,jobs:JOBS.length,fechada:v('sirena').hidden}));
  t(m.st==='aceita','aceitar aceita a proposta de verdade');
  t(m.jobs===antes+1,'e o job nasce pelo viraJob de sempre — sirene não tem caminho próprio');
  t(m.fechada,'com a tela fechando na hora');

  /* ============ expirar mata a urgência, não a chamada ============ */
  await p.click('#pp-sir'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ sirProp.ate=Date.now()+350 });
  await p.waitForTimeout(1100);
  m=await p.evaluate(()=>({
    fechada:v('sirena').hidden,
    st:PROPOSTAS[0].status,
    aviso:[...document.querySelectorAll('#avisos .avz')].map(a=>a.textContent).join(' | ')
  }));
  t(m.fechada,'expirou: a tela se fecha sozinha');
  t(m.st==='novo','a chamada segue NOVA na caixa — expirar não decide por ninguém');
  t(/sirene passou/i.test(m.aviso),'e o aviso diz onde ela continua: '+m.aviso.slice(0,60));

  /* ============ a corrida fechando embaixo da sirene ============ */
  await p.click('#pp-sir'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ sirProp.status='perdida' });
  await p.waitForTimeout(600);
  t(await p.evaluate(()=>v('sirena').hidden),'se outro leva a vaga, a sirene sai da frente');

  /* ============ o lado de quem chama ============ */
  /* Passar o carro é tela do Volante: destrancar é passo explícito da
     suíte, como em chamada.js — a tranca em si é assunto de acesso-a-agenda */
  await p.evaluate(()=>{ MODO='contratante'; aplicarModo() });
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
  await p.evaluate(()=>show('passar'));
  await p.waitForTimeout(300);
  m=await p.evaluate(()=>({
    toggle:!!v('u-sirene'),
    rotulo:(v('u-sirene').closest('label')||{}).textContent||''
  }));
  t(m.toggle,'o toggle da sirene existe em Passar o carro');
  t(/agora/.test(m.rotulo)&&/2 minutos/.test(m.rotulo),'e o rótulo diz o que ela faz e por quanto tempo');

  const podeEnviar=await p.evaluate(()=>!v('u-send').disabled);
  if(podeEnviar){
    await p.evaluate(()=>{ v('u-sirene').checked=true });
    await p.click('#u-send'); await p.waitForTimeout(400);
    m=await p.evaluate(()=>({
      sir:CHAMADA.sirene,
      nota:v('u-result').textContent,
      trava:v('u-sirene').disabled
    }));
    t(m.sir===true,'a chamada carrega a sirene');
    t(/Sirene ligada/.test(m.nota),'e a tela de quem mandou diz que ela está tomando telas');
    t(m.trava,'o toggle trava enquanto a corrida roda — como os outros campos');
    /* com sirene, os simulados respondem mais rápido: em ~4s a corrida anda */
    await p.waitForTimeout(4200);
    const resp=await p.evaluate(()=>Object.values(CHAMADA.resp).filter(x=>x!=='aguardando').length);
    t(resp>0,'a urgência compra resposta: '+resp+' já responderam em 4s');
  } else {
    t(false,'ninguém na escuta no dia padrão — a sonda do lado contratante não rodou');
  }

  /* ============ reduced-motion: sem pulso, com número ============ */
  const ctx2=await b.newContext({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
  const p2=await ctx2.newPage(); await PRE(p2);
  await p2.goto(URL,{waitUntil:'networkidle'});
  await p2.evaluate(()=>show('propostas'));
  await p2.click('#pp-sir'); await p2.waitForTimeout(500);
  m=await p2.evaluate(()=>({
    pulso:getComputedStyle(document.querySelector('.sranel i')).animationName,
    seg:+v('sr-seg').textContent
  }));
  t(m.pulso==='none','reduced-motion desliga o pulso');
  t(m.seg>0,'e a contagem continua em número — informação não é enfeite');
  await ctx2.close();

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('SIRENE');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

/**
 * TEMPO REAL — os dois avisos que existem para quem NÃO está olhando.
 *
 * Contratante passou o carro e voltou a trabalhar; freela nem sabe que a
 * chamada existe. Nos dois casos o par é som + aviso flutuante, e o aviso
 * tem que levar para a tela certa com um clique.
 *
 * Também cobre a travessia do carro, que ficou linear: a curva entre
 * quadros intermediários fazia o carro frear no meio da pista.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
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

  /* ============ a travessia não freia mais no meio ============ */
  await p.evaluate(()=>{ v('pista').classList.add('on') });
  const vel=await p.evaluate(()=>new Promise(res=>{
    const el=document.querySelector('#pista .carro'), xs=[], t0=performance.now();
    const laco=()=>{ xs.push([performance.now()-t0, el.getBoundingClientRect().x]);
      if(performance.now()-t0<1300) requestAnimationFrame(laco); else res(xs); };
    requestAnimationFrame(laco);
  }));
  /* Comparar posição contra a reta, e não velocidade instantânea.
     Medido contra o build anterior: 12,8% de desvio, contra ~4% aqui.
     Os 12,8% são o carro ~250px atrás da reta no meio da pista — a
     freada que o Victor viu.

     ⚠️ O MÁXIMO isolado era instável: com a máquina carregada (33 suítes
     em paralelo) o próprio navegador engasga, a animação atrasa em
     relação ao relógio e UM quadro fica 8% fora — três rodadas seguidas
     no mesmo arquivo deram 3,8%, 4,0% e 7,2%. Engasgo de máquina não é
     freada de animação, e a asserção precisa saber a diferença.
     A freada real era SISTEMÁTICA: um trecho inteiro do percurso atrás
     da reta, não um ponto. Então a medida é a MEDIANA do desvio (imune a
     ponto solto) e, como rede de segurança, o teto de quantos pontos
     podem estourar 6% — na freada estouravam muitos. */
  const x0=vel[0][1], xf=vel[vel.length-1][1], tf=vel[vel.length-1][0];
  const curso=Math.abs(xf-x0);
  const devs=vel.map(([ms,x])=>Math.abs(x-(x0+(xf-x0)*ms/tf))/curso).sort((a,b)=>a-b);
  const desvio=devs[Math.floor(devs.length/2)];
  const fora=devs.filter(d=>d>.06).length/devs.length;
  t(desvio<.04,'o carro atravessa em linha reta no tempo (desvio mediano '
    +(desvio*100).toFixed(1)+'%, era 12,8%)');
  t(fora<.15,'e não há trecho parado no meio da pista ('
    +(fora*100).toFixed(0)+'% dos pontos fora, limite 15%)');
  t(vel.every(([,x],i)=>i===0||x>=vel[i-1][1]),'e nunca anda para trás nem para');
  await p.evaluate(()=>{ v('pista').classList.remove('on') });

  /* entra como contratante assinante */
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
  /* espiona quais sons foram disparados */
  await p.evaluate(()=>{window.__s=[];for(const k in SONS){const f=SONS[k];SONS[k]=x=>{window.__s.push(k);return f(x)}}});

  /* ============ contratante: alguém pegou a vaga ============ */
  await p.evaluate(()=>{show('equipe');VAGAS.length=0;
    VAGAS.push({id:1,func:"Op. de câmera",quem:null});drawEquipe()});
  await p.waitForTimeout(350);
  await p.locator('#e-passar').click(); await p.waitForTimeout(600);
  await p.locator('#u-send').click(); await p.waitForTimeout(400);
  t(await p.locator('#pista').isVisible(),'passar o carro atravessa a tela — é onde a chamada sai');

  await p.evaluate(()=>{window.__s=[];document.querySelectorAll('.avz').forEach(e=>e.remove())});
  await p.evaluate(()=>fecharChamada(CHAMADA.ids.find(i=>i!==EU.id))); await p.waitForTimeout(350);
  t(await p.locator('#avisos .avz').count()===1,'quem pegou a vaga vira aviso na tela do contratante');
  t(/pegou a vaga/.test(await p.locator('#avisos .avz b').first().textContent()),
    'dizendo quem pegou, não só que alguém pegou');
  t(await p.evaluate(()=>window.__s.includes("aceitou")),'com som próprio — ele pode estar de costas para a tela');
  t(await p.locator('#avisos .avz.bom').count()===1,'marcado como boa notícia, não como alerta');

  /* o aviso leva para a tela da chamada */
  await p.evaluate(()=>show('jobs')); await p.waitForTimeout(250);
  await p.locator('#avisos .avz').first().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>Object.keys(views).find(k=>!views[k].hidden))==='passar','clicar leva para a chamada');
  t(await p.locator('#avisos .avz').count()===0,'e o aviso sai depois de clicado');

  /* ============ freela: o carro parou na porta ============ */
  await p.evaluate(()=>{window.__s=[];show('propostas')}); await p.waitForTimeout(350);
  const antes=await p.evaluate(()=>PROPOSTAS.length);
  await p.locator('#pp-sim').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>MODO)==='freela','simular chamada põe o chapéu de freela — o aviso é dele');
  t(await p.evaluate(()=>PROPOSTAS.length)===antes+1,'a chamada entra na caixa de propostas');
  t(/passou na sua porta/.test(await p.locator('#avisos .avz b').first().textContent()),
    'e o freela é avisado de que o carro passou na porta dele');
  t(await p.evaluate(()=>window.__s.includes("chegou")),'com o som de batida na porta');
  t(await p.locator('#avisos .avz.chama').count()>=1,'marcado como chamada, não como boa notícia');

  await p.evaluate(()=>show('agenda')); await p.waitForTimeout(250);
  await p.locator('#avisos .avz').first().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>Object.keys(views).find(k=>!views[k].hidden))==='propostas',
    'clicar leva para a caixa, que é onde ele responde');

  /* ============ o aviso não se acumula nem fica para sempre ============ */
  await p.evaluate(()=>{for(let i=0;i<6;i++) simularChamada()}); await p.waitForTimeout(400);
  t(await p.locator('#avisos .avz').count()<=3,'no máximo três avisos empilhados — mais que isso vira parede');
  await p.waitForTimeout(9800);
  t(await p.locator('#avisos .avz').count()===0,'e todos somem sozinhos');

  /* ============ contratante não é avisado da própria chamada ============ */
  await p.evaluate(()=>{MODO='contratante';aplicarModo();window.__s=[];
    chamadaChegou({id:Date.now(),de:"X",contato:"c",data:key(dateAt(S.dia)),ini:"08:00",fim:"18:00",
      func:"Editor",tipo:"Chamada aberta",local:"Natal/RN",desc:"d",equip:true,fora:false,
      valor:800,gar:true,status:"novo",ha:0,concorrentes:3});
  }); await p.waitForTimeout(350);
  t(await p.locator('#avisos .avz').count()===0,
    'de chapéu de contratante ele não é avisado da chamada que ele mesmo mandou');
  t(!(await p.evaluate(()=>window.__s.includes("chegou"))),'e nem ouve o som dela');

  /* ============ som desligado não deixa o aviso mudo ============ */
  await p.evaluate(()=>{SOM=false;MODO='freela';aplicarModo();simularChamada()}); await p.waitForTimeout(350);
  t(await p.locator('#avisos .avz').count()===1,'com o som desligado o aviso continua aparecendo');
  await p.evaluate(()=>{SOM=true});

  /* ============ mobile ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(300);
  await p.evaluate(()=>simularChamada()); await p.waitForTimeout(350);
  const cx=await p.locator('#avisos .avz').first().boundingBox();
  t(cx&&cx.width<=366,'no celular o aviso cabe na tela: '+Math.round(cx.width)+'px');
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

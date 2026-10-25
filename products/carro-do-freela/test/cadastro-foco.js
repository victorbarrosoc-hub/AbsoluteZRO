/* O CADASTRO EM FOCO — uma pergunta por vez, e o carro andando (18/out · 7)
 *
 * Victor: *"Essa experiência de preenchimento dos dados é péssima, muito
 * texto de uma vez, acaba fazendo a pessoa desistir. Seria interessante
 * melhorar a experiência, não sei se fazendo um item de cada vez na tela, no
 * centro da tela em foco e o resto desfocado. Mostrar o progresso que falta
 * pra preencher tudo. Umas frases de impulsionar a pessoa a terminar o
 * cadastramento, um carrinho andando por cada etapa que a pessoa preenche."*
 *
 * O que esta suíte guarda:
 *   - cada pergunta é um cartão com os MESMOS campos de sempre (os ids não
 *     mudam, o dado continua indo para o EU);
 *   - uma pergunta em foco por vez; as outras apagadas e desfocadas, mas
 *     TOCÁVEIS — tocar numa delas traz o foco;
 *   - Enter e "Próxima" levam à pergunta seguinte, e a última da etapa leva
 *     à etapa seguinte;
 *   - a estrada: um ponto por pergunta da porta, o carro andando pelo que
 *     foi RESPONDIDO, e a frase que não promete o que não é;
 *   - a dieta de texto: nenhum parágrafo longo à vista, e a lista do que
 *     falta no perfil recolhida num toque;
 *   - no celular, nada de rolagem lateral.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

async function entrarPelaPorta(b,W,H,mobile){
  const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:!!mobile,hasTouch:!!mobile});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&!/api\.web3forms\.com|ERR_TUNNEL|Failed to load resource/.test(m.text())&&errs.push(m.text()));
  /* sem `cdf-entrou`: é a porta curta de quem chega pela primeira vez */
  await p.addInitScript(()=>{ try{
    localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-guia','1');
    localStorage.removeItem('cdf-entrou'); localStorage.removeItem('cdf-uso');
  }catch(e){} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.evaluate(()=>show('entrar')); await p.waitForTimeout(250);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(120);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(900);
  return {ctx,p,errs};
}
const estado=p=>p.evaluate(()=>{
  const pn=document.querySelector('#v-cadastro .pn:not([hidden])');
  const qs=[...pn.querySelectorAll('.cdq')];
  const on=pn.querySelector('.cdq.on');
  const carro=document.getElementById('cd-via-carro');
  return {
    passo:cdPasso, nq:qs.length, on:on?on.querySelector('.cdq-t').textContent:null,
    onIdx:on?qs.indexOf(on):-1,
    pts:document.querySelectorAll('#cd-via .cdv-pt').length,
    okPts:document.querySelectorAll('#cd-via .cdv-pt.ok').length,
    carro:parseFloat(carro.style.left)||0,
    txt:document.getElementById('cd-via-txt').textContent,
    longe:qs.filter(q=>q!==on).map(q=>{ const c=getComputedStyle(q); return {op:+c.opacity,blur:/blur/.test(c.filter)} })
  };
});

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const {ctx,p,errs}=await entrarPelaPorta(b,1440,900);
  t(await p.evaluate(()=>S.tab)==='cadastro','quem entra pela primeira vez cai no cadastro');

  /* ============ as perguntas são os mesmos campos ============ */
  const est0=await estado(p);
  t(est0.passo===1&&est0.nq===4,'a etapa 1 vira quatro perguntas: nome, praça, WhatsApp e portfólio ('+est0.nq+')');
  const dentro=await p.evaluate(()=>['cd-nome','cd-cidade','cd-viaja','cd-fone','cd-port','cd-func','cd-soft','cd-nicho']
    .every(id=>{ const el=document.getElementById(id); return !!el&&!!el.closest('.cdq') }));
  t(dentro,'⟶⟶ os campos de sempre, com os ids de sempre, moram dentro dos cartões — nada espelhado');
  t(await p.evaluate(()=>document.querySelectorAll('#cd-nome').length===1&&document.querySelectorAll('#cd-func').length===1),'e cada campo existe uma vez só');
  t(est0.on==='Como você se chama?','a primeira pergunta em foco é o nome ("'+est0.on+'")');
  t(est0.longe.length===3&&est0.longe.every(x=>x.op<.5&&x.blur),'⟶⟶ as outras ficam apagadas e desfocadas ('+est0.longe.map(x=>x.op.toFixed(2)).join(' · ')+')');

  /* ⚠️ o desfoque não tira do alcance. A rolagem é `instant` porque o
     `html{scroll-behavior:smooth}` da casa faria o scrollIntoView padrão
     ANDAR, e o toque seria medido no meio do caminho, fora do campo. */
  const alcance=await p.evaluate(()=>{ const el=document.getElementById('cd-fone');
    el.scrollIntoView({block:'center',behavior:'instant'}); const r2=el.getBoundingClientRect();
    const x=document.elementFromPoint(r2.left+r2.width/2,r2.top+r2.height/2); return x===el||el.contains(x) });
  t(alcance,'⟶⟶ mas continuam tocáveis: o campo de uma pergunta apagada recebe o toque');
  await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(200);

  /* ============ a estrada ============ */
  t(est0.pts===7,'a estrada tem um ponto por pergunta da porta curta: '+est0.pts);
  t(est0.okPts===0&&est0.carro<0.5,'com tudo vazio o carro está no começo ('+est0.carro+'%)');
  t(/^0\s*de 7/.test(est0.txt)&&/nome/.test(est0.txt),'e a frase manda começar pelo nome: "'+est0.txt+'"');

  /* responder anda o carro, e o dado chega ao EU */
  await p.locator('#cd-nome').fill('Ana Teste'); await p.waitForTimeout(250);
  const est1=await estado(p);
  t(await p.evaluate(()=>EU.nome)==='Ana Teste','o nome digitado vai para o perfil, como sempre');
  t(est1.okPts===1&&Math.abs(est1.carro-100/7)<0.5,'⟶⟶ respondeu, o carro anda uma parada ('+est1.carro.toFixed(1)+'%)');
  t(/^1\s*de 7/.test(est1.txt),'e a conta diz 1 de 7');

  /* Enter leva à próxima */
  await p.locator('#cd-nome').press('Enter'); await p.waitForTimeout(700);
  const est2=await estado(p);
  t(est2.on==='Onde você trabalha?','⟶⟶ Enter leva à pergunta seguinte ("'+est2.on+'")');
  const centro=await p.evaluate(()=>{ const r=document.querySelector('.cdq.on').getBoundingClientRect(); return (r.top+r.height/2)/innerHeight });
  t(centro>0.3&&centro<0.75,'e ela fica no meio da tela ('+(centro*100).toFixed(0)+'% da altura)');

  /* tocar numa pergunta apagada traz o foco */
  await p.locator('.cdq', {has:p.locator('#cd-port')}).locator('.cdq-t').click(); await p.waitForTimeout(700);
  t((await estado(p)).on==='Onde está o seu trabalho?','⟶⟶ tocar numa pergunta apagada traz o foco para ela');

  /* a praça e o "Próxima" */
  await p.locator('#cd-cidade').selectOption('Natal/RN'); await p.waitForTimeout(200);
  t((await estado(p)).on==='Onde você trabalha?','escolher a praça põe o foco nela');
  await p.locator('.cdq.on .cdq-ir').click(); await p.waitForTimeout(700);
  t((await estado(p)).on==='Qual é o seu WhatsApp?','"Próxima" leva ao WhatsApp');
  t(/não aparece para ninguém/.test(await p.locator('.cdq.on .cdq-d').textContent()),'⟶ e a pergunta do WhatsApp diz na cara que o número não aparece para ninguém');

  /* a última pergunta da etapa 1 leva à etapa 2 */
  await p.locator('.cdq', {has:p.locator('#cd-port')}).locator('.cdq-t').click(); await p.waitForTimeout(500);
  await p.locator('.cdq.on .cdq-ir').click(); await p.waitForTimeout(700);
  const est3=await estado(p);
  t(est3.passo===2&&est3.on==='O que você faz?','⟶⟶ a última pergunta da etapa leva à etapa seguinte, já em foco ('+est3.passo+' · '+est3.on+')');
  t(est3.nq===3,'a etapa 2 vira três perguntas: funções, o que a função não conta, tipos de trabalho');

  /* as funções: escolher a primeira põe a pessoa na busca — e só aí a frase diz isso */
  t(!/aparece na busca/.test(est3.txt),'antes da função a frase NÃO diz que a pessoa aparece na busca');
  await p.locator('#cd-func [data-cf]').first().click(); await p.waitForTimeout(300);
  const est4=await estado(p);
  t(await p.evaluate(()=>perfilPronto()),'com nome e função o perfil está pronto para a busca');
  t(/aparece na busca/.test(est4.txt),'⟶⟶ e só agora a frase diz "você já aparece na busca": "'+est4.txt+'"');

  /* ============ a dieta de texto ============ */
  const dieta=await p.evaluate(()=>{
    const pn=document.querySelector('#v-cadastro .pn:not([hidden])');
    const visiveis=[...pn.querySelectorAll('p,.note')].filter(e=>e.offsetParent&&getComputedStyle(e).display!=='none');
    const palavras=e=>(e.innerText||'').trim().split(/\s+/).filter(Boolean).length;
    return {lead:!![...pn.querySelectorAll(':scope>.lead')].find(e=>e.offsetParent),
      maior:Math.max(0,...[...pn.querySelectorAll('.cdq.on p')].filter(e=>e.offsetParent).map(palavras)),
      falta:!!document.getElementById('cd-falta').offsetParent, tog:!!document.getElementById('cd-falta-tog').offsetParent};
  });
  t(!dieta.lead,'o parágrafo longo de cada etapa sai de vista');
  t(dieta.maior<=22,'na pergunta em foco nenhum parágrafo passa de 22 palavras ('+dieta.maior+')');
  t(!dieta.falta&&dieta.tog,'⟶ a lista do que falta no perfil fica recolhida, atrás de um toque');
  await p.locator('#cd-falta-tog').click(); await p.waitForTimeout(150);
  t(await p.locator('#cd-falta').isVisible(),'e abre quando a pessoa pede');

  /* ============ a saída da porta curta ============ */
  await p.locator('.cdq', {has:p.locator('#cd-nicho')}).locator('.cdq-t').click(); await p.waitForTimeout(500);
  await p.locator('.cdq.on .cdq-ir').click(); await p.waitForTimeout(700);
  const saida=await p.evaluate(()=>({on:!!document.querySelector('#v-cadastro .pn:not([hidden]) .cdq.on'), foco:document.activeElement&&document.activeElement.id, tab:S.tab}));
  t(saida.foco==='cd-fim2'&&saida.tab==='cadastro','⟶⟶ a última pergunta leva até "Concluir e entrar", sem apertar o botão por ninguém');

  /* ============ a porta longa: a estrada passa a ter todas as perguntas ============ */
  await p.evaluate(()=>{ cadTodo=true; drawCadPasso() }); await p.waitForTimeout(200);
  const longa=await estado(p);
  t(longa.pts>=15,'pela porta longa a estrada mostra todas as perguntas ('+longa.pts+')');
  t(await p.locator('.stp:not([hidden])').count()===6,'e o stepper das seis etapas continua lá');
  await p.locator('.stp[data-st="4"]').click(); await p.waitForTimeout(500);
  t((await estado(p)).on==='Quanto é a sua diária?','o stepper ainda navega, e a etapa abre na primeira pergunta que falta');
  await ctx.close();
  errs.forEach(e=>bad.push('console: '+e));

  /* ============ celular ============ */
  for(const [W,H] of [[390,844],[360,640]]){
    const m=await entrarPelaPorta(b,W,H,true);
    const c=await m.p.evaluate(()=>{ const via=document.getElementById('cd-via').getBoundingClientRect(), on=document.querySelector('.cdq.on').getBoundingClientRect();
      return {larg:document.documentElement.scrollWidth, via:[via.left,via.right], on:[on.left,on.right], vw:innerWidth} });
    t(c.larg<=c.vw,W+'px: nada de rolagem lateral ('+c.larg+')');
    t(c.via[0]>=0&&c.via[1]<=c.vw,W+'px: a estrada cabe na tela');
    t(c.on[0]>=0&&c.on[1]<=c.vw,W+'px: o cartão em foco cabe na tela');
    await m.ctx.close();
    m.errs.forEach(e=>bad.push(W+'px console: '+e));
  }

  await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas');
  process.exit(bad.length?1:0);
})();

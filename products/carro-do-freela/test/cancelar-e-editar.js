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
  if(tipo==='contratante'){
    await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  }
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  if(await p.locator('#as-ok').isVisible().catch(()=>false)){
    await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
    await p.locator('#as-f').click(); await p.waitForTimeout(300);
  }
  await p.evaluate(()=>show('jobs')); await p.waitForTimeout(450);
};
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1200},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));

  /* ============ a tabela de cancelamento ============ */
  await entrar(p,'contratante');
  const regras=await p.evaluate(()=>[0,1,2,3,5,7,10,30].map(d=>({d,fica:regraCanc(d).fica,rot:regraCanc(d).rot})));
  t(regras.find(r=>r.d===0).fica===100,'menos de 72h: valor inteiro fica com a equipe');
  t(regras.find(r=>r.d===2).fica===100,'2 dias ainda é menos de 72h');
  t(regras.find(r=>r.d===3).fica===50,'3 dias: metade fica');
  t(regras.find(r=>r.d===5).fica===50,'5 dias: metade fica');
  t(regras.find(r=>r.d===7).fica===0,'7 dias: devolução integral');
  t(regras.find(r=>r.d===30).fica===0,'muito antes: devolução integral');
  /* a regra é monótona — quanto mais perto, mais fica com a equipe */
  const seq=regras.map(r=>r.fica);
  t(seq.every((x,i)=>i===0||x<=seq[i-1]),'quanto mais perto da data, mais fica com a equipe: '+seq.join('≥'));

  /* ============ contratante cancela ============ */
  t(await p.locator('#jb-det [data-edit]').count()===1,'contratante tem "Editar escala"');
  t(await p.locator('#jb-det [data-canc]').count()===1,'e "Cancelar job"');
  const aviso=await p.locator('#jb-det .jacoes + .note').textContent();
  t(/Cancelar agora/.test(aviso),'o aviso diz o que custa cancelar hoje: "'+aviso.slice(0,60)+'"');

  await p.evaluate(()=>{jobAberto=2;drawJobs()}); await p.waitForTimeout(350);
  const info=await p.evaluate(()=>{const e=ESCALAS.find(x=>x.id===2);return {off:e.off,total:totalEsc(e),n:e.equipe.length}});
  await p.locator('#jb-det [data-canc]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl11').isVisible(),'modal de cancelamento abre');
  const sub=await p.locator('#cj-sub').textContent();
  t(sub.includes('faltam '+info.off),'diz quantos dias faltam: "'+sub+'"');
  t(/entre 3 e 7 dias/.test(await p.locator('#cj-regra').textContent()),'aplica a regra dos 6 dias');
  const contas=await p.evaluate(()=>{const c=contasCanc(ESCALAS.find(x=>x.id===2),"contratante");return {fica:c.fica,devolve:c.devolve}});
  t(contas.fica+contas.devolve===info.total,'a conta fecha: '+contas.fica+' + '+contas.devolve+' = '+info.total);
  t(Math.abs(contas.fica-info.total/2)<=info.n,'metade fica com a equipe: '+contas.fica+' de '+info.total);
  const linhas=await p.locator('#cj-contas .vl').count();
  t(linhas===info.n+2,'uma linha por pessoa mais os dois totais: '+linhas);
  t(await p.locator('#cj-mot option').count()>=4,'pede o motivo');
  await p.screenshot({path:require('path').join(__dirname,'saida','cj-modal.png')});

  const saldoAntes=await p.evaluate(()=>saldo());
  await p.locator('#cj-ok').click(); await p.waitForTimeout(500);
  const dep=await p.evaluate(()=>({n:ESCALAS.length,canc:CANCELADOS.length,mov:CARTEIRA.mov[0],saldo:saldo()}));
  t(dep.n===2,'o job sai da agenda: 3 → '+dep.n);
  t(dep.canc===1,'e fica registrado em CANCELADOS');
  t(dep.mov.tipo==='cancel','o que ficou com a equipe vira movimento na carteira');
  t(saldoAntes-dep.saldo===contas.fica,'e sai da conta de quem cancelou: '+(saldoAntes-dep.saldo));
  t(/ficaram com a equipe/.test(await p.locator('#cj-txt').textContent()),'a confirmação diz para onde o dinheiro foi');
  await p.locator('#cj-f').click(); await p.waitForTimeout(350);
  t(await p.locator('#jb-lista .jcard').count()===2,'a lista de jobs encolhe junto');

  /* ============ editar a escala ============ */
  await p.evaluate(()=>{jobAberto=1;drawJobs()}); await p.waitForTimeout(350);
  const eq0=await p.evaluate(()=>ESCALAS.find(x=>x.id===1).equipe.length);
  const custo0=await p.evaluate(()=>totalEsc(ESCALAS.find(x=>x.id===1)));
  await p.locator('#jb-det [data-edit]').click(); await p.waitForTimeout(400);
  t(await p.locator('.edbox').count()===1,'abre o bloco de edição');
  t(await p.locator('.edl').count()===eq0,'uma linha por pessoa da escala: '+eq0);
  t(await p.locator('#jb-det .jacoes').count()===0,'e as ações somem enquanto edita');

  /* substituir: quem já está na escala não aparece como "não está livre" */
  const opcoes=await p.locator('[data-sub="0"] option').allTextContents();
  t(/· na escala$/.test(opcoes[0]),'quem ocupa a vaga aparece como "na escala": "'+opcoes[0]+'"');
  t(!opcoes.some(o=>/não está livre/.test(o)),'ninguém é rotulado "não está livre" na própria vaga');
  const grupo=await p.locator('[data-sub="0"] optgroup').getAttribute('label').catch(()=>null);
  t(grupo==='Livres nessa data','os substitutos vêm num grupo de quem está livre');
  const sub0=await p.evaluate(()=>ESCALAS.find(x=>x.id===1).equipe[0].quem);
  await p.locator('[data-sub="0"]').selectOption({index:1}); await p.waitForTimeout(400);
  const sub1=await p.evaluate(()=>ESCALAS.find(x=>x.id===1).equipe[0].quem);
  t(sub0!==sub1,'trocar no select substitui a pessoa');
  t(await p.evaluate(()=>ESCALAS.find(x=>x.id===1).equipe.length)===eq0,'sem mudar o tamanho da escala');
  t(await p.evaluate(()=>totalEsc(ESCALAS.find(x=>x.id===1)))===custo0,'nem o custo — a vaga vale o mesmo');

  /* acrescentar */
  await p.locator('[data-mais="Gaffer"]').click(); await p.waitForTimeout(400);
  const eq1=await p.evaluate(()=>ESCALAS.find(x=>x.id===1).equipe.length);
  t(eq1===eq0+1,'acrescentar cria vaga preenchida: '+eq0+' → '+eq1);
  const novo=await p.evaluate(()=>{const e=ESCALAS.find(x=>x.id===1);const u=e.equipe[e.equipe.length-1];
    return {func:u.func,valor:u.valor,livre:status(CREW.find(c=>c.id===u.quem),e.off)}});
  t(novo.func==='Gaffer','na função pedida');
  t(novo.valor>0,'com valor de diária: '+novo.valor);
  t(novo.livre==='livre','e só entra quem está livre na data');
  const totBox=await p.locator('.edbox .vl.tot').textContent();
  t(/\+/.test(totBox),'o bloco mostra a diferença de custo: '+totBox.replace(/\s+/g,' '));

  /* tirar */
  await p.locator('[data-tira]').last().click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>ESCALAS.find(x=>x.id===1).equipe.length)===eq0,'tirar volta ao tamanho anterior');
  await p.locator('#ed-fim').click(); await p.waitForTimeout(350);
  t(await p.locator('.edbox').count()===0,'concluir fecha a edição');
  t(await p.locator('#jb-det .jacoes').count()===1,'e as ações voltam');

  /* ============ freela: sai do job, devolve tudo, marca o perfil ============ */
  await entrar(p,'freela');
  t(await p.locator('#jb-det [data-edit]').count()===0,'freela não edita a escala');
  const rot=await p.locator('#jb-det [data-canc]').textContent();
  t(/Sair deste job/.test(rot),'para ele o botão é "Sair deste job": "'+rot+'"');
  const jid=await p.evaluate(()=>jobAberto);
  const eqA=await p.evaluate(()=>ESCALAS.find(x=>x.id===jobAberto).equipe.length);
  const cancA=await p.evaluate(()=>EU.cancel||0);
  await p.locator('#jb-det [data-canc]').click(); await p.waitForTimeout(400);
  const cf=await p.locator('#cj-contas').textContent();
  t(/Você recebe/.test(cf)&&/R\$ 0/.test(cf),'ele não leva nada ao cancelar');
  t(/fato de operação/.test(cf),'e a tela diz que fica registrado no perfil');
  t(!/multa/.test(await p.locator('#cj-regra').textContent())||/não paga multa/.test(await p.locator('#cj-regra').textContent()),
    'sem multa em dinheiro para o freela');
  await p.locator('#cj-ok').click(); await p.waitForTimeout(500);
  const eqB=await p.evaluate(id=>ESCALAS.find(x=>x.id===id).equipe.length,jid);
  t(eqB===eqA-1,'ele sai da equipe e o job continua: '+eqA+' → '+eqB);
  t(await p.evaluate(()=>EU.cancel)===cancA+1,'o cancelamento entra no perfil dele');
  t(await p.evaluate(()=>ESCALAS.length)===3,'o job não é cancelado para os outros');
  await p.locator('#cj-f').click(); await p.waitForTimeout(300);

  /* mobile */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  await p.screenshot({path:require('path').join(__dirname,'saida','cj-mobile.png')});

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

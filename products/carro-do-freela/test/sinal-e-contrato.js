const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const num=s=>+String(s).replace(/\D/g,'');
const entrarContratante=async p=>{
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
};
/* escala com EU dentro, para conseguir ver os dois lados do mesmo job */
const montar=async(p,func)=>{
  await p.evaluate(f=>{
    const outro=CREW.find(c=>c.gar&&!c.me);
    show('equipe');
    VAGAS=[{id:1,func:f,quem:EU.id},{id:2,func:outro.func[0],quem:outro.id}];
    drawEquipe();
  },func||'Editor');
  await p.waitForTimeout(300);
  await p.locator('#e-fechar').click(); await p.waitForTimeout(500);
};
const trocarModo=async(p,m)=>{
  await p.evaluate(x=>{MODO=x;aplicarModo();show('jobs');drawJobs()},m);
  await p.waitForTimeout(400);
};

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await entrarContratante(p);

  /* ================= a conta do sinal ================= */
  await montar(p);
  const conta=await p.evaluate(()=>({
    cheio:document.getElementById('fe-cheio').textContent,
    sinal:document.getElementById('fe-diarias').textContent,
    resto:document.getElementById('fe-resto').textContent,
    taxa:document.getElementById('fe-taxa').textContent,
    tot:document.getElementById('fe-tot').textContent,
    pctSinal:document.getElementById('fe-sn').textContent,
    pctTaxa:document.getElementById('fe-tx').textContent
  }));
  t(conta.pctSinal==='20','o sinal é de 20%: '+conta.pctSinal);
  t(conta.pctTaxa==='6','a conta de contratante paga 6% — os 4% são do Premium: '+conta.pctTaxa);
  t(num(conta.sinal)===Math.round(num(conta.cheio)*0.2),
    'o sinal é 20% do valor da equipe: '+conta.sinal+' de '+conta.cheio);
  t(num(conta.sinal)+num(conta.resto)===num(conta.cheio),
    'sinal + o que fica pra entrega fecha o valor cheio: '+conta.sinal+' + '+conta.resto+' = '+conta.cheio);
  t(num(conta.taxa)===Math.round(num(conta.cheio)*0.06),
    'a taxa incide sobre o valor do job, não sobre o sinal: '+conta.taxa);
  t(num(conta.tot)===num(conta.sinal)+num(conta.taxa),
    'o que ele paga agora é sinal + taxa: '+conta.tot);
  /* o ponto do modelo inteiro: sai muito menos do que o valor da equipe */
  t(num(conta.tot)<num(conta.cheio)*0.3,
    'o adiantado é ~26% do job, não 106%: '+conta.tot+' de '+conta.cheio);

  const saldoAntes=await p.evaluate(()=>saldo());
  await p.locator('#fe-pgm [data-m="saldo"]').click(); await p.waitForTimeout(250);
  await p.locator('#fe-ok').click(); await p.waitForTimeout(500);
  t(saldoAntes-await p.evaluate(()=>saldo())===num(conta.tot),
    'sai da conta exatamente o sinal + taxa, nada além: '+conta.tot);
  t(/ficam para a entrega/.test(await p.locator('#fe-txt').textContent()),
    'a confirmação diz o que ainda vai ser cobrado');
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);

  const job=await p.evaluate(()=>ESCALAS[ESCALAS.length-1]);
  t(job.equipe.every(x=>x.sinal===Math.round(x.valor*0.2)),
    'cada pessoa do job guarda o próprio sinal: '+JSON.stringify(job.equipe.map(x=>x.sinal)));
  t(job.equipe.every(x=>x.assFreela===false&&x.assProd===false),
    'ninguém nasce assinado');
  const retido=await p.evaluate(j=>PAGOS.filter(x=>x.off===j.off&&x.estado==='sinal').reduce((s,x)=>s+x.valor,0),job);
  t(retido===num(conta.sinal),'só o sinal entra em PAGOS como retido: '+retido);

  /* ================= o contrato ================= */
  await p.evaluate(id=>{show('jobs');jobAberto=id;drawJobs()},job.id); await p.waitForTimeout(400);
  t(await p.locator('.ctl').count()===2,'quem contrata vê o contrato de todo mundo do job');
  t((await p.locator('.ctl .tg').first().textContent()).trim()==='a assinar','a vaga começa aguardando assinatura');

  await p.locator('.ctl [data-ctr]').first().click(); await p.waitForTimeout(350);
  const doc=await p.locator('#ct2-doc').textContent();
  t(/Contratante:/.test(doc)&&/Contratado:/.test(doc),'o contrato nomeia as duas partes');
  t(/pagos como sinal/.test(doc),'o contrato registra o sinal');
  t(/gov\.br/.test(doc),'o contrato diz como é assinado');
  t(/Cancelamento/.test(doc),'e traz a regra de cancelamento');
  t(/simulada/.test(await p.locator('#ct2-nota').textContent()),
    'a tela avisa que a assinatura é simulada — não promete integração que não existe');
  await p.locator('#ct2-ok').click(); await p.waitForTimeout(350);
  t(await p.locator('#ct2-ok').isHidden(),'depois de assinar, o botão some');
  t(/falta|outra parte/i.test(await p.locator('#ct2-nota').textContent()),
    'e avisa que ainda falta a outra parte');
  await p.locator('#ct2-x').click(); await p.waitForTimeout(300);
  t(await p.evaluate(()=>faseVaga(ESCALAS[ESCALAS.length-1].equipe[0]))==='contrato',
    'uma assinatura só não ativa a vaga');

  /* ================= o freela só vê o dele ================= */
  await trocarModo(p,'freela');
  t(await p.locator('.ctl').count()===1,
    'o freela vê só o contrato dele, não o dos colegas: '+await p.locator('.ctl').count());
  const nomes=await p.locator('.ctl .ctn b').allTextContents();
  t(nomes.every(n=>/Você/.test(n)),'e é mesmo o dele: '+nomes.join(' | '));

  await p.locator('.ctl [data-ctr]').first().click(); await p.waitForTimeout(300);
  await p.locator('#ct2-ok').click(); await p.waitForTimeout(350);
  t(/Assinado pelos dois/.test(await p.locator('#ct2-nota').textContent()),
    'com as duas assinaturas o contrato fecha');
  await p.locator('#ct2-x').click(); await p.waitForTimeout(300);
  const minha=()=>p.evaluate(()=>{const e=ESCALAS[ESCALAS.length-1];return faseVaga(e.equipe.find(x=>x.quem===EU.id))});
  t(await minha()==='ativa','a vaga só fica ativa com os dois lados assinados');

  /* ================= entrega por função ================= */
  t(await p.locator('[data-confere]').count()===0,'o freela não pode confirmar o próprio recebimento');
  await p.locator('[data-entrega]').click(); await p.waitForTimeout(400);
  t(await minha()==='conferir','o freela registra a entrega e a vaga vai para conferência');
  t(await p.locator('[data-entrega]').count()===0,'e o botão de entregar sai depois de usado');

  const pagoAntes=await p.evaluate(()=>pagoTot());
  await trocarModo(p,'contratante');
  t(await p.locator('[data-confere]').count()===1,
    'só a vaga entregue pede conferência — a outra ainda nem assinou');
  await p.locator('[data-confere]').click(); await p.waitForTimeout(500);
  t(await minha()==='liberado','com os dois checks a vaga libera');
  const fim=await p.evaluate(()=>{
    const e=ESCALAS[ESCALAS.length-1], x=e.equipe.find(y=>y.quem===EU.id);
    return {pg:PAGOS.filter(q=>q.quem===EU.id&&q.off===e.off).map(q=>q.estado+':'+q.valor),valor:x.valor};
  });
  t(fim.pg.length===1&&fim.pg[0]==='liberado:'+fim.valor,
    'o registro vira liberado pelo valor cheio, sem duplicar o sinal: '+fim.pg.join(','));
  t(await p.evaluate(()=>pagoTot())-pagoAntes===fim.valor,
    'e o total pago sobe pelo valor da diária inteira');

  /* a outra vaga, que ninguém assinou, não andou junto */
  const outra=await p.evaluate(()=>{const e=ESCALAS[ESCALAS.length-1];return faseVaga(e.equipe.find(x=>x.quem!==EU.id))});
  t(outra==='contrato','cada função anda no seu tempo: a vaga não assinada ficou parada');

  /* ================= cancelar opera sobre o sinal ================= */
  await entrarContratante(p);
  await montar(p);
  await p.locator('#fe-ok').click(); await p.waitForTimeout(500);
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);
  const j2=await p.evaluate(()=>ESCALAS[ESCALAS.length-1]);
  await p.evaluate(id=>{show('jobs');jobAberto=id;drawJobs()},j2.id); await p.waitForTimeout(400);
  await p.locator('[data-canc]').click(); await p.waitForTimeout(400);
  const contas=await p.locator('#cj-contas').textContent();
  t(/sinal/.test(contas),'a conta do cancelamento fala em sinal, não em valor cheio');
  const totalSinal=j2.equipe.reduce((s,x)=>s+(x.sinal||0),0);
  const devolve=num((await p.locator('#cj-contas .vl').nth(j2.equipe.length).textContent()));
  t(devolve<=totalSinal,'nunca devolve mais do que o sinal que foi pago: '+devolve+' de '+totalSinal);
  await p.locator('#cj-ok').click(); await p.waitForTimeout(400);

  /* ================= a cópia de venda ================= */
  await p.evaluate(()=>{show('home')}); await p.waitForTimeout(300);
  const home=await p.locator('#h-gar').textContent();
  t(/20%/.test(home)&&/gov\.br/.test(home),'a homepage explica o sinal e o contrato');
  t(!/deposita o valor combinado/.test(home),'e não promete mais depósito integral');
  const planos=await p.locator('#h-planos').textContent();
  t(/4%/.test(planos)&&/6%/.test(planos),'o plano do contratante mostra o desconto de taxa');

  /* ================= mobile ================= */
  await p.evaluate(id=>{show('jobs');jobAberto=id;drawJobs()},j2.id); await p.waitForTimeout(300);
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  await p.screenshot({path:path.join(__dirname,'saida','sinal-mobile.png'),fullPage:true});

  t(!errs.length,'sem erro de JS no fluxo inteiro');
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

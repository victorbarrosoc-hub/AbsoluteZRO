const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
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
(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1200},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await entrarContratante(p);

  /* ---- monta uma escala com as três categorias, na mão, para não
     depender de sorte no que já está favoritado/escalado ---- */
  const montar=async()=>{
    await p.evaluate(()=>{
      const exige=CREW.find(c=>c.exige&&!c.me);
      const aceitaSo=CREW.find(c=>c.gar&&!c.exige&&!c.me&&c.id!==exige.id);
      const nao=CREW.find(c=>!c.gar&&!c.me&&c.id!==exige.id&&c.id!==aceitaSo.id);
      show('equipe');
      VAGAS=[{id:1,func:exige.func[0],quem:exige.id},{id:2,func:aceitaSo.func[0],quem:aceitaSo.id},{id:3,func:nao.func[0],quem:nao.id}];
      drawEquipe();
    });
    await p.waitForTimeout(350);
  };
  await montar();
  await p.locator('#e-fechar').click(); await p.waitForTimeout(500);

  /* ---- o modal separa as três categorias ---- */
  const chips=await p.locator('#fe-lista .chip.sm').allTextContents();
  t(chips.includes('exige garantia'),'chip "exige garantia" aparece: '+chips.join(' | '));
  t(chips.includes('com garantia'),'chip "com garantia" aparece (aceita, toggle ligado)');
  t(chips.includes('acerto direto'),'chip "acerto direto" aparece (não usa garantia)');
  t(await p.locator('#fe-lista .chip.sm[disabled]').count()===2,'exige e não-aceita ficam travados: só o "aceita" é clicável');
  t(await p.locator('#fe-toggle').isVisible(),'toggle mestre aparece quando tem gente "aceita mas não exige"');

  const antes=await p.evaluate(()=>({diarias:document.getElementById('fe-diarias').textContent,composicao:escaladas().map(x=>({exige:x.exige,aceita:x.aceita}))}));
  t(antes.diarias!=='R$ 0','com o toggle ligado, soma inclui exige+aceita');

  /* ---- desligar o toggle tira só quem "aceita mas não exige" da conta ---- */
  await p.locator('#fe-toggle').click(); await p.waitForTimeout(300);
  const depois=await p.locator('#fe-diarias').textContent();
  t(depois!==antes.diarias,'desligar o toggle muda a soma em garantia: '+antes.diarias+' → '+depois);
  const chipsDepois=await p.locator('#fe-lista .chip.sm').allTextContents();
  t(chipsDepois.filter(x=>x==='exige garantia').length===1,'quem exige continua marcado mesmo com o toggle desligado');
  t(chipsDepois.filter(x=>x==='acerto direto').length===2,'quem aceita mas não exige também vira acerto direto: '+chipsDepois.join(' | '));
  t(await p.locator('#fe-direto').isVisible(),'o resumo de acerto direto aparece');
  const resumoN=await p.locator('#fe-direto-n').textContent();
  t(/^2 pessoas/.test(resumoN),'e conta certo quantas ficaram de fora: "'+resumoN+'"');

  /* religa e fecha, conferindo o que efetivamente vira dinheiro na plataforma */
  await p.locator('#fe-toggle').click(); await p.waitForTimeout(300);
  const retidos=()=>p.evaluate(()=>PAGOS.filter(x=>x.estado==='custodia'||x.estado==='sinal').length);
  const pagosAntes=await retidos();
  /* soma esperada é sinal+taxa de quem está em garantia, calculada antes
     de qualquer toggle de forma de pagamento — #fe-tot muda de sentido
     quando o saldo cobre tudo (vira "resta pagar", não "total reservado") */
  const somaGar=+((await p.locator('#fe-diarias').textContent()).replace(/\D/g,''))
               +(+((await p.locator('#fe-taxa').textContent()).replace(/\D/g,'')));
  await p.locator('#fe-pgm [data-m="saldo"]').click(); await p.waitForTimeout(250);
  const saldoAntes=await p.evaluate(()=>saldo());
  await p.locator('#fe-ok').click(); await p.waitForTimeout(500);
  const pagosDepois=await retidos();
  t(pagosDepois-pagosAntes===2,'só as 2 pessoas em garantia entram em PAGOS/custódia: '+(pagosDepois-pagosAntes));
  t(saldoAntes-await p.evaluate(()=>saldo())===somaGar,'o saldo cai exatamente o valor em garantia, não o total da escala: '+somaGar);
  t(/combinados direto/.test(await p.locator('#fe-txt').textContent()),'a confirmação conta o que ficou de fora da custódia');
  const jobNovo=await p.evaluate(()=>ESCALAS[ESCALAS.length-1]);
  t(jobNovo.equipe.filter(x=>x.gar===false).length===1,'o job guarda quem é acerto direto: '+JSON.stringify(jobNovo.equipe.map(x=>x.gar)));
  t(jobNovo.equipe.filter(x=>x.gar!==false).length===2,'e quem está em garantia');
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);

  /* ---- painel do job mostra quem é acerto direto ---- */
  await p.evaluate(id=>{show('jobs');jobAberto=id;drawJobs()},jobNovo.id); await p.waitForTimeout(400);
  const badgesDet=await p.locator('#jb-det .jpes .p small').allTextContents();
  t(badgesDet.filter(x=>/acerto direto/.test(x)).length===1,'"Quem está no job" sinaliza o acerto direto: '+badgesDet.join(' | '));

  /* ---- editar: quem entra pela edição não gera depósito ---- */
  await p.locator('[data-edit]').click(); await p.waitForTimeout(400);
  await p.locator('[data-mais="Gaffer"]').click(); await p.waitForTimeout(400);
  const novo=await p.evaluate(()=>{const e=ESCALAS[ESCALAS.length-1];return e.equipe[e.equipe.length-1]});
  t(novo.gar===false,'quem entra por "Acrescentar alguém" nasce em acerto direto: '+novo.gar);
  t(/acerto direto/.test(await p.locator('.edl').last().locator('.edac').textContent()),'e o badge aparece na linha nova');
  const notaEdicao=await p.locator('.edbox .note').last().textContent();
  t(!/entra em custódia/.test(notaEdicao),'a nota não promete depósito automático: "'+notaEdicao.slice(0,70)+'"');

  /* remover quem estava em garantia limpa o PAGOS fantasma */
  const alvo=await p.evaluate(()=>ESCALAS[ESCALAS.length-1].equipe.find(x=>x.gar!==false));
  const pagosAntesTira=await retidos();
  const idx=await p.evaluate(id=>ESCALAS[ESCALAS.length-1].equipe.findIndex(x=>x.quem===id),alvo.quem);
  await p.locator('.edl [data-tira="'+idx+'"]').click(); await p.waitForTimeout(400);
  t(await retidos()===pagosAntesTira-1,'remover quem tinha depósito tira o registro de PAGOS');
  t(!await p.evaluate(id=>PAGOS.some(x=>x.quem===id&&(x.estado==='custodia'||x.estado==='sinal')),alvo.quem),'sem fantasma referenciando quem saiu');
  await p.locator('#ed-fim').click(); await p.waitForTimeout(300);

  /* ---- cancelar uma escala mista ---- */
  await montar();
  await p.locator('#e-fechar').click(); await p.waitForTimeout(500);
  await p.locator('#fe-ok').click(); await p.waitForTimeout(500);
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);
  const jobMisto=await p.evaluate(()=>ESCALAS[ESCALAS.length-1]);
  await p.evaluate(id=>{show('jobs');jobAberto=id;drawJobs()},jobMisto.id); await p.waitForTimeout(400);
  await p.locator('[data-canc]').click(); await p.waitForTimeout(400);
  const linhasConta=await p.locator('#cj-contas .venda .vl').count();
  t(linhasConta<jobMisto.equipe.length+2,'a conta do cancelamento não lista quem não tinha depósito: '+linhasConta+' linhas para '+jobMisto.equipe.length+' pessoas');
  const notaSemDep=await p.locator('#cj-contas .note').last().textContent();
  t(/acerto direto/.test(notaSemDep),'e avisa separadamente quem estava fora da custódia: "'+notaSemDep+'"');
  await p.locator('#cj-ok').click(); await p.waitForTimeout(500);
  t(!errs.length,'sem erro de JS no fluxo inteiro');

  /* ---- freela cujo job era 100% acerto direto: nada para devolver ---- */
  await entrarContratante(p);
  await p.evaluate(()=>{
    const nao=CREW.find(c=>!c.gar&&!c.me);
    show('equipe');
    VAGAS=[{id:1,func:nao.func[0],quem:nao.id}];
    drawEquipe();
  });
  await p.waitForTimeout(300);
  await p.locator('#e-fechar').click(); await p.waitForTimeout(500);
  t(await p.locator('#fe-toggle').isHidden(),'sem ninguém "aceita mas não exige", o toggle nem aparece');
  t((await p.locator('#fe-tot').textContent())==='R$ 0','nada a depositar quando todo mundo é acerto direto');
  await p.locator('#fe-ok').click(); await p.waitForTimeout(500);
  await p.locator('#fe-f').click(); await p.waitForTimeout(300);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

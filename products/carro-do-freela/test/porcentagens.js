/* PORCENTAGEM COM VALOR AO LADO
 *
 * Um testador leu "6%" e "5%" e não formou ideia nenhuma de quanto era. A
 * regra que saiu daí, e que esta suíte protege:
 *
 *   ONDE HÁ UM CASO CONCRETO NA TELA, a porcentagem vem com o valor em
 *   real do caso. Onde NÃO há — a tabela de planos, um desconto de
 *   parceiro sem preço — ela vem sozinha, porque inventar um valor de
 *   exemplo ali seria fabricar número, que nesta casa é defeito pior.
 *
 * ⚠️ E TODO VALOR SAI DA CONTA, NUNCA DIGITADO. Um "R$ 60" escrito à mão
 * ao lado de "6%" envelhece calado no dia em que a taxa mudar — vira uma
 * mentira que nenhum teste pega. As asserções abaixo comparam o que a tela
 * mostra com o que as funções de dinheiro calculam.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const entrar=async(p,lado)=>{
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(230);
  await p.locator('[data-lgtipo="'+lado+'"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(760);
};

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:1280,height:1300},deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.setItem('cdf-guia','1');    /* o guia das portas nao cobre a tela */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });

  /* ============ cancelar um job ============
     é o aviso mais caro da casa: dinheiro saindo, decisão em cima da hora */
  await entrar(p,'contratante');
  await p.evaluate(()=>show('jobs')); await p.waitForTimeout(600);
  const aviso=(await p.locator('#jb-det .jacoes ~ .note').first().textContent()).trim();
  t(/%/.test(aviso),'o aviso de cancelar diz a régua em porcentagem');
  t(/R\$/.test(aviso),'e diz quanto é em real — "30% do sinal" não responde "quanto eu perco?"');
  const conta=await p.evaluate(()=>{
    const e=meusJobs().find(x=>x.id===jobAberto);
    const c=contasCanc(e,"contratante");
    return {fica:brl(c.fica),devolve:brl(c.devolve)};
  });
  t(aviso.includes(conta.fica),'o valor retido bate com contasCanc(): '+conta.fica);
  t(aviso.includes(conta.devolve),'e o que volta também: '+conta.devolve);

  /* o freela não tem o que reter — e a tela não finge que tem */
  await p.evaluate(()=>{MODO='freela';aplicarModo();show('jobs')}); await p.waitForTimeout(500);
  const avf=(await p.locator('#jb-det .jacoes ~ .note').first().textContent()).trim();
  t(!/%/.test(avf),'do lado do freela não há régua: o sinal volta inteiro, e a tela não inventa porcentagem');
  t(/perfil/.test(avf),'o que fica para ele é o registro no perfil, e é isso que a linha diz');

  /* ============ a ajuda, onde as taxas são explicadas ============ */
  await p.evaluate(()=>abrirAjuda('taxas')); await p.waitForTimeout(500);
  const blks=await p.locator('#aj-corpo .blk').allTextContents();
  const job=blks.find(x=>/sinal e contrato/.test(x))||'';
  const venda=blks.find(x=>/brechó/.test(x))||'';
  const esperado=await p.evaluate(()=>({
    taxa:GARANTIA.taxa,
    comTaxa:brl(EXEMPLO+Math.round(EXEMPLO*GARANTIA.taxa/100)),
    oSinal:brl(Math.round(EXEMPLO*GARANTIA.sinal/100)),
    liq:lum(liqVenda(EXEMPLO))
  }));
  t(new RegExp(esperado.taxa+'%').test(job),'a taxa do job aparece em porcentagem');
  t(job.includes(esperado.comTaxa),'e a conta fechada de quem paga: '+esperado.comTaxa);
  t(job.includes(esperado.oSinal),'com o sinal em real também: '+esperado.oSinal);
  t(venda.includes(esperado.liq),'e a venda diz o que CAI na carteira, não só o que sai: '+esperado.liq);
  const frota=blks.find(x=>/Frota/.test(x))||'';
  t(/R\$ \d/.test(frota),'e o plano caro diz A PARTIR DE QUANTO compensa, em real: '+
    (frota.match(/a partir de (R\$ [\d.]+)/i)||[])[1]);

  /* ============ proposta de valor no brechó ============ */
  await entrar(p,'freela');
  const id=await p.evaluate(()=>{const o=oportunidades()[0];return o?o.a.id:null});
  t(id!==null,'existe anúncio abaixo da faixa para propor');
  if(id!==null){
    await p.evaluate(i=>abrirProposta(i),id); await p.waitForTimeout(400);
    const preco=await p.evaluate(i=>ANUNCIOS.find(x=>x.id===i).preco,id);
    await p.fill('#pr-valor',String(Math.round(preco*0.85)));
    await p.waitForTimeout(250);
    const dif=(await p.locator('#pr-dif').textContent()).trim();
    t(/%/.test(dif),'digitar um valor mostra o desconto em porcentagem: '+dif);
    t(/R\$/.test(dif),'e o quanto é a menos, em real — que é o número que decide se manda ou sobe');
    const esperadoMenos=await p.evaluate(([pr,x])=>brl(pr-x),[preco,Math.round(preco*0.85)]);
    t(dif.includes(esperadoMenos),'e ele é a diferença de verdade: '+esperadoMenos);
  }

  /* ============ oportunidades ============ */
  await p.evaluate(()=>{painelBrecho('oport');show('brecho')}); await p.waitForTimeout(600);
  const etq=await p.locator('.opb').allTextContents();
  t(etq.length>0,'o brechó marca o que está abaixo da faixa: '+etq.length+' item(ns)');
  t(etq.every(x=>/%/.test(x)&&/R\$/.test(x)),
    'e cada etiqueta traz os dois — "13% abaixo" não faz ninguém abrir o anúncio, "R$ 450 a menos" faz: '+etq[0]);

  /* ============ onde NÃO há caso, não se inventa ============ */
  await p.evaluate(()=>show('aprender')); await p.waitForTimeout(500);
  const pcts=await p.locator('#v-aprender .pct').allTextContents();
  t(pcts.length>0,'o clube de desconto lista parceiros com percentual: '+pcts.join(' '));
  t(pcts.every(x=>!/R\$/.test(x)),
    'e ali a porcentagem vem SOZINHA, de propósito: não há preço na tela, e inventar um seria fabricar o preço de um parceiro');

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();

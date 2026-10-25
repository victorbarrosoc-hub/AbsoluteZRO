/* TODA TRANCA É VITRINE — a régua Bitrix24, executável.
 *
 * A direção do Victor: "você vai encontrar tudo que precisa da área, mas
 * tem que pagar por isso" — SEM a confusão do Bitrix. O que esta suíte
 * jura, para cada função paga:
 * 1. A tranca diz O QUE a função faz (nunca só "assine").
 * 2. Diz o DEGRAU pelo nome certo e mostra PREÇO — pagar é abrir, não
 *    descobrir. "Ver o Premium" num recurso da Frota é o defeito que já
 *    aconteceu e não pode voltar.
 * 3. Tem PORTA: um clique abre a assinatura do degrau certo.
 * 4. Carrega a MINI-ESTRADA (.viamini): onde você está, onde a função
 *    mora — o mapa que o Bitrix não tem.
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

/* a régua de uma vitrine: precisa de preço, do plano nomeado e do mapa */
async function vitrine(p,sel,plano,preco,alvo,rot){
  const m=await p.evaluate(([sel,plano,preco,alvo])=>{
    const el=document.querySelector(sel); if(!el) return {sem:true};
    const tx=el.textContent;
    const alvoEl=el.querySelector('.viamini i.alvo b');
    return {
      plano:tx.includes(plano),
      preco:tx.includes(preco),
      mapa:!!el.querySelector('.viamini'),
      alvoCerto:alvoEl?alvoEl.textContent:null,
      porta:!!el.querySelector('button')
    };
  },[sel,plano,preco,alvo]);
  if(m.sem){ t(false,rot+': o painel não está na tela ('+sel+')'); return }
  t(m.plano,rot+': diz o degrau pelo nome — '+plano);
  t(m.preco,rot+': mostra o preço — '+preco);
  t(m.mapa&&m.alvoCerto===alvo,rot+': a mini-estrada aponta '+alvo+' (achou: '+m.alvoCerto+')');
  t(m.porta,rot+': tem porta clicável');
}

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await PRE(p);
  await p.goto(URL,{waitUntil:'networkidle'});

  /* ============ a regressão que motivou a suíte ============ */
  t(await p.evaluate(()=>!document.body.innerHTML.includes('Ver o Premium')),
    'a frase "Ver o Premium" não existe mais — recurso da Frota chama a Frota');

  /* ============ lado do FREELA, grátis ============ */
  await p.evaluate(()=>show('equipe')); await p.waitForTimeout(400);
  await vitrine(p,'#e-trancado .trancado, #v-equipe .trancado','Volante','R$ 89','Volante','Montar equipe (freela)');
  t(await p.evaluate(()=>!!document.querySelector('#v-equipe .cmp')),
    'Montar equipe traz o comparativo dos três planos no centro');

  await p.evaluate(()=>show('orcar')); await p.waitForTimeout(400);
  await vitrine(p,'#v-orcar .trancado','Estrada','R$ 49','Estrada','Orçamento (grátis)');
  /* a porta abre o plano CERTO */
  await p.click('#v-orcar [data-vestrada]'); await p.waitForTimeout(350);
  t(await p.evaluate(()=>!v('pfr-form').closest('.ovl').hidden),
    'a porta do orçamento abre a assinatura da Estrada');
  await p.evaluate(()=>{document.querySelectorAll('.ovl').forEach(o=>o.hidden=true)});

  await p.evaluate(()=>show('meu')); await p.waitForTimeout(500);
  await vitrine(p,'#pf-rel','Premium','R$ 19','Premium','Relatório do ano (freela)');
  await p.evaluate(()=>{ const b=v('pf-prem'); if(b) b.click() }); await p.waitForTimeout(350);
  t(await p.evaluate(()=>!v('pfr-form').closest('.ovl').hidden),
    'a porta do relatório abre o plano de freela');
  await p.evaluate(()=>{document.querySelectorAll('.ovl').forEach(o=>o.hidden=true)});

  /* ============ lado de QUEM CONTRATA, no Carona ============ */
  await p.evaluate(()=>{ MODO='contratante'; aplicarModo() });

  await p.evaluate(()=>show('buscar')); await p.waitForTimeout(500);
  await vitrine(p,'#rows .trancado','Volante','R$ 89','Volante','Busca de quem está livre');
  t(await p.evaluate(()=>/R\$\s*189/.test(document.querySelector('#rows .trancado').textContent)),
    'a busca trancada mostra também a Frota — os dois degraus à vista');
  t(await p.evaluate(()=>{
      const tx=document.querySelector('#rows .trancado').textContent;
      return /profission/i.test(tx)||/na escuta/i.test(tx);
    }),'e o censo prova que tem gente antes de pedir cartão');
  await p.click('#rows [data-virar="volante"]'); await p.waitForTimeout(350);
  t(await p.evaluate(()=>!v('as-form').closest('.ovl').hidden),
    'a porta da busca abre a assinatura de contratante');
  await p.evaluate(()=>{document.querySelectorAll('.ovl').forEach(o=>o.hidden=true)});

  await p.evaluate(()=>{ abrirPerfil(CREW[0].id); S.ptab='agenda'; drawPtabs() });
  await p.waitForTimeout(400);
  await vitrine(p,'#p-ag-trancado','Volante','R$ 89','Volante','Agenda no perfil de alguém');

  await p.evaluate(()=>show('passar')); await p.waitForTimeout(400);
  await vitrine(p,'#u-trancado','Volante','R$ 89','Volante','Passar o carro');

  await p.evaluate(()=>show('minhaprod')); await p.waitForTimeout(500);
  await vitrine(p,'#mp-clz','Frota','R$ 189','Frota','Cláusulas do contrato');
  await vitrine(p,'#mp-rel','Frota','R$ 189','Frota','Relatório de custo');
  await p.evaluate(()=>{ const b=v('mp-prem2'); if(b) b.click() }); await p.waitForTimeout(350);
  t(await p.evaluate(()=>!v('pm-form').closest('.ovl').hidden),
    'a porta das cláusulas abre a assinatura da Frota');
  await p.evaluate(()=>{document.querySelectorAll('.ovl').forEach(o=>o.hidden=true)});

  /* ============ a régua geral: tranca sem preço não existe ============ */
  const semPreco=await p.evaluate(()=>{
    return [...document.querySelectorAll('.trancado')]
      .filter(el=>el.offsetParent!==null||!el.closest('[hidden]'))
      .filter(el=>!/R\$/.test(el.textContent))
      .map(el=>(el.querySelector('h3')||{}).textContent||'?');
  });
  t(semPreco.length===0,'nenhuma vitrine renderizada está sem preço'+(semPreco.length?' — '+semPreco.join('; '):''));

  /* ============ o mapa em si ============ */
  const via=await p.evaluate(()=>{
    const el=document.querySelector('.viamini'); if(!el) return null;
    return {
      pontos:el.querySelectorAll('i').length,
      voce:!!el.querySelector('i.eu'),
      rotulo:el.getAttribute('aria-label')||''
    };
  });
  t(via&&via.pontos===5,'a mini-estrada tem os cinco degraus');
  t(via&&via.voce,'e marca onde VOCÊ está, não só o alvo');
  t(via&&/você está/.test(via.rotulo),'e se apresenta ao leitor de tela');

  /* ============ VITRINE SEM PORTA NÃO VENDE NADA ============
     Victor perguntou "e Montar equipe na aba de freela, tá aonde?" e a
     resposta era: em lugar nenhum, NO CELULAR. A faixa de abas do topo some
     abaixo de 820px, a barra de baixo era só de contratante e a gaveta
     também — a tela existia, a vitrine funcionava, e só quem abrisse no
     computador chegava nela. `show()` no teste pulava a porta e não via.
     Daqui em diante toda vitrine é cobrada NA INTERFACE, a 390px. */
  const ctxm=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const pm=await ctxm.newPage(); await PRE(pm);
  await pm.goto(URL,{waitUntil:'networkidle'});
  const porta=async(tab)=>pm.evaluate(t=>{
    const vis=el=>el&&el.offsetParent!==null;
    show('feed');
    let n=[...document.querySelectorAll('.top .tab[data-tab="'+t+'"], .bottombar .bt[data-tab="'+t+'"]')]
      .filter(vis).length;
    abrirGaveta();
    n+=[...document.querySelectorAll('.gaveta [data-ir="'+t+'"]')].filter(vis).length;
    fecharGaveta();
    return n;
  },tab);

  t(await porta('equipe')>0,'CELULAR · freela: Montar equipe tem porta — a vitrine do Volante é alcançável');
  t(await porta('orcar')>0,'CELULAR · freela: Orçamento tem porta — a vitrine da Estrada é alcançável');
  t(await porta('planos')>0,'CELULAR · freela: Planos tem porta');
  t(await porta('cofre')>0,'CELULAR · freela: Cofre tem porta');
  /* a exceção DECIDIDA: o freela não passa vaga, ele recebe a chamada.
     Passar o carro sumiu do lado dele de propósito (abas e gaveta). */
  t(await porta('passar')===0,'CELULAR · freela: Passar o carro continua SEM porta — é decisão, não esquecimento');

  await pm.evaluate(()=>{ MODO='contratante'; aplicarModo() });
  t(await porta('buscar')>0,'CELULAR · contratante: a busca tem porta');
  t(await porta('equipe')>0,'CELULAR · contratante: Montar equipe tem porta');
  t(await porta('passar')>0,'CELULAR · contratante: Passar o carro tem porta');
  await ctxm.close();

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('VITRINES');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

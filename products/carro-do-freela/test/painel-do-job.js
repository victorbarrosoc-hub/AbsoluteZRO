/* O PAINEL DO JOB — a tela que a equipe abre na véspera.
 *
 * As partes de dentro dele já têm suíte própria: `documentos.js` mede a
 * ordem do dia e o boletim, `lista-equipamento.js` mede a lista,
 * `cancelar-e-editar.js` mede cancelar e editar. Esta aqui mede o painel
 * EM SI — e o que ela cobra é a coisa mais fácil de quebrar sem ninguém
 * ver: o painel é UM código servindo DUAS pessoas.
 *
 * Quem contrata e quem foi escalado leem a mesma função `detJob`, e quase
 * cada linha muda de lado: "Cliente final" vira "Quem te chamou", "Custo"
 * vira "Sua diária", editar a escala existe de um lado e não do outro. Um
 * `prod?` esquecido não dá erro nenhum — dá um freela vendo quanto a
 * produção paga para todo mundo, ou um botão que não faz nada.
 *
 * ⚠️ E a regra de quem SOBE documento não é o chapéu: é `podeDocJob` —
 * quem contrata OU quem lidera no set. O freela comum lê e não escreve.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const url='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:1440,height:1300},deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.setItem('cdf-guia','1');    /* o guia das portas nao cobre a tela */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(url,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(220);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(160);
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(650);
  await p.evaluate(()=>show('jobs')); await p.waitForTimeout(550);

  const det=()=>p.locator('#jb-det').textContent();
  const rot=async r=>p.evaluate(rr=>{
    const l=[...document.querySelectorAll('#jb-det .jlinha')].find(x=>x.querySelector('span').textContent.trim()===rr);
    return l?l.querySelector('b').textContent.trim():null;
  },r);

  /* ============ o lado de quem contrata ============ */
  t(await p.locator('#jb-lista [data-job]').count()>0,'a lista de jobs abre com job dentro');
  t(await p.locator('#jb-det .jdet').count()===1,'e um deles já vem aberto — ninguém chega numa tela vazia');
  t((await p.locator('#jb-rot').textContent()).trim()==='O dia da equipe','o rótulo diz de quem é: "O dia da equipe"');
  t(await rot('Cliente final')!==null,'quem contrata lê "Cliente final"');
  t(await rot('Quem te chamou')===null,'e não lê "Quem te chamou" — esse é o outro lado');
  t(await rot('Custo')!==null,'lê o CUSTO do job inteiro');
  t(await rot('Sua diária')===null,'e não uma diária, porque ela não tem uma');
  t(await rot('Horário')!==null&&await rot('Chamada')!==null&&await rot('Local')!==null,
    'os três dados da véspera estão na ficha: horário, chamada e local');
  t(await p.locator('#jb-det .jpes .p em').count()>0,'quem contrata vê quanto cada pessoa custa');
  const kpis=await p.locator('#jb-kpis .kpi .lab').allTextContents();
  t(kpis.some(x=>/Custo agendado/.test(x)),'e os indicadores somam o custo agendado');
  t(await p.locator('#jb-fora').isHidden(),'"Fui chamado por fora" não aparece para quem contrata');
  t(await p.locator('#jb-det [data-zap]').count()===0,'nem o lembrete de véspera: quem produz não é quem chega no set');
  t(await p.locator('#jb-det [data-edit]').count()===1,'ela edita a escala');
  t(await p.locator('#jb-det [data-lider]').count()===1,'e aponta quem lidera no set');

  /* ---- a linha da pessoa é botão, não enfeite ---- */
  const outros=await p.locator('#jb-det .jpes button[data-jperfil]').count();
  t(outros>0,'cada pessoa do job é um botão: '+outros);
  t(await p.locator('#jb-det .jpes .eu2').count()===1,
    'menos eu — abrir o próprio perfil a partir daqui seria volta');
  const quem=await p.locator('#jb-det .jpes button[data-jperfil]').first().getAttribute('data-jperfil');
  await p.locator('#jb-det .jpes button[data-jperfil]').first().click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>S.tab)==='perfil','tocar na pessoa abre o perfil dela');
  t(String(await p.evaluate(()=>S.perfil))===quem,'e é o perfil DAQUELA pessoa');
  /* ⚠️ O "voltar" do perfil cai SEMPRE na busca (`p-back` → show("buscar")),
     inclusive para quem chegou pelo painel do job. A suíte não finge que
     isso é o certo: volta por fora, e registra o desvio aqui em cima. */
  await p.evaluate(()=>show('jobs')); await p.waitForTimeout(450);

  /* ============ briefing: o modelo por campos ============ */
  t(/Briefing/.test(await det()),'o briefing mora no painel, junto do resto');
  await p.locator('#jb-det [data-bfedit]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl-bfg').isVisible(),'que abre o modelo');
  const campos=await p.locator('#bg2-campos [data-bfc]').count();
  t(campos===7,'com os sete campos que costumam faltar, em vez de uma caixa vazia: '+campos);
  const rotulos=await p.locator('#bg2-campos .lab').allTextContents();
  t(rotulos.includes('O que evitar'),'inclusive "O que evitar" — é o que mais custa refazer');
  await p.locator('[data-bfc="objetivo"]').fill('vender a temporada nova para quem já comprou');
  await p.locator('[data-bfc="entrega"]').fill('três peças de 30s para o feed');
  await p.locator('[data-bfc="aprova"]').fill('a diretora de marketing');
  await p.locator('#bg2-ok').click(); await p.waitForTimeout(450);
  t(/vender a temporada nova/.test(await det()),'e o briefing aparece no painel');
  t(/Para que serve/.test(await det())&&/Quem aprova/.test(await det()),
    'com o nome do campo junto — sem ele o texto vira parágrafo solto');
  t(!/O que evitar/.test(await det()),'e campo em branco não vira linha vazia na tela');
  t((await p.locator('#jb-det [data-bfedit]').textContent()).trim()==='Editar',
    'e o botão passa de "Preencher" para "Editar"');

  /* ============ referências: o campo que importa é o "por quê" ============ */
  await p.locator('#jb-det [data-rfadd]').click(); await p.waitForTimeout(350);
  await p.locator('#rf-ok').click(); await p.waitForTimeout(250);
  t(await p.locator('#ovl-ref').isVisible(),'não guarda referência sem título — não adianta guardar nada');
  await p.locator('#rf-t2').fill('Abertura do documentário do porto');
  await p.locator('#rf-onde').fill('YouTube');
  await p.locator('#rf-pq').fill('a luz de janela, não o corte');
  await p.locator('#rf-ok').click(); await p.waitForTimeout(400);
  t(/Abertura do documentário do porto/.test(await det()),'com título ela entra no painel');
  t(/a luz de janela, não o corte/.test(await det()),
    'com O PORQUÊ junto — sem ele cada um da equipe copia uma coisa diferente da mesma referência');

  /* ============ o mesmo painel, do outro lado ============ */
  await p.evaluate(()=>{MODO='freela';aplicarModo();show('jobs')}); await p.waitForTimeout(600);
  t((await p.locator('#jb-rot').textContent()).trim()==='O dia do job','o rótulo vira "O dia do job"');
  t(await rot('Quem te chamou')!==null,'o freela lê "Quem te chamou"');
  t(await rot('Cliente final')===null,'e não o cliente final da produtora');
  t(await rot('Sua diária')!==null,'lê A DIÁRIA DELE');
  t(await rot('Custo')===null,'e não o custo do job — quanto a produção paga aos outros não é conta dele');
  t(await p.locator('#jb-det .jpes .p em').count()===0,'nem o valor de cada colega ao lado do nome');
  const kf=await p.locator('#jb-kpis .kpi .lab').allTextContents();
  t(kf.some(x=>/A receber deles/.test(x)),'e o indicador vira "A receber deles"');
  t(await p.locator('#jb-det [data-edit]').count()===0,'ele não edita a escala');
  t(await p.locator('#jb-det [data-canc]').count()===1,'mas sai do job');
  t(/Sair deste job/.test(await p.locator('#jb-det [data-canc]').textContent()),
    'com a palavra do lado dele: "Sair deste job", não "Cancelar job"');
  t(/vender a temporada nova/.test(await det()),'ele lê o briefing que ela escreveu — é o mesmo job, não duas cópias');
  t(/a luz de janela/.test(await det()),'e a referência com o porquê');

  /* ---- e só lê: quem sobe documento é quem contrata ou quem lidera ---- */
  const lidera=await p.evaluate(()=>{
    const e=meusJobs().find(x=>x.id===jobAberto);
    return !!e&&e.lider===EU.id;
  });
  if(!lidera){
    t(await p.locator('#jb-det [data-bfedit]').count()===0,'freela que não lidera não edita briefing');
    t(await p.locator('#jb-det [data-rfadd]').count()===0,'nem adiciona referência');
    t(await p.locator('#jb-det [data-dcadd]').count()===0,'nem sobe documento');
  }
  await p.evaluate(()=>{
    const e=meusJobs().find(x=>x.id===jobAberto); if(e) e.lider=EU.id; drawJobs();
  }); await p.waitForTimeout(400);
  t(await p.locator('#jb-det [data-dcadd]').count()===1,
    'apontado como líder no set, ele passa a subir documento — a regra é o papel no dia, não o lado da conta');
  t(await rot('Lidera no set')==='Você','e a ficha passa a dizer que é ele');

  /* ---- o que é só do freela ---- */
  t(!await p.locator('#jb-fora').isHidden(),'"Fui chamado por fora" é dele — a plataforma pode não ter participado');
  t(await p.locator('#jb-det [data-zap]').count()===1,'e o lembrete de véspera no WhatsApp também');
  const antes=await p.locator('#jb-det [data-zap]').textContent();
  await p.locator('#jb-det [data-zap]').click(); await p.waitForTimeout(400);
  const depois=await p.locator('#jb-det [data-zap]').textContent();
  t(antes!==depois&&/ativo/.test(depois),'ligar o lembrete muda o botão: '+depois.trim());
  t(/18h/.test(await det()),'e a tela diz QUANDO chega, em vez de prometer um "lembrete" sem hora');

  /* ============ mobile ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(500);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'o painel cabe no celular, que é onde ele é lido às 6h: '+ov);
  await p.screenshot({path:path.join(__dirname,'saida','painel-do-job.png'),fullPage:false});

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();

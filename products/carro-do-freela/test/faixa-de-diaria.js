/* FILTRO POR DIÁRIA — e a restrição que ele não pode quebrar
 *
 * A casa tem uma regra dura: **não inventar diária de ninguém**. Quase
 * ninguém publicou tabela, então um filtro por valor tinha duas formas
 * fáceis de mentir:
 *
 *   · sumir com quem não publicou — cortar trabalho de gente por causa de
 *     um campo em branco que ninguém pediu para preencher;
 *   · mostrar um número ao lado do nome sem dizer que é estimativa da
 *     PRAÇA, e não o preço daquela pessoa.
 *
 * O desenho: teto ("até quanto eu tenho"), quem publicou entra pelo valor
 * dele, quem não publicou entra pelo PISO da faixa da praça, e a linha diz
 * qual das duas coisas está mostrando.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

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
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(230);
  await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(550);
  await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350);
  await p.locator('#as-f').click(); await p.waitForTimeout(300);
  await p.evaluate(()=>show('pracas')); await p.waitForTimeout(280);
  await p.locator('#pracas .pc').first().click(); await p.waitForTimeout(500);
  await p.evaluate(()=>{painelFiltros=true;render()}); await p.waitForTimeout(350);
  await p.evaluate(()=>{S.only=false;v('f-only').checked=false;render()}); await p.waitForTimeout(300);

  /* ============ o controle ============ */
  t(await p.locator('#f-diaria').isVisible(),'o painel tem filtro de diária');
  t(await p.locator('#f-diaria [data-dv]').count()===4,'com "Qualquer" e três tetos');
  t(await p.locator('[data-dv=""]').getAttribute('aria-pressed')==='true','"Qualquer" começa selecionado');
  /* ⚠️ POSIÇÃO É EXPLICAÇÃO: sozinho o teto quase não corta, porque as
     faixas da praça começam todas entre 400 e 1200. Ele mora logo abaixo
     de Função, que é o que o torna exato. */
  const ordem=await p.evaluate(()=>{
    const f=document.querySelector('#f-func').closest('.fgroup');
    const d=document.getElementById('f-diag');
    return f.compareDocumentPosition(d)&Node.DOCUMENT_POSITION_FOLLOWING?'depois':'antes';
  });
  t(ordem==='depois','e ele vem logo depois de Função — sozinho o teto quase não corta');

  const total=await p.evaluate(()=>filtrar().length);
  t(total>0,'a lista começa cheia: '+total);

  /* ============ o teto corta ============ */
  await p.locator('[data-dv="500"]').click(); await p.waitForTimeout(400);
  const n500=await p.evaluate(()=>filtrar().length);
  t(n500>0&&n500<total,'"até 500" corta de verdade: '+n500+' de '+total);
  t(await p.locator('[data-dv="500"]').getAttribute('aria-pressed')==='true','o botão marca');
  t(await p.locator('[data-dv=""]').getAttribute('aria-pressed')==='false','e "Qualquer" desmarca');

  /* ⚠️ A ASSERÇÃO QUE PROTEGE A REGRA: ninguém sai da lista por causa de
     um campo em branco. Quem não publicou entra pelo PISO da faixa. */
  const regra=await p.evaluate(()=>{
    const dentro=filtrar();
    const semTabela=dentro.filter(c=>!temTabela(c)).length;
    const coerente=dentro.every(c=>funcsDoFiltro(c).some(f=>{
      const x=precoDe(c,f);
      return (x.exato!=null?x.exato:x.min)<=S.diaria;
    }));
    const fora=CREW.filter(c=>!dentro.includes(c));
    const injusto=fora.filter(c=>funcsDoFiltro(c).some(f=>{
      const x=precoDe(c,f);
      return (x.exato!=null?x.exato:x.min)<=S.diaria;
    })&&c.cidade===S.cidade).length;
    return {semTabela,coerente,injusto};
  });
  t(regra.semTabela>0,'quem NÃO publicou tabela continua na lista: '+regra.semTabela+' pessoas');
  t(regra.coerente,'e todo mundo que entrou tem função cujo valor cabe no teto');
  t(regra.injusto===0,'ninguém que caberia ficou de fora — o filtro não pune campo em branco');

  /* ============ a linha diz qual é qual ============ */
  const rots=await p.locator('#rows .row .vlr').allTextContents();
  t(rots.length>0,'com o teto ligado, a linha passa a mostrar o valor: '+rots.length+' linhas');
  t(rots.every(x=>/faixa da praça|tabela dele/.test(x)),
    'e cada uma diz se é TABELA da pessoa ou FAIXA da praça — número sem essa palavra vira preço combinado na cabeça de quem lê');
  /* ⚠️ o rótulo tem que explicar a presença de QUEM ele rotula. A primeira
     versão mostrava a primeira função da pessoa: uma diretora de fotografia
     aparecia sob o teto de 700 com "faixa R$ 1.200–R$ 1.800" ao lado, e a
     leitura era de erro do filtro. */
  const explica=await p.evaluate(()=>filtrar().every(c=>{
    const q=funcQueCabe(c,S.diaria);
    const base=q.p.exato!=null?q.p.exato:q.p.min;
    return base<=S.diaria;
  }));
  t(explica,'e o valor mostrado é o da função que fez a pessoa CABER, não a primeira da lista dela');

  await p.locator('[data-dv=""]').click(); await p.waitForTimeout(400);
  t(await p.locator('#rows .row .vlr').count()===0,
    'sem o filtro o valor some da linha — quatro informações por linha é decisão, não acaso');
  t(await p.evaluate(()=>filtrar().length)===total,'e a lista volta ao total');

  /* ============ com função escolhida ele fica exato ============ */
  const df=await p.evaluate(()=>{
    S.funcs=new Set(["Direção de fotografia"]); S.diaria=0; render();
    const todos=filtrar().length;
    S.diaria=600; render();
    const cabe=filtrar().length;
    S.diaria=0; S.funcs=new Set(); render();
    return {todos,cabe,piso:REFERENCIA["Direção de fotografia"][0]};
  });
  t(df.todos>0,'há diretores de fotografia na praça: '+df.todos);
  t(df.cabe===0,'e "DF até R$ 600" devolve ZERO — a faixa dela começa em R$ '+df.piso+
    ', então o teto é exato quando a função está escolhida');

  /* ============ a nota conta a verdade ============ */
  await p.locator('[data-dv="700"]').click(); await p.waitForTimeout(400);
  const nota=(await p.locator('#f-diaria-n').textContent()).trim();
  t(/valor publicado/.test(nota)&&/faixa da praça/.test(nota),
    'a nota separa quem declarou de quem foi estimado');
  const conta=await p.evaluate(()=>{
    const l=filtrar(), est=l.filter(c=>porEstimativa(c,S.diaria)).length;
    return {dito:l.length-est,est};
  });
  t(nota.startsWith(conta.dito+' com valor publicado'),'com o número certo de declarados: '+conta.dito);
  t(nota.includes(conta.est+' pela faixa'),'e de estimados: '+conta.est);
  /* ⚠️ a nota também confessa o limite do filtro sem função */
  t(/Escolha a função acima/.test(nota),
    'e avisa que sem função escolhida o teto quase não corta — em vez de deixar a pessoa achar que filtrou');
  await p.evaluate(()=>{S.funcs=new Set(["Op. de câmera"]);render()}); await p.waitForTimeout(350);
  t(!/Escolha a função acima/.test((await p.locator('#f-diaria-n').textContent())),
    'com a função escolhida o aviso sai — ele só existe enquanto é verdade');

  /* ============ limpar limpa ============ */
  await p.locator('#f-clear').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>S.diaria)===0,'"Limpar filtros" zera a diária junto');
  t(await p.locator('[data-dv=""]').getAttribute('aria-pressed')==='true','e o botão volta para "Qualquer"');

  /* ============ mobile ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>{painelFiltros=true;S.only=false;S.diaria=500;render()}); await p.waitForTimeout(400);
  /* ⚠️ este número já foi 38: o rótulo tinha `white-space:nowrap` herdado
     das duas linhas curtas ao lado, e ao nomear a função ele empurrava a
     página inteira para o lado */
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);
  await p.screenshot({path:path.join(__dirname,'saida','faixa-de-diaria.png')});

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();

/**
 * O MENU — de mapa de telas a gaveta (17/out · 10).
 *
 * Ele nasceu mapa (18/ago, a hierarquia do Maestro): grade de cartões em
 * grupos, "AQUI" na tela aberta e um grupo de telas que não abrem pelo
 * menu. Victor, em 17/out: "esse menu é muito feio e não acho muito
 * intuitivo, muita coisa, fica cansativo" — com a Lorien e a ZRO de
 * referência. Virou GAVETA de uma coluna. O que esta suíte protege:
 *   - a conta no topo, e ela É a porta do Meu perfil ("lá em cima");
 *   - Planos lá em cima, logo abaixo da conta, com o TIPO do plano;
 *   - as telas por intenção: o dia, Encontrar, Ferramentas, A praça;
 *   - o que se usa pouco RECOLHIDO, e abrindo/fechando como a pessoa deixou;
 *   - nenhuma linha morta (o "Dentro do fluxo" saiu: botão que não abre
 *     nada é justamente o que cansava);
 *   - uma tela só marcada, e o azul de seleção só nela;
 *   - a gaveta muda com o lado da conta;
 *   - as sub-telas do brechó levam ao painel certo.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const abrir=async p=>{ await p.locator('#menu-bt:visible, #bt-menu:visible').first().click();
  await p.waitForTimeout(420); };

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{ if(m.type()!=='error') return;
    if(/web3forms/.test((m.location()&&m.location().url)||'')) return; errs.push(m.text()); });
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(500);

  /* ============ é gaveta, não mapa ============ */
  await abrir(p);
  t(await p.locator('#gaveta').evaluate(e=>e.classList.contains('on')),'o menu abre');
  const geo0=await p.evaluate(()=>{const r=document.getElementById('gaveta').getBoundingClientRect();
    return {x:Math.round(r.left),w:Math.round(r.width),vw:innerWidth}});
  t(geo0.x<=16&&geo0.w<geo0.vw/2,'⟶⟶ como GAVETA, encostada à esquerda — não mais uma folha do tamanho da tela ('+geo0.x+'px, '+geo0.w+' de '+geo0.vw+')');
  t(await p.locator('#gaveta h2').count()===0&&await p.locator('#g-conta').count()===0,
    'sem o título "Todas as telas" nem a contagem de telas — é menu, não inventário');
  t(await p.locator('#gaveta .mn-marca').isVisible()&&await p.locator('#gaveta [data-previa]').isVisible(),
    'abre com a marca e o selo Prévia, como a barra do app');

  /* ============ a conta em cima é o Meu perfil ============
     Victor (19/ago): "meu perfil ficar lá em cima perto de Início". Na
     gaveta ele virou o chip da conta logo abaixo da marca — o da ZRO, com
     trocar e sair ao lado. */
  const posConta=await p.evaluate(()=>{const c=document.getElementById('g-perfil').getBoundingClientRect(),
    l=document.querySelector('#gaveta .mn-lista').getBoundingClientRect(); return c.bottom<=l.top+1});
  t(posConta,'a conta fica ACIMA da lista de telas');
  t(/freela/.test(await p.locator('#g-lado').textContent()),'e diz de que lado ela é');
  t(await p.locator('#gaveta #g-trocar').isVisible()&&await p.locator('#gaveta #g-sair').isVisible(),
    'com trocar de conta e sair ao lado, sem ocupar linha');

  /* ============ os blocos ============ */
  const hoje=await p.locator('#g-hoje .gitem').allTextContents();
  t(/Feed/.test(hoje[0]),'a lista começa pelo FEED, que é onde o login cai');
  t(hoje.some(x=>/Propostas/.test(x))&&hoje.some(x=>/Minha agenda/.test(x))&&hoje.some(x=>/Meus jobs/.test(x)),
    'o primeiro bloco é o dia: Propostas, Agenda, Jobs ('+hoje.length+' linhas)');
  const secs=await p.locator('#gaveta .mn-sec').allTextContents();
  t(secs.join('|')==='Encontrar|Ferramentas|A praça','⟶⟶ as seções são a intenção, na ordem do uso: '+secs.join(' · '));
  /* Encontrar: o que é de graça vem antes da vitrine paga — a regra que a
     lateral já seguia ("a tela paga não vem na frente do que o freela usa
     de graça") */
  const trab=await p.locator('#g-nav .gitem').allTextContents();
  t(/Vagas/.test(trab[0])&&trab.findIndex(x=>/Montar equipe/.test(x))>trab.findIndex(x=>/Achar alguém/.test(x)),
    'Encontrar abre com Vagas e Achar alguém, antes de Montar equipe: '+trab.map(x=>x.trim()).join(', '));
  const ferr=await p.locator('#g-ferr .gitem').allTextContents();
  t(ferr.some(x=>/Orçamento/.test(x))&&ferr.some(x=>/Cofre/.test(x))&&ferr.some(x=>/Porta-malas/.test(x)),
    'Orçamento, Cofre e Porta-malas em Ferramentas');

  /* ============ PLANOS LÁ EM CIMA, COM O TIPO ============
     Victor, com a linha "Planos [Profissional]" de referência: "bota a aba
     de planos assim, e o tipo de plano, lá em cima". */
  const pl=await p.evaluate(()=>{const g=document.getElementById('g-plano'), r=g.getBoundingClientRect(),
    c=document.getElementById('g-perfil').getBoundingClientRect(), l=document.querySelector('#gaveta .mn-lista').getBoundingClientRect();
    return {vis:!!g.offsetParent, abaixoConta:r.top>=c.bottom-1, acimaLista:r.bottom<=l.top+1,
      tipo:document.getElementById('g-plano-tipo').textContent, esperado:tipoPlano().nome,
      pago:document.getElementById('g-plano-tipo').classList.contains('pago')}});
  t(pl.vis&&pl.abaixoConta&&pl.acimaLista,'⟶⟶ Planos é a linha logo abaixo da conta, acima de todas as telas');
  t(pl.tipo==='Grátis'&&pl.tipo===pl.esperado&&!pl.pago,'com o tipo do plano à direita, derivado da escada: '+pl.tipo);
  t(!(await p.locator('#gaveta .mn-lista .gitem').allTextContents()).some(x=>/Planos/.test(x)),
    'e ele não se repete dentro da lista');
  /* ⚠️ "Mensagens" SAIU do mapa (23/ago, pedido do Victor): ela abria a MESMA
     tela de Propostas. O contador de conversa não lida mudou de casa. */
  t(!(await p.locator('#gaveta .gitem').allTextContents()).some(x=>/Mensagens/.test(x)),
    'Mensagens não é item — ela É a aba Propostas');
  t(await p.locator('#g-msgs').count()===0,'e o botão dela não existe em lugar nenhum');
  t(await p.locator('#gaveta [data-ir="propostas"] #g-msg-bg').count()===1,
    'o contador de conversa não lida vive no item de Propostas');
  await p.locator('#gaveta [data-ir="propostas"]').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>S.tab)==='propostas','e Propostas abre a caixa pelo menu');
  await abrir(p);

  /* ============ nenhuma linha morta ============
     O grupo "Dentro do fluxo" listava quatro telas DESABILITADAS (perfil de
     alguém, anúncio, salão, painel do job) para mostrar o tamanho do
     produto. Na gaveta isso era peso sem porta — saiu. */
  t(await p.locator('#gaveta button[disabled]').count()===0,'nenhum botão desabilitado no menu');
  t(!/Dentro do fluxo/.test(await p.locator('#gaveta').textContent()),'e o grupo "Dentro do fluxo" não existe mais');

  /* ============ o que se usa pouco fica recolhido ============ */
  const ajuda=p.locator('#gaveta [data-sanf="ajuda"] .mn-abre');
  t(await ajuda.getAttribute('aria-expanded')==='false'&&!await p.locator('.gitem[data-ajuda="faq"]').isVisible(),
    'Ajuda nasce recolhida — documentação é leitura de uma vez na vida');
  t(!await p.locator('#g-zerar').isVisible(),'"Recomeçar do zero" também (em Ajustes): apagar tudo não fica à mão');
  t(await p.locator('#g-tema').isVisible()&&await p.locator('#g-som').isVisible(),
    'tema e som ficam À VISTA no pé — botão que se aperta no meio de uma gravação');
  await ajuda.click(); await p.waitForTimeout(250);
  t(await ajuda.getAttribute('aria-expanded')==='true'&&await p.locator('.gitem[data-ajuda="faq"]').isVisible(),
    'um toque abre o grupo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await abrir(p);
  t(await ajuda.getAttribute('aria-expanded')==='true','e ele continua aberto na próxima vez — a gaveta lembra como a pessoa deixou');
  await ajuda.click(); await p.waitForTimeout(250);
  t(!await p.locator('.gitem[data-ajuda="faq"]').isVisible(),'outro toque recolhe');

  /* ============ uma tela marcada ============ */
  const marcadas=await p.locator('#gaveta .gitem[aria-current="true"]').count();
  t(marcadas===1,'uma tela só é marcada ('+marcadas+')');
  const marcada=await p.locator('#gaveta .gitem[aria-current="true"]').textContent();
  t(/Propostas/.test(marcada),'e é a que está aberta ('+marcada.replace(/\s+/g,' ').trim()+')');
  /* o azul de seleção é só dela — o mesmo da lateral */
  const azuis=await p.evaluate(()=>{
    const alvo=getComputedStyle(document.documentElement).getPropertyValue('--az-tx').trim();
    const rgb=t=>{const d=document.createElement('div');d.style.color=t;document.body.appendChild(d);
      const r=getComputedStyle(d).color;d.remove();return r};
    const acento=rgb(alvo);
    return [...document.querySelectorAll('#gaveta .gitem')]
      .filter(e=>e.offsetParent&&getComputedStyle(e).color===acento).length;
  });
  t(azuis===1,'e é o único item com a cor de seleção na gaveta inteira ('+azuis+')');

  /* navegar move a marca */
  await p.locator('#g-hoje .gitem[data-ir="agenda"]').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>S.tab)==='agenda','clicar leva para a tela');
  t(await p.locator('#gaveta').evaluate(e=>!e.classList.contains('on')),'e fecha o menu');
  await abrir(p);
  t(/Minha agenda/.test(await p.locator('#gaveta .gitem[aria-current="true"]').textContent()),
    'reabrindo, a marca acompanhou');

  /* ============ a conta leva ao perfil ============ */
  await p.locator('#g-perfil').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>S.tab)==='meu','tocar na conta abre o Meu perfil');
  await abrir(p);
  t(await p.locator('#g-perfil').getAttribute('aria-current')==='true','e a conta fica marcada quando é ela a tela aberta');

  /* ============ sub-telas do brechó: o grupo que abre ============ */
  const brecho=p.locator('#g-mercado [data-sanf="brecho"] .mn-abre');
  t(await brecho.getAttribute('aria-expanded')==='false','o Brechó é um grupo, recolhido fora dele');
  await brecho.click(); await p.waitForTimeout(250);
  t(await p.locator('#g-mercado .gitem[data-irbp="comprar"]').isVisible(),'abrindo, aparece o catálogo e os painéis');
  await p.locator('#g-mercado .gitem[data-irbp="inv"]').click(); await p.waitForTimeout(600);
  t(await p.evaluate(()=>S.tab)==='brecho','a sub-tela leva ao brechó');
  t(await p.locator('#bp-inv').isVisible(),'já no painel certo — o inventário');
  await abrir(p);
  t(await p.locator('#g-mercado .gitem[data-irbp="inv"][aria-current="true"]').isVisible(),
    'dentro do brechó o grupo abre sozinho, com o painel aberto marcado');

  /* ============ muda com o lado da conta ============ */
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(()=>{ MODO="contratante"; aplicarModo(); });
  await p.waitForTimeout(300); await abrir(p);
  const rots=await p.locator('#gaveta .mn-lista .gitem').allTextContents();
  t(rots.some(x=>/Montar equipe/.test(x))&&rots.some(x=>/Passar o carro/.test(x)),'de contratante aparecem Montar equipe e Passar o carro');
  t(!rots.some(x=>/Minha agenda/.test(x)),'e a agenda do freela some');
  t(/contrata/.test(await p.locator('#g-lado').textContent()),'a conta diz de que lado é');

  /* ============ fechar ============ */
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  t(await p.locator('#gaveta').evaluate(e=>!e.classList.contains('on')),'Esc fecha');

  /* ============ celular ============ */
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const m=await ctx.newPage();
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await m.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await m.goto(URL,{waitUntil:'networkidle'});
  await m.locator('.homenav .entrar-cta').click(); await m.waitForTimeout(250);
  await m.locator('[data-login="Google"]').click(); await m.waitForTimeout(600);
  await abrir(m);
  t(await m.locator('#gaveta').evaluate(e=>e.classList.contains('on')),'abre no celular');
  const gm=await m.evaluate(()=>{const r=document.getElementById('gaveta').getBoundingClientRect();
    return {x:Math.round(r.left),dir:Math.round(r.right),vw:innerWidth}});
  t(gm.x===0&&gm.dir<gm.vw-40,'no celular ela entra pela esquerda e deixa a página à vista do lado ('+gm.dir+' de '+gm.vw+')');
  t(await m.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1,
    'sem overflow horizontal');
  t(await m.locator('#fbk-btn').evaluate(e=>getComputedStyle(e).opacity==='0'),
    'e o botão de suporte sai da frente enquanto o mapa está aberto');

  /* ============ a âncora do que fica embaixo ============
     A faixa que aparecia sob a barra de abas no iPhone vem da diferença
     entre o viewport de LAYOUT (onde position:fixed ancora) e o VISUAL
     (o que a pessoa enxerga). Aqui os dois coincidem, então a conta tem
     de dar zero — o conserto não pode deslocar nada onde não há faixa. */
  t(await m.evaluate(()=>ancorarNoVisivel())===0,
    'sem diferença entre layout e visível, a âncora não desloca nada');
  const barra=await m.evaluate(()=>{
    const r=document.getElementById('bottombar').getBoundingClientRect();
    return {fim:Math.round(r.bottom),janela:innerHeight};
  });
  t(barra.fim===barra.janela,'e a barra de abas termina exatamente no fim da janela ('+barra.fim+')');
  t(await m.evaluate(()=>typeof visualViewport!=="undefined"&&
      getComputedStyle(document.documentElement).getPropertyValue('--sobra-baixo').trim()==='0px'),
    'a medida fica publicada em --sobra-baixo, para a barra e o que anda com ela');

  /* ============ O SUPORTE NÃO PODE COBRIR A BARRA ============
     Victor: "o botão de suporte tá ficando na frente do botão de menu".
     O botão se apoiava em --barra-baixo, uma variável que NUNCA FOI
     DEFINIDA — valia o fallback de 64px. No emulador a barra mede 59 e o
     palpite acerta; no iPhone ela mede 59 MAIS a faixa do indicador de
     casa e passa de 90, e o botão parado nos 76px cai em cima do Menu,
     que é justamente o item daquele canto.
     Como env(safe-area-inset-bottom) é zero no headless, a faixa é
     injetada à mão: é o único jeito de este teste enxergar o defeito. */
  t(await m.evaluate(()=>getComputedStyle(document.documentElement)
      .getPropertyValue('--barra-baixo').trim())===
    await m.evaluate(()=>Math.round(document.getElementById('bottombar').getBoundingClientRect().height)+'px'),
    '--barra-baixo é a altura MEDIDA da barra, não um palpite');
  await m.locator('#g-x').click(); await m.waitForTimeout(300);
  await m.addStyleTag({content:'#bottombar{padding-bottom:40px!important}'});
  await m.evaluate(()=>dispatchEvent(new Event('resize'))); await m.waitForTimeout(300);
  const enc=await m.evaluate(()=>{
    const r=e=>document.getElementById(e).getBoundingClientRect();
    const f=r('fbk-btn'), menu=r('bt-menu'), bar=r('bottombar');
    return {barra:Math.round(bar.height),
      cobreMenu:!(f.right<menu.left||f.left>menu.right||f.bottom<menu.top||f.top>menu.bottom),
      invade:f.bottom>bar.top};
  });
  t(enc.barra>=90,'com a faixa do iPhone a barra passa de 90px ('+enc.barra+')');
  t(!enc.cobreMenu,'e mesmo assim o suporte NÃO cobre o botão de Menu');
  t(!enc.invade,'nem entra na barra — ele sobe junto com ela');
  await ctx.close();

  /* ============ A FAIXA DE CIMA — o desktop ============
     Ela ficou sem revisão enquanto a barra de baixo e o menu eram
     arrumados, e desencontrou dos dois. */
  await p.evaluate(()=>{MODO='freela';aplicarModo();show('pracas')}); await p.waitForTimeout(350);
  const abas=await p.evaluate(()=>[...document.querySelectorAll('.top .tabs .tab')]
    .filter(e=>e.offsetParent!==null).map(e=>e.textContent.replace(/\d+$/,'').trim()));
  /* desde 17/out · 10 Planos fica EM CIMA da lateral, com o tipo — o
     resto continua começando como a barra de baixo */
  t(/^Planos/.test(abas[0]),'Planos é o primeiro item da lateral, como na gaveta');
  t(await p.locator('.top .tab[data-tab="planos"] .pl-tipo').textContent()==='Grátis','com o tipo do plano ao lado');
  t(abas[1]==='Feed'&&abas[2]==='Propostas','e depois dele a faixa começa como a barra de baixo: Feed, Propostas');
  t(abas.includes('Jobs'),'MEUS JOBS existe aqui — estava na barra e no menu, e faltava só na faixa');
  t(abas.indexOf('Perfil')>abas.indexOf('Jobs'),
    'e o perfil não fica no meio da operação — o mesmo erro que o menu já corrigiu');
  /* "Montar equipe" era a SEGUNDA aba do freela: uma tela paga e trancada
     na frente das propostas e da agenda dele */
  t(abas.indexOf('Equipe')>abas.indexOf('Propostas'),
    'e a tela paga não vem na frente do que o freela usa de graça');
  /* o mesmo nome nos três lugares */
  const barBaixo=await p.evaluate(()=>[...document.querySelectorAll('#bottombar .bt')]
    .filter(e=>!e.hidden).map(e=>(e.querySelector('span')||{}).textContent||''));
  ['Agenda','Jobs','Brechó','Guilda','Feed','Propostas'].forEach(r=>
    t(abas.includes(r)&&barBaixo.includes(r),
      '"'+r+'" se chama igual em cima e embaixo — nome diferente é o usuário aprendendo duas vezes'));
  t(await p.locator('.tab[data-tab="equipe"]').getAttribute('title')==='Montar equipe',
    'e o nome por extenso fica no title, para quem passa o mouse');
  /* ⟶ A DISTRIBUIÇÃO. O margin-right:auto estava na MARCA, então ela
     empurrava as abas para a direita: a navegação terminava espremida
     contra a carteira e o nome, com um vazio no meio-esquerda da barra.
     Grande site nenhum faz isso — em Stripe, Linear, GitHub a navegação
     pertence à marca e as AÇÕES é que vão para a ponta. */
  const geo=await p.evaluate(()=>{
    const r=e=>{const b=document.querySelector(e).getBoundingClientRect();return{x:b.x,r:b.right}};
    const w=document.querySelector('.top .wrap');
    const cs=getComputedStyle(w), bw=w.getBoundingClientRect();
    /* a borda de CONTEÚDO, não a da caixa: o .wrap tem 22px de padding e
       comparar com a borda externa acusaria falha onde não há */
    return {marca:r('.top .brand'),abas:r('.top .tabs'),acoes:r('.top .acoes'),
      fimUtil:bw.right-parseFloat(cs.paddingRight)};
  });
  t(geo.abas.x-geo.marca.r<40,'as abas começam logo depois da marca, não empurradas para a direita');
  t(geo.acoes.r>=geo.fimUtil-2,'e as ações terminam na ponta direita da barra');
  t(geo.acoes.x-geo.abas.r>0,'com a folga do meio ENTRE navegação e ações, que é onde ela respira');

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

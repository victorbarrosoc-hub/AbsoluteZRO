const { chromium } = require('playwright');
const path=require('path');
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

const AUDIT = `(() => {
  function px(c){const m=c.match(/[\\d.]+/g);if(!m)return null;
    const a=m.length>3?+m[3]:1;return {r:+m[0],g:+m[1],b:+m[2],a};}
  function lum({r,g,b}){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};
    return .2126*f(r)+.7152*f(g)+.0722*f(b)}
  function over(fg,bg){ // fg com alpha sobre bg — source-over de verdade.
    // Bug antigo: devolvia a:1 sempre, então duas camadas de 9% viravam
    // fundo opaco e o contraste era medido contra uma cor que nunca existiu.
    const a=fg.a+bg.a*(1-fg.a);
    if(!a) return {r:0,g:0,b:0,a:0};
    const m=(x,y)=>(x*fg.a+y*bg.a*(1-fg.a))/a;
    return {r:m(fg.r,bg.r),g:m(fg.g,bg.g),b:m(fg.b,bg.b),a}}
  function bgOf(el){
    let n=el, acc=null;
    while(n && n!==document.documentElement.parentNode){
      const cs=getComputedStyle(n);
      const c=px(cs.backgroundColor);
      const hasImg = cs.backgroundImage && cs.backgroundImage!=='none';
      if(hasImg) return {c:null,img:true};
      if(c && c.a>0){ acc = acc? over(acc,c) : c; if(acc.a>=.999) return {c:acc,img:false}; }
      n=n.parentElement;
    }
    return {c:{r:255,g:255,b:255,a:1},img:false};
  }
  const out=[];
  document.querySelectorAll('*').forEach(el=>{
    if(el.offsetParent===null && getComputedStyle(el).position!=='fixed') return;
    const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) return;
    // só elementos com texto próprio
    const txt=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
    if(!txt) return;
    const cs=getComputedStyle(el);
    const fg=px(cs.color); if(!fg) return;
    const b=bgOf(el); if(b.img||!b.c) return;
    const eff=fg.a<1?over(fg,b.c):fg;
    const L1=lum(eff),L2=lum(b.c);
    const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    const size=parseFloat(cs.fontSize), bold=+cs.fontWeight>=700;
    const grande = size>=24 || (size>=18.66 && bold);
    const min = grande?3:4.5;
    if(ratio < min) out.push({sel:el.tagName.toLowerCase()+'.'+(el.className&&el.className.baseVal===undefined?String(el.className).split(' ').filter(Boolean).join('.'):''),
      txt:txt.slice(0,42), ratio:+ratio.toFixed(2), min, size:+size.toFixed(1), color:cs.color, bg:'rgb('+[b.c.r,b.c.g,b.c.b].map(Math.round)+')'});
  });
  // dedup por seletor+razão
  const seen=new Set(); return out.filter(o=>{const k=o.sel+o.ratio; if(seen.has(k))return false; seen.add(k); return true;});
})()`;

/* ⚠️ O PONTO CEGO DA AUDITORIA DE CIMA: ela só olha elemento com NÓ DE
   TEXTO próprio. O que a pessoa digita num <textarea> ou num <input> não é
   nó de texto — é a propriedade .value — e campo vazio não tem texto
   nenhum. Resultado: todo campo de formulário era invisível para a
   varredura, e ficou meses um `button,input,select{color:inherit}` sem
   `textarea` dentro. Sem herdar, o navegador pinta com a cor de sistema:
   texto PRETO no fundo grafite, razão 1.2. Quem achou foi o Victor, no
   campo do roteiro — e eram 10 campos, não um.
   Esta varredura mede a cor declarada do controle contra o fundo dele,
   mesmo em tela escondida: a cor vem do CSS, não de estar à vista. */
const CAMPOS = `(() => {
  function px(c){const m=c.match(/[\\d.]+/g);if(!m)return null;
    const a=m.length>3?+m[3]:1;return {r:+m[0],g:+m[1],b:+m[2],a};}
  function lum({r,g,b}){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};
    return .2126*f(r)+.7152*f(g)+.0722*f(b)}
  function fundo(el){
    let n=el;
    while(n){ const c=px(getComputedStyle(n).backgroundColor);
      if(c&&c.a>=.999) return c; n=n.parentElement; }
    return {r:255,g:255,b:255,a:1};
  }
  const out=[];
  document.querySelectorAll('input,textarea,select').forEach(el=>{
    const t=(el.type||'').toLowerCase();
    if(['hidden','file','color','range','checkbox','radio','submit','button','image'].includes(t)) return;
    const cs=getComputedStyle(el);
    const fg=px(cs.color); if(!fg) return;
    const bg=fundo(el);
    const L1=lum(fg), L2=lum(bg);
    const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    if(ratio<4.5) out.push({campo:(el.id||el.className||el.tagName), tag:el.tagName.toLowerCase(),
      ratio:+ratio.toFixed(2), color:cs.color, bg:'rgb('+[bg.r,bg.g,bg.b].map(Math.round)+')'});
  });
  return out;
})()`;

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  const res={};

  for(const tema of ['dark','light']){
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.evaluate(t=>{try{localStorage.setItem('cf-app-tema',t)}catch(e){}},tema);
    await p.reload({waitUntil:'networkidle'});
    /* ⚠️ ESPERAR O VÉU DA ABERTURA SAIR ANTES DE MEDIR (25/ago). Ele cobre
       a tela por ~3s e o fundo dele fica em TRANSIÇÃO na saída — medir aí
       acusa pares que olho nenhum vê parado, e com razão variável (1.69
       numa rodada, 1.07 noutra), que é a assinatura de corrida. Medido: o
       véu parado dá 16.1 no escuro e 12.3 no claro, então não há defeito
       de cor nele. ⚠️ TODA PÁGINA QUE FAZ `goto` PRECISA DESTA ESPERA —
       é a mesma família do `addInitScript` que só preparava a primeira. */
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:9000}).catch(()=>{});
    res[tema+'_classe']=await p.evaluate(()=>document.documentElement.className);
    res[tema+'_pressed']=await p.evaluate(()=>[...document.querySelectorAll('.homenav .tema button')].map(x=>x.dataset.tema+':'+x.getAttribute('aria-pressed')).join(','));
    const bad=[];
    const push=(nome,l)=>l.forEach(x=>bad.push(Object.assign({tela:nome},x)));

    push('home', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-home.png'),fullPage:true});

    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(250);
    push('entrar', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-entrar.png')});

    /* a auditoria varre as telas de contratar, que são da conta de contratante */
    await p.locator('[data-lgtipo="contratante"]').click(); await p.waitForTimeout(150);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(350);
    /* a conta de contratante é paga: fecha a assinatura para seguir */
    await p.evaluate(()=>abrirAssinatura()); await p.waitForTimeout(250);
  await p.locator('#as-ok').click(); await p.waitForTimeout(350); await p.locator('#as-f').click(); await p.waitForTimeout(300);
    push('pracas', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-pracas.png'),fullPage:true});

    await p.locator('.tab[data-tab="equipe"]').click(); await p.waitForTimeout(350);
    push('equipe', await p.evaluate(AUDIT));
    await p.evaluate(()=>show('buscar')); await p.waitForTimeout(400);
    push('busca', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-busca.png'),fullPage:true});

    await p.locator('.tab[data-tab="passar"]').click(); await p.waitForTimeout(300);
    push('passar', await p.evaluate(AUDIT));
    await p.locator('.tab[data-tab="propostas"]').click(); await p.waitForTimeout(300);
    push('propostas', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-propostas.png'),fullPage:true});

    /* daqui em diante são telas de freela */
    await p.evaluate(()=>{MODO="freela";aplicarModo()}); await p.waitForTimeout(300);
    await p.locator('.tab[data-tab="agenda"]').click(); await p.waitForTimeout(300);
    push('agenda', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-agenda.png'),fullPage:true});

    /* Vagas (17/out · 9): tela nova entra na auditoria no mesmo dia em que nasce */
    await p.evaluate(()=>show('vagas')); await p.waitForTimeout(400);
    push('vagas', await p.evaluate(AUDIT));
    await p.locator('.tab[data-tab="meu"]').click(); await p.waitForTimeout(400);
    push('meuperfil', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-perfil.png'),fullPage:true});

    // perfil de outra pessoa (capa procedural)
    await p.evaluate(()=>abrirPerfil(CREW[3].id)); await p.waitForTimeout(400);
    push('perfil-outro', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-perfil2.png'),fullPage:true});
    res[tema+'_capa']=await p.evaluate(()=>getComputedStyle(document.querySelector('#v-perfil .capa-bg')).backgroundImage.slice(0,110));

    await p.evaluate(()=>abrirProdutora(PRODUTORAS[0].nome)); await p.waitForTimeout(400);
    push('produtora', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-produtora.png'),fullPage:true});

    await p.locator('.tab[data-tab="brecho"]').click(); await p.waitForTimeout(400);
    push('brecho', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-brecho.png'),fullPage:true});

    await p.locator('[data-bp="vender"]').click(); await p.waitForTimeout(400);
    push('painel-vendas', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-vendas.png'),fullPage:true});
    await p.locator('#ct-sacar').click(); await p.waitForTimeout(350);
    push('saque', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-saque.png')});
    await p.locator('#sq-x').click(); await p.waitForTimeout(250);
    await p.locator('[data-bp="comprar"]').click(); await p.waitForTimeout(300);

    await p.locator('.catcard[data-cat2="lente"]').click(); await p.waitForTimeout(400);
    push('catalogo-categoria', await p.evaluate(AUDIT));
    await p.locator('#b-lista .an').first().click(); await p.waitForTimeout(400);
    push('anuncio', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-anuncio.png'),fullPage:true});

    await p.locator('#a-back').click(); await p.waitForTimeout(250);
    await p.locator('[data-bp="comprar"]').click(); await p.waitForTimeout(250);
    await p.locator('#b-novo2:visible, #b-novo:visible').first().click(); await p.waitForTimeout(300);
    await p.locator('#nv-titulo').fill('Sony A7 IV'); await p.waitForTimeout(350);
    await p.locator('#nv-usar-ref').click(); await p.waitForTimeout(450);
    push('avaliador', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-ia.png'),fullPage:true});

    await p.evaluate(()=>document.querySelectorAll('.ovl').forEach(o=>o.hidden=true)); await p.waitForTimeout(200);
    await p.evaluate(()=>document.querySelectorAll('.ovl').forEach(o=>o.hidden=true));
    await p.evaluate(()=>{MODO="freela";aplicarModo()}); await p.waitForTimeout(300);
    if(await p.locator('[data-tab="meu"]').count()){ await p.locator('[data-tab="meu"]').first().click(); }
    else { await p.locator('#hamb').click(); await p.waitForTimeout(250); await p.locator('[data-gv="meu"]').first().click(); }
    await p.waitForTimeout(450);
    push('meu-portfolio', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-portfolio.png'),fullPage:true});
    await p.locator('#pf-add').click(); await p.waitForTimeout(350);
    push('modal-trabalho', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-trabalho.png')});
    await p.locator('#tb-x').click(); await p.waitForTimeout(250);

    await p.locator('#menu-bt:visible, #bt-menu:visible').first().click(); await p.waitForTimeout(280);
    /* a gaveta (17/out · 10) também é auditada, com os grupos abertos */
    await p.evaluate(()=>document.querySelectorAll('#gaveta .mn-abre[aria-expanded="false"]').forEach(b=>b.click()));
    await p.waitForTimeout(500);
    push('menu', await p.evaluate(AUDIT));
    { const ab=p.locator('#gaveta [data-sanf="ajuda"] .mn-abre'); if(await ab.getAttribute('aria-expanded')!=='true'){ await ab.click(); await p.waitForTimeout(250) } }
    await p.locator('.gitem[data-ajuda="moeda"]').click(); await p.waitForTimeout(650);
    push('take-moeda', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-moeda.png'),fullPage:true});

    await p.locator('.tab[data-tab="aprender"]').click(); await p.waitForTimeout(300);
    push('aprender', await p.evaluate(AUDIT));

    // modo produtora
    await p.evaluate(()=>{MODO='produtora';aplicarModo();show('minhaprod')}); await p.waitForTimeout(400);
    push('minhaprod', await p.evaluate(AUDIT));
    if(tema==='light') await p.screenshot({path:require('path').join(__dirname,'saida','lt-minhaprod.png'),fullPage:true});
    await p.evaluate(()=>{MODO='freela';aplicarModo()});

    /* os campos são varridos DEPOIS de passar por todas as telas: assim a
       varredura pega também os que só existem depois de a tela ser pintada */
    const campos=await p.evaluate(CAMPOS);
    res[tema+'_campos']=campos;
    res[tema+'_campos_n']=campos.length;

    res[tema]=bad;
    res[tema+'_n']=bad.length;
  }

  // toggle ao vivo
  await p.evaluate(()=>show('home')); await p.waitForTimeout(200);
  await p.locator('.homenav .tema [data-tema="dark"]').click(); await p.waitForTimeout(250);
  res.aposClicarDark=await p.evaluate(()=>document.documentElement.className+'|'+localStorage.getItem('cf-app-tema'));
  await p.locator('.homenav .tema [data-tema="light"]').click(); await p.waitForTimeout(250);
  res.aposClicarLight=await p.evaluate(()=>document.documentElement.className+'|'+localStorage.getItem('cf-app-tema'));
  res.sincronizado=await p.evaluate(()=>[...document.querySelectorAll('.tema button')].every(b=>b.getAttribute('aria-pressed')===String(b.dataset.tema==='light')));
  res.ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  // mobile light
  const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errsM=[];m.on('pageerror',e=>errsM.push('ERR: '+e.message));
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await m.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await m.goto(URL,{waitUntil:'networkidle'});
  await m.evaluate(()=>localStorage.setItem('cf-app-tema','light'));
  await m.reload({waitUntil:'networkidle'});
  await m.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:9000}).catch(()=>{});
  res.mobHomeOv=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  await m.screenshot({path:require('path').join(__dirname,'saida','lt-mob-home.png')});
  await m.locator('.homenav .entrar-cta').click(); await m.waitForTimeout(200);
  await m.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await m.waitForTimeout(350);
  res.mobTemaVisivel=await m.locator('.top .tema').isVisible();
  await m.screenshot({path:require('path').join(__dirname,'saida','lt-mob-app.png')});
  res.mobOv=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  await m.locator('.bt[data-tab="brecho"]').click(); await m.waitForTimeout(400);
  await m.screenshot({path:require('path').join(__dirname,'saida','lt-mob-brecho.png')});
  res.mobOv2=await m.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);

  res.errs=errs;res.errsM=errsM;
  console.log(JSON.stringify(res,null,1));

  /* ⚠️ ESTA SUÍTE ERA UM RELATÓRIO, NÃO UM TESTE — despejava JSON e saía com
     zero, achasse o que achasse. Foi por isso que um campo de texto com
     razão 1.2 (preto no grafite) viveu meses no produto sem ninguém
     tropeçar. Agora ela reprova:
       - QUALQUER campo de formulário abaixo de 4.5 — não há caso tolerado,
         e não pode haver: é onde a pessoa lê o que ela mesma escreveu;
       - qualquer achado de TEXTO que não esteja na lista de conhecidos
         abaixo, ou que esteja mas tenha PIORADO.
     A lista de conhecidos é dívida declarada, não perdão: são 8 casos de
     texto secundário sobre fundo tingido, todos entre 3.39 e 4.41. Ficam
     pinados para não se multiplicarem enquanto não forem resolvidos. */
  const CONHECIDOS={
    'span.selo.s-ocupado':3.39,   /* cinza do "Ocupado" sobre o cartão de equipe */
    'span.sb3':4.41,              /* linha do anúncio sobre o tinto âmbar */
    's.':4.41,                    /* preço riscado, mesmo fundo */
    'small.':4.16                 /* dia da semana sobre o tinto verde da agenda */
  };
  const novos=[], piores=[];
  ['dark','light'].forEach(t=>(res[t]||[]).forEach(x=>{
    const teto=CONHECIDOS[x.sel];
    if(teto===undefined) novos.push(t+' · '+x.tela+' · '+x.sel+' · '+JSON.stringify(x.txt)+' · '+x.ratio);
    else if(x.ratio<teto-.05) piores.push(t+' · '+x.sel+' · '+x.ratio+' (era '+teto+')');
  }));
  const campos=[].concat(res.dark_campos||[],res.light_campos||[]);

  const falhas=[];
  campos.forEach(c=>falhas.push('CAMPO ILEGÍVEL: '+c.campo+' ('+c.tag+') '+c.ratio+' — '+c.color+' sobre '+c.bg));
  novos.forEach(x=>falhas.push('CONTRASTE NOVO: '+x));
  piores.forEach(x=>falhas.push('PIOROU: '+x));
  if(falhas.length){ console.log('\n== FALHOU =='); falhas.forEach(x=>console.log('  ✗ '+x)); }
  else console.log('\n  ✓ nenhum campo de formulário ilegível, e nenhum contraste de texto novo');
  await b.close();
  process.exit(falhas.length||errs.length||errsM.length?1:0);
})();

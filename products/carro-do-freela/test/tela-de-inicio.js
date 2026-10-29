/* TELA DE INÍCIO DO IPHONE — o protótipo aberto como aplicativo.
 *
 * Victor (24/ago): *"prepara o protótipo final para tela de app, pra eu
 * colocar na tela de início do meu iphone."*
 *
 * Sem as tags certas, "Adicionar à Tela de Início" gera um atalho que
 * abre no Safari com barra de endereço e usa um PRINT DA PÁGINA como
 * ícone. Com elas, abre em tela cheia com o ícone da marca.
 *
 * O que esta suíte jura:
 * 1. AS TAGS ESTÃO NO <head> DE TODAS AS SAÍDAS — index e as seis fases.
 *    Elas moram no build.js, não no template (o template vira artifact e
 *    artifact não tem head), então é a saída que precisa ser conferida.
 * 2. O ÍCONE É ARQUIVO DE VERDADE, PNG, quadrado, nos três tamanhos.
 *    O iOS ignora `data:` em apple-touch-icon — é a única coisa deste
 *    projeto que não cabe dentro do HTML.
 * 3. O MODO APP MUDA O LAYOUT, E SÓ ELE. `viewport-fit=cover` entra
 *    apenas em standalone: no Safari ele cria a faixa embaixo da barra
 *    de abas que esta casa levou cinco tentativas para consertar.
 * 4. O NOME CABE. O iOS corta em ~12 caracteres.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const pub = f => path.join(RAIZ, 'public', f);

(async()=>{
  const b=await require('./_navegador.js').abrir();

  /* ============ 1. as tags, em TODAS as saídas ============ */
  const TAGS=[
    ['<link rel="apple-touch-icon"','o ícone da tela de início'],
    ['name="apple-mobile-web-app-capable" content="yes"','abrir sem a barra do Safari'],
    ['name="apple-mobile-web-app-status-bar-style"','o estilo da barra de status'],
    ['name="apple-mobile-web-app-title"','o nome embaixo do ícone'],
    ['rel="manifest"','o manifest (Android e Chrome)'],
    ['name="theme-color"','a cor da barra do sistema']
  ];
  const saidas=['index'].concat([1,2,3,4,5,6].map(f=>'fase-'+f))
    .filter(n=>fs.existsSync(pub(n+'.html')));
  t(saidas.length===7,'as sete saídas existem para conferir: '+saidas.length);
  const semTag=[];
  for(const nome of saidas){
    const head=fs.readFileSync(pub(nome+'.html'),'utf8').slice(0,6000);
    for(const [tag,oque] of TAGS) if(!head.includes(tag)) semTag.push(nome+' sem '+oque);
  }
  t(semTag.length===0,'⟶⟶ as seis tags estão no <head> das sete saídas'
    +(semTag.length?': '+semTag.slice(0,4).join(' · '):''));

  /* ⚠️ o artifact NÃO tem head — e não pode ganhar um. Se alguém puser as
     tags no template para "resolver", o visualizador aninha dois
     documentos. A ausência aqui é o comportamento certo. */
  if(fs.existsSync(pub('artifact.html'))){
    const art=fs.readFileSync(pub('artifact.html'),'utf8').slice(0,3000);
    t(!art.includes('apple-touch-icon'),
      'e NÃO estão no artifact.html — ele não tem <head>, e não pode ter');
  }

  /* ============ 2. o nome cabe embaixo do ícone ============ */
  const head0=fs.readFileSync(pub('index.html'),'utf8').slice(0,6000);
  const nome=(head0.match(/apple-mobile-web-app-title" content="([^"]*)"/)||[,''])[1];
  t(nome.length>0&&nome.length<=12,
    '⟶⟶ o nome cabe sem cortar no iOS (~12 caracteres): "'+nome+'" ('+nome.length+')');

  /* ============ 3. o ícone é arquivo, PNG e quadrado ============ */
  const ICONES=[['apple-touch-icon.png',180],['icone-192.png',192],['icone-512.png',512]];
  for(const [arq,lado] of ICONES){
    if(!fs.existsSync(pub(arq))){ t(false,arq+' não existe — rode `node src/icone.js`'); continue }
    const bin=fs.readFileSync(pub(arq));
    /* assinatura PNG + IHDR: largura e altura são big-endian nos bytes 16..23 */
    const png=bin.slice(1,4).toString('ascii')==='PNG';
    const w=bin.readUInt32BE(16), h=bin.readUInt32BE(20);
    t(png&&w===lado&&h===lado,arq+' é PNG '+w+'×'+h+(png?'':' — NÃO é PNG'));
  }
  /* o ícone não pode ser transparente: o iOS põe fundo PRETO por baixo e
     a marca ciano sobre preto puro não é a cor da casa */
  const px=await (async()=>{
    const ctx=await b.newContext(); const p=await ctx.newPage();
    /* ⚠️ data URI, não file://: uma página `about:blank` não tem base para
       resolver caminho local e a imagem nasce 'broken' em silêncio. */
    const b64=fs.readFileSync(pub('apple-touch-icon.png')).toString('base64');
    await p.setContent('<img id=i src="data:image/png;base64,'+b64+'">');
    await p.waitForFunction(()=>{const i=document.getElementById('i');
      return i.complete&&i.naturalWidth>0});
    const r=await p.evaluate(()=>{
      const c=document.createElement('canvas'); c.width=c.height=180;
      const x=c.getContext('2d'); x.drawImage(document.getElementById('i'),0,0);
      /* ⚠️ (105,100) desde 19/out: o ícone virou o disco do botão Menu e a
         marca mora DENTRO dele, menor — o ponto antigo (120,90) cai no
         disco escuro. Este é o pé da barra cheia, onde ela é ciano puro. */
      const canto=x.getImageData(4,4,1,1).data, meio=x.getImageData(105,100,1,1).data;
      return {canto:[...canto], meio:[...meio]};
    });
    await ctx.close(); return r;
  })();
  t(px.canto[3]===255,'⟶⟶ o ícone é opaco — o iOS põe preto atrás de PNG transparente');
  t(px.canto[0]<40&&px.canto[1]<40,'o fundo é o grafite da casa, não branco: rgb('+px.canto.slice(0,3)+')');
  t(px.meio[2]>150&&px.meio[1]>150&&px.meio[0]<120,'e a marca está lá, em ciano: rgb('+px.meio.slice(0,3)+')');

  /* ============ 4. o manifest ============ */
  t(fs.existsSync(pub('app.webmanifest')),'o manifest existe');
  const man=JSON.parse(fs.readFileSync(pub('app.webmanifest'),'utf8'));
  t(man.display==='standalone','ele pede standalone — é o que tira a barra do navegador');
  t(man.short_name&&man.short_name.length<=12,'short_name curto: "'+man.short_name+'"');
  t(man.background_color===man.theme_color&&/^#/.test(man.theme_color),
    'fundo e tema na mesma cor da casa ('+man.theme_color+') — a tela de abertura não pisca branco');
  t(man.icons.length>=2&&man.icons.some(i=>i.purpose&&i.purpose.includes('maskable')),
    'tem ícone maskable, que é o que o Android recorta sem cortar a marca');

  /* ============ 5. o modo app muda o layout, e SÓ ele ============ */
  const medir=async(standalone)=>{
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
    const p=await ctx.newPage(); const errs=[];
    p.on('pageerror',e=>errs.push('ERR: '+e.message));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    if(standalone) await p.addInitScript(()=>{ try{
      Object.defineProperty(navigator,'standalone',{get:()=>true}) }catch(e){} });
    await p.addInitScript(()=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
      localStorage.setItem('cdf-guia','1'); }catch(e){} });
    await p.goto('file://'+pub('index.html'),{waitUntil:'networkidle'});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
    await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(150);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);
    const r=await p.evaluate(()=>{
      /* a regra do modo app existe na folha e casa com o body? env() é
         zero no emulador (não há notch), então o que dá para provar aqui
         é o SELETOR, não o valor do inset. */
      let regra=false;
      for(const f of document.styleSheets){
        let rs; try{ rs=f.cssRules }catch(e){ continue }
        for(const r of rs||[]) if(r.selectorText==='html.app body'&&
          /safe-area-inset-bottom/.test(r.style.paddingBottom||'')) regra=true;
      }
      return {
        classe:document.documentElement.classList.contains('app'),
        ehApp:ehApp(),
        cover:/viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content),
        casa:document.body.matches('html.app body'),
        regra,
        ov:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        barra:!!document.getElementById('bottombar')
      };
    });
    await ctx.close(); return {...r,errs};
  };
  const nav=await medir(false), app=await medir(true);

  t(!nav.classe&&!nav.ehApp,'no navegador comum nada muda: sem classe .app');
  t(!nav.cover,'⟶⟶ e SEM viewport-fit=cover — no Safari ele recria a faixa embaixo da barra de abas');
  t(app.classe&&app.ehApp,'aberto pela tela de início o modo app liga');
  t(app.cover,'⟶⟶ e aí sim o cover entra — sem barra de navegador não há faixa a revelar');
  t(app.regra,'a regra de área segura existe na folha, presa a html.app');
  t(app.casa&&!nav.casa,'e ela só casa com o body no modo app');
  t(nav.ov<=1&&app.ov<=1,'nenhum dos dois rola de lado');
  t(nav.errs.length===0&&app.errs.length===0,'zero erro de console nos dois modos'
    +(app.errs[0]?' — '+app.errs[0]:'')+(nav.errs[0]?' — '+nav.errs[0]:''));

  console.log('TELA-DE-INICIO');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

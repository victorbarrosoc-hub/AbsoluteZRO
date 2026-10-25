/* O MENU RECOLHÍVEL (17/out · 10).
 *
 * Victor: "esse menu é muito feio e não acho muito intuitivo, muita coisa,
 * fica cansativo" — e, com a Lorien e a ZRO de referência, "pode ser um
 * menu recolhível, tanto no desktop quanto no mobile". A gaveta em si é
 * guardada por `mapa`; aqui ficam as duas outras peças:
 *
 *   1. a LATERAL do desktop recolhe num trilho de ícones, e a escolha
 *      sobrevive ao recarregar (por isso a suíte roda em origem http);
 *   2. a BARRA do celular tem o Menu levantado NO CENTRO, e ele continua
 *      no centro quando a fase ou o lado da conta escondem um item.
 */
const { chromium } = require('playwright');
const {servir,URL}=require('./_servir.js');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errs=[];
  const entrar=async(W,H,mob,lado)=>{
    const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:mob,hasTouch:mob});
    const p=await ctx.newPage(); await servir(p);
    p.on('pageerror',e=>errs.push(W+': '+e.message));
    p.on('console',m=>{ if(m.type()==='error'&&!/web3forms/.test(m.text())) errs.push(W+': '+m.text()) });
    await p.addInitScript(()=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1'); localStorage.setItem('cdf-guia','1');
    }catch(e){} });
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
    await p.locator('[data-lgtipo="'+(lado||'freela')+'"]').click(); await p.waitForTimeout(170);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
    return {ctx,p};
  };
  const medeLado=p=>p.evaluate(()=>{
    const nav=document.querySelector('.top .tabs'), r=nav.getBoundingClientRect();
    const tog=document.getElementById('lado-tog').getBoundingClientRect();
    const quem=document.elementFromPoint(tog.right-4,tog.top+tog.height/2);
    const at=nav.querySelector('.tab[aria-current="true"]:not([hidden])'), ind=nav.querySelector('.tabind');
    const seal=document.querySelector('.top .selo-prev').getBoundingClientRect();
    const menu=document.getElementById('menu-bt').getBoundingClientRect();
    return {min:document.documentElement.classList.contains('lado-min'),
      lado:getComputedStyle(document.documentElement).getPropertyValue('--lado').trim(),
      larg:Math.round(nav.offsetWidth), pad:parseFloat(getComputedStyle(document.body).paddingLeft),
      inteira:!!quem&&!!quem.closest('#lado-tog'),
      rolagem:document.documentElement.scrollWidth>innerWidth+1,
      /* (18/out · 5) pela tela, não por offset* — ver doca.js */
      casou:!!at&&Math.abs(at.getBoundingClientRect().top-ind.getBoundingClientRect().top)<1.5&&Math.abs(at.getBoundingClientRect().height-ind.getBoundingClientRect().height)<1.5,
      textos:[...nav.querySelectorAll('.tab')].filter(e=>!e.hidden).map(e=>e.textContent.replace(/\d+$/,'').trim()),
      semTitulo:[...nav.querySelectorAll('.tab')].filter(e=>!e.hidden&&!e.title).length,
      fonte:at?getComputedStyle(at).fontSize:'',
      menuLivre:menu.left>=seal.right-1, nome:getComputedStyle(document.querySelector('.top .brand b')).display,
      pressed:document.getElementById('lado-tog').getAttribute('aria-pressed')};
  });

  /* ======================= 1. a lateral recolhe ======================= */
  {
    const {ctx,p}=await entrar(1280,860,false);
    let m=await medeLado(p);
    t(!m.min&&m.larg===236,'a lateral nasce aberta, com 236px ('+m.larg+')');
    t(m.inteira,'a alça de recolher aparece INTEIRA na borda — a lateral tem vidro, e filho fixo dela sairia cortado');
    await p.locator('#lado-tog').click(); await p.waitForTimeout(600);
    m=await medeLado(p);
    t(m.min&&m.larg===72,'⟶⟶ um toque e ela vira um trilho de 72px ('+m.larg+')');
    t(m.pad===72,'e o conteúdo ganha a largura: o corpo recua junto ('+m.pad+'px)');
    t(m.pressed==='true'&&await p.locator('#lado-tog').getAttribute('aria-label')==='Abrir a lateral',
      'a alça diz o que faz agora: abrir');
    t(!m.rolagem,'sem rolagem lateral recolhida');
    t(m.fonte==='0px'&&m.textos.includes('Propostas'),'as abas viram só ícone — o nome continua no botão, para o leitor de tela');
    t(m.semTitulo===0,'e toda aba tem title: é o que o mouse mostra no trilho');
    t(m.casou,'a pastilha continua casando com o item ativo');
    t(m.nome==='none'&&m.menuLivre,'a marca vira só o símbolo, e o botão do menu não cai em cima do selo Prévia');
    t(!await p.locator('.top .tab[data-tab="planos"] .pl-tipo').isVisible(),'no trilho o tipo do plano sai, e Planos fica só a coroa');
    await p.locator('.top .tab[data-tab="jobs"]').click(); await p.waitForTimeout(450);
    t(await p.evaluate(()=>S.tab)==='jobs','recolhida, a navegação continua funcionando');

    /* ⟶ a escolha é do aparelho, como o tema */
    await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
    /* a sessão pode voltar sozinha; se cair na home, entra de novo */
    if(await p.locator('.homenav .entrar-cta').isVisible()){
      await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
      await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
    }
    if(await p.evaluate(()=>S.tab==='home'||S.tab==='entrar')) await p.evaluate(()=>show('feed'));
    await p.waitForTimeout(300);
    m=await medeLado(p);
    t(m.min&&m.larg===72,'⟶⟶ recarregando, ela continua recolhida — a escolha ficou guardada');
    await p.locator('#lado-tog').click(); await p.waitForTimeout(600);
    m=await medeLado(p);
    t(!m.min&&m.larg===236&&m.pad===236,'e outro toque devolve a lateral inteira');
    t(m.casou,'com a pastilha de volta no lugar');

    /* o tipo do plano acompanha a escada: assinou, a pílula muda e acende */
    await p.evaluate(()=>{ PLANO_FREELA='estrada'; drawPlanos() }); await p.waitForTimeout(150);
    const tp=await p.evaluate(()=>{const e=document.getElementById('lado-tipo'); return {t:e.textContent,pago:e.classList.contains('pago')}});
    t(tp.t==='Estrada'&&tp.pago,'⟶⟶ com a Estrada assinada, a lateral diz "Estrada" — e a pílula acende: é plano pago');
    await p.evaluate(()=>{ PLANO_FREELA='base'; drawPlanos() });
    /* a gaveta no desktop é o painel flutuante da ZRO, não a folha do tamanho da tela */
    await p.locator('#menu-bt').click(); await p.waitForTimeout(500);
    const g=await p.evaluate(()=>{const r=document.getElementById('gaveta').getBoundingClientRect();
      return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),ih:innerHeight}});
    t(g.x>0&&g.x<=16&&g.y>0&&g.w<=360&&g.h>g.ih*0.9,'no desktop a gaveta flutua à esquerda, quase da altura da janela ('+g.w+'×'+g.h+')');
    await p.keyboard.press('Escape'); await p.waitForTimeout(750);
    t(!await p.locator('#gaveta').isVisible(),'e fechada ela sai de vista de verdade, não só transparente');
    await ctx.close();
  }

  /* com movimento reduzido, nada desliza */
  {
    const ctx=await b.newContext({viewport:{width:1280,height:860},reducedMotion:'reduce'});
    const p=await ctx.newPage(); await servir(p);
    await p.addInitScript(()=>{ try{ localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1'); localStorage.setItem('cdf-guia','1') }catch(e){} });
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(700);
    const d=await p.evaluate(()=>{ document.getElementById('lado-tog').click();
      return getComputedStyle(document.querySelector('.top .tabs')).transitionDuration });
    t(/^0s(,\s*0s)*$/.test(d),'com `prefers-reduced-motion` a lateral salta, não desliza ('+d+')');
    t(await p.evaluate(()=>getComputedStyle(document.getElementById('gaveta')).transitionDuration)==='0s',
      'e a gaveta também aparece sem deslizar');
    await ctx.close();
  }

  /* ============ 1b. com movimento reduzido o Menu fica parado ============ */
  {
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const p=await ctx.newPage(); await servir(p);
    await p.addInitScript(()=>{ try{ localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1'); localStorage.setItem('cdf-guia','1') }catch(e){} });
    await p.goto(URL,{waitUntil:'networkidle'});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);
    const a=await p.evaluate(()=>['.mnb-orb','.mnb-b1','.mnb-b3'].map(q=>getComputedStyle(document.querySelector('#bt-menu '+q)).animationName)
      .concat(getComputedStyle(document.querySelector('#bt-menu .mnb'),'::before').animationName));
    t(a.every(n=>n==='none'),'com `prefers-reduced-motion` o anel, as barras e o carrinho ficam parados ('+a.join(',')+')');
    await ctx.close();
  }

  /* ======================= 2. o Menu no centro da barra ======================= */
  for(const [W,lado] of [[390,'freela'],[390,'contratante'],[360,'freela']]){
    const {ctx,p}=await entrar(W,780,true,lado);
    const m=await p.evaluate(()=>{
      const bb=document.getElementById('bottombar'), br=bb.getBoundingClientRect();
      const mb=document.getElementById('bt-menu'), mr=mb.getBoundingClientRect(), sr=mb.querySelector('.mnb').getBoundingClientRect();
      const vis=[...bb.querySelectorAll('.bt[data-tab]')].filter(e=>e.offsetParent&&!e.hidden);
      const antes=vis.filter(e=>e.getBoundingClientRect().right<=mr.left+1).length;
      const depois=vis.filter(e=>e.getBoundingClientRect().left>=mr.right-1).length;
      const cabe=[...bb.querySelectorAll('.bt')].filter(e=>e.offsetParent).every(e=>{
        const s=e.querySelector('span'); if(!s) return true;
        const a=e.getBoundingClientRect(), r=s.getBoundingClientRect(); return r.left>=a.left-1&&r.right<=a.right+1 });
      const topo=document.elementFromPoint(sr.left+sr.width/2,sr.top+3), lado=document.elementFromPoint(sr.left+3+sr.width*.12,sr.top+sr.height*.3);
      return {centro:Math.abs((mr.left+mr.right)/2-innerWidth/2), sobe:br.top-sr.top, antes, depois, cabe,
        dentro:sr.top>=mr.top-.5&&sr.bottom<=mr.bottom+.5, toqueTopo:!!(topo&&topo.closest('#bt-menu')), toqueLado:!!(lado&&lado.closest('#bt-menu')),
        barras:mb.querySelectorAll('.mnb-mk rect').length, carro:!!mb.querySelector('.mnb-orb .mnb-car'),
        gira:getComputedStyle(mb.querySelector('.mnb'),'::before').animationName, orbita:getComputedStyle(mb.querySelector('.mnb-orb')).animationName,
        barraAlta:Math.round(br.height),
        rolagem:document.documentElement.scrollWidth>innerWidth+1};
    });
    t(m.centro<=2,W+'px · '+lado+': o Menu está no CENTRO da barra (desvio '+m.centro.toFixed(1)+'px)');
    t(m.antes===3&&m.depois===3,'com três itens de cada lado ('+m.antes+' + '+m.depois+') — nenhum saiu da barra');
    /* ⚠️ 17/out · 13: mede o CÍRCULO (.mnb), que deixou de ser o svg do
       ícone — o ícone agora é a marca, dentro do disco */
    t(m.sobe>=16,'e o círculo dele SOBE acima da barra, como na Lorien ('+Math.round(m.sobe)+'px)');
    t(m.dentro,'⟶⟶ o círculo inteiro mora DENTRO da caixa do botão — é o círculo que se toca, não só o rótulo');
    t(m.toqueTopo&&m.toqueLado,'o toque no alto e na beirada do círculo cai no Menu');
    t(m.barras===3&&m.carro,'o símbolo é a marca da casa (as três barras) com o carrinho no anel');
    t(m.gira==='mnbgira'&&m.orbita==='mnborb','e ele se mexe: o anel gira e o carrinho dá a volta');
    t(m.barraAlta<=70,'a barra não cresceu por causa do círculo ('+m.barraAlta+'px)');
    t(m.cabe&&!m.rolagem,'todo rótulo cabe no seu item, sem rolagem lateral');
    if(W===390&&lado==='freela'){
      /* ⚠️ a fase (ou o lado da conta) esconde item: a Guilda não existe na
         Fase 1. As duas metades são caixas próprias justamente para o
         botão do meio não escorregar quando isso acontece. */
      const c=await p.evaluate(()=>{ document.querySelector('.bottombar .bt[data-tab="guildas"][data-modo="freela"]').hidden=true;
        const mr=document.getElementById('bt-menu').getBoundingClientRect(); return Math.abs((mr.left+mr.right)/2-innerWidth/2) });
      t(c<=2,'⟶⟶ escondendo um item de um lado só, o Menu continua no centro (desvio '+c.toFixed(1)+'px)');
      await p.evaluate(()=>{ document.querySelector('.bottombar .bt[data-tab="guildas"][data-modo="freela"]').hidden=false });
      await p.locator('#bt-menu').click(); await p.waitForTimeout(550);
      const g=await p.evaluate(()=>{const r=document.getElementById('gaveta').getBoundingClientRect();
        return {x:Math.round(r.left),dir:Math.round(r.right),on:document.getElementById('gaveta').classList.contains('on')}});
      t(g.on&&g.x===0&&g.dir<=W-40,'o Menu abre a gaveta pela esquerda, com a página à vista do lado');
      await p.locator('#velo').click({position:{x:W-12,y:300}}); await p.waitForTimeout(500);
      t(!await p.locator('#gaveta').isVisible(),'e tocar na página escurecida fecha');
    }
    await ctx.close();
  }

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));
  console.log('MENU RECOLHÍVEL');
  ok.forEach(x=>console.log('  ✓ '+x));
  bad.forEach(x=>console.log('  ✗ '+x));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

/* A NAVEGAÇÃO E O INDICADOR QUE DESLIZA — doca no celular, lateral no desktop (04/out)
 *
 * Victor (25/ago): *"coloca também um menu flutuante na parte de baixo do
 * site, isso no desktop. Também uma leve transição do menu que está pra o
 * outro clicado."*
 *
 * ⚠️ O QUE MAIS IMPORTA AQUI É QUE A BARRA É UMA SÓ. Uma segunda <nav>
 * duplicaria `#bg-bot` e `#bg-gui`, os contadores de não-lido que moram
 * dentro dela: `getElementById` para no primeiro do DOM — o defeito do
 * `fd-foto` de 20/ago, que passou pela sonda porque o Playwright também
 * casa com o primeiro.
 *
 * ⚠️ E O INDICADOR SE MEDE POR `offset*`, NUNCA POR RECT: a partir de
 * 1400px o `body` tem `zoom:1.1`, o rect devolve pixel VISUAL e
 * `style.width` grava pixel de LAYOUT. Medido: saía ~10% largo demais só a
 * 1440; a 1100 e a 860 casava, porque lá o zoom é 1.
 */
const { chromium } = require('playwright');
const path = require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const errs=[];
  const entrar=async(larg,movRed)=>{
    const ctx=await b.newContext({viewport:{width:larg,height:900},
      isMobile:larg<=820, reducedMotion:movRed?'reduce':'no-preference'});
    const p=await ctx.newPage();
    p.on('pageerror',e=>errs.push('ERR: '+e.message));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await p.addInitScript(()=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
      localStorage.setItem('cdf-guia','1'); }catch(e){} });
    await p.goto(URL);
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:20000}).catch(()=>{});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
    await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(150);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
    return {ctx,p};
  };

  /* ============ 1. UMA barra só ============ */
  const fonte=require('fs').readFileSync(
    path.resolve(__dirname,'..','src','template.html'),'utf8');
  t((fonte.match(/class="bottombar"/g)||[]).length===1,
    '⟶⟶ existe UMA `.bottombar` no markup — segunda barra duplicaria os '
    +'contadores de não-lido que moram dentro dela');
  t((fonte.match(/id="bg-bot"/g)||[]).length===1&&(fonte.match(/id="bg-gui"/g)||[]).length===1,
    'e os dois ids de badge continuam únicos');

  /* ============ 2. no desktop é UMA navegação: a barra lateral ============
     ⚠️ A DOCA SAIU DO DESKTOP EM 04/out, e é decisão do Victor: a revisão
     contou TRÊS navegações ao mesmo tempo (faixa de 10 abas, doca com 7
     delas repetidas, e o menu). A faixa virou barra lateral — os mesmos
     `.tab[data-tab]` — e a doca ficou só no celular. O pedido de 25/ago
     ("uma leve transição do menu que está pra o outro clicado") continua:
     a pastilha desliza na vertical, e é ela que esta parte mede. */
  for(const L of [1440,1280,1100,860]){
    const {ctx,p}=await entrar(L,false);
    const m=await p.evaluate(()=>{
      const nav=document.querySelector('.top .tabs'), cs=getComputedStyle(nav), r=nav.getBoundingClientRect();
      const bb=document.getElementById('bottombar');
      const at=nav.querySelector('.tab[aria-current="true"]:not([hidden])');
      const ind=nav.querySelector('.tabind');
      const brand=document.querySelector('.top .brand').getBoundingClientRect();
      return {lateral:cs.position==='fixed'&&cs.flexDirection==='column'&&r.left<=1&&r.height>innerHeight*0.6,
        docaSome:getComputedStyle(bb).display==='none',
        semRolagem:document.documentElement.scrollWidth<=innerWidth+1,
        marcaEmCima:brand.left<r.right,
        conteudoAoLado:document.body.classList.contains('com-lateral'),
        pronto:nav.classList.contains('pronto'),
        /* (18/out · 5) medida pela TELA, não por offset*: a pastilha deixou de
           ser posta por offsetTop (no Safari do Victor ela caía uma linha acima
           com o zoom) e passou a medir a escala do próprio translate. O que
           importa é ela cobrir o item na tela, e é isso que se compara. */
        indAlt:Math.round(ind.getBoundingClientRect().height), itemAlt:at?Math.round(at.getBoundingClientRect().height):0,
        indY:Math.round(ind.getBoundingClientRect().top), itemY:at?Math.round(at.getBoundingClientRect().top):0};
    });
    t(m.lateral,'a '+L+'px a navegação é uma barra lateral fixa à esquerda');
    t(m.docaSome,'⟶⟶ e a doca de baixo NÃO aparece a '+L+'px — uma navegação só');
    t(m.semRolagem&&m.conteudoAoLado,'o conteúdo abre espaço para ela, sem rolagem lateral, a '+L+'px');
    t(m.marcaEmCima,'a marca fica em cima da lateral, como em Linear e Notion');
    t(m.indAlt===m.itemAlt&&m.indY===m.itemY,
      '⟶⟶ a pastilha casa com o item ativo a '+L+'px ('+m.indAlt+'/'+m.itemAlt+'px, y '+m.indY+'/'+m.itemY+'), medida na tela — com ou sem `zoom` no corpo');
    t(m.pronto,'e a classe `pronto` só entra depois da primeira colocação');
    await ctx.close();
  }

  /* ============ 3. ela DESLIZA ao trocar de aba ============ */
  {
    const {ctx,p}=await entrar(1280,false);
    const antes=await p.evaluate(()=>{
      const ind=document.querySelector('.top .tabind');
      return {y:ind.style.transform, tr:getComputedStyle(ind).transitionDuration};
    });
    await p.locator('.top .tab[data-tab="propostas"]').click();
    await p.waitForTimeout(600);
    const dps=await p.evaluate(()=>{
      const nav=document.querySelector('.top .tabs'), ind=nav.querySelector('.tabind');
      const at=nav.querySelector('.tab[aria-current="true"]:not([hidden])');
      const a=at.getBoundingClientRect(), b=ind.getBoundingClientRect();
      return {y:ind.style.transform, casou:Math.abs(a.top-b.top)<1.5&&Math.abs(a.height-b.height)<1.5, aba:at.dataset.tab};
    });
    t(dps.y!==antes.y,'trocar de aba move a pastilha ('+antes.y+' → '+dps.y+')');
    t(dps.casou&&dps.aba==='propostas','e ela para exatamente na aba nova');
    t(parseFloat(antes.tr)>0,'com transição de verdade ('+antes.tr+')');
    await ctx.close();
  }

  /* ============ 4. trocar de chapéu remede ============ */
  {
    const {ctx,p}=await entrar(1280,false);
    const r=await p.evaluate(()=>{
      const nav=document.querySelector('.top .tabs'), ind=nav.querySelector('.tabind');
      MODO=MODO==='freela'?'contratante':'freela'; aplicarModo();
      const at=nav.querySelector('.tab[aria-current="true"]:not([hidden])');
      return {semItem:!at, casou:at?Math.round(parseFloat(ind.style.height))===at.offsetHeight:null,
        some:ind.style.opacity==='0'};
    });
    t(r.semItem?r.some:r.casou,
      '⟶⟶ `aplicarModo()` remede: trocar o lado troca os itens da lateral, e a pastilha reencontra o ativo — ou some');
    await ctx.close();
  }

  /* ============ 5. no celular continua sendo a barra cheia ============ */
  {
    const {ctx,p}=await entrar(390,false);
    const r=await p.evaluate(()=>{
      const bb=document.getElementById('bottombar'), cs=getComputedStyle(bb);
      const r=bb.getBoundingClientRect();
      return {grid:cs.display==='grid', cheia:r.left<=1&&r.right>=innerWidth-1,
        colada:Math.round(r.bottom)>=Math.round(innerHeight)-2};
    });
    t(r.grid&&r.cheia&&r.colada,
      'no celular nada mudou: a barra continua cheia, colada embaixo, em grid');
    await ctx.close();
  }

  /* ============ 6. quem pede menos movimento não vê deslizar ============ */
  {
    const {ctx,p}=await entrar(1280,true);
    const d=await p.evaluate(()=>
      getComputedStyle(document.querySelector('.top .tabind')).transitionDuration);
    t(/^0s(,\s*0s)*$/.test(d),'com `prefers-reduced-motion` a pastilha salta, não desliza ('+d+')');
    await ctx.close();
  }

  /* ============ 7. O FEED NO DIA 1 — o retorno do Felipe ============
     ⚠️ Felipe (testador, 25/ago): "não sei se a galera vai engajar e
     postar umas paradas." Medido: com os cadastros zerados, o aviso de
     demonstração continuava dizendo "os textos ABAIXO" com NADA abaixo, e
     a praça vazia era uma frase sem saída. */
  {
    const {ctx,p}=await entrar(390,false);
    /* ⚠️ ZERAR SÓ `POSTS` NÃO É O DIA 1 desde que o brechó passou a chegar
       ao feed (25/ago · 6): o anúncio segura a praça de pé e o vazio nunca
       aparece. Isso é a melhoria funcionando, não defeito — mas o dia 1 de
       verdade é com TUDO zerado. Antes de zerar, mede-se o contrário. */
    const anu=await p.evaluate(()=>{
      POSTS.length=0; RODANDO.length=0;
      FDP_ABA="praca"; show('feed'); drawFeed();
      const el=document.getElementById('fdp-lista');
      return {cartoes:el.querySelectorAll('.fdanu').length,
        aindaVazio:!!el.querySelector('.fdvazio')};
    });
    t(anu.cartoes>0&&!anu.aindaVazio,
      '⟶⟶ sem NINGUÉM ter postado, o brechó sozinho já segura a praça de pé ('
      +anu.cartoes+' anúncios) — a resposta ao "não sei se a galera vai postar"');
    const r=await p.evaluate(()=>{
      POSTS.length=0; RODANDO.length=0; ANUNCIOS.length=0;
      FDP_ABA="praca"; show('feed'); drawFeed();
      const el=document.getElementById('fdp-lista');
      return {avisoVisivel:!!document.getElementById('fdp-demo'),
        vazio:(el.querySelector('.fdvazio')||{}).innerText||'',
        saidas:el.querySelectorAll('[data-fdvaz]').length};
    });
    t(!r.avisoVisivel,
      '⟶⟶ com o feed vazio não há aviso de demonstração apontando para o nada — '
      +'desde 17/out · 5 o feed não tem banner nenhum; a prévia se declara no selo');
    t(r.saidas===2,'e a praça calada oferece DUAS saídas em vez de uma frase morta: '+r.saidas);
    t(/calada/.test(r.vazio),'o vazio diz o que está acontecendo: "'+r.vazio.split('\n')[0]+'"');
    await p.locator('[data-fdvaz="procura"]').click(); await p.waitForTimeout(500);
    const d2=await p.evaluate(()=>({tipo:FDP_TIPO,
      foco:document.activeElement&&document.activeElement.id}));
    t(d2.tipo==='procura','tocar em "Preciso de gente" já escolhe o tipo do post');
    t(d2.foco==='fdp-txt','⟶⟶ e põe o cursor na caixa — botão de vazio que só rola '
      +'devolve a pessoa ao mesmo nada (foco em "'+d2.foco+'")');
    await ctx.close();
  }

  t(errs.length===0,'zero erro de console'+(errs.length?' — '+errs[0]:''));

  console.log('DOCA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

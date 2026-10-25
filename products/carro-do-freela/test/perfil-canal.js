/**
 * O PERFIL COMO CANAL — demoreel em destaque e portfólio por playlists.
 *
 * Victor: "demoreel no perfil, pegada canal do YouTube com um vídeo em
 * destaque, portfólio separado por categoria como se fosse playlists."
 *
 * O que esta suíte protege:
 *   - ⚠️ O VÍDEO NÃO TOCA DENTRO DA PÁGINA e a tela DIZ isso. O produto roda
 *     sem uma única requisição externa — é o que faz ele caber num artifact
 *     e funcionar offline. Embed de YouTube quebraria. O que existe é capa +
 *     link que abre fora, como todo portfólio de verdade;
 *   - as playlists saem de `t.tipo`, o catálogo TIPOS que já existia — sem
 *     dado novo e na ordem do catálogo, para dois perfis com os mesmos tipos
 *     terem a mesma ordem;
 *   - sem filtro elas ficam EMPILHADAS, nunca em rolagem lateral;
 *   - com um tipo só, os chips somem: não informariam nada;
 *   - reel sem link não finge que toca;
 *   - ⚠️ ÁLBUM NÃO É PEÇA NOVA — é o que um trabalho JÁ É para um fotógrafo
 *     (49 dos 109 cadastros marcaram Fotógrafo, 38 como principal). Uma
 *     imagem + link = filme; várias imagens = álbum. Mesmo objeto, outra
 *     forma — senão a contagem do perfil, as playlists, o medidor e a busca
 *     teriam todos que aprender que existem DUAS coisas;
 *   - o destaque é um SLOT que aceita reel OU álbum, e a assimetria é
 *     honesta: o álbum ABRE dentro da página (imagem é data URI), o vídeo
 *     não. Cada um faz o que o produto consegue fazer;
 *   - o padrão do editor segue a função de quem é, mas NÃO tranca.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
/* o perfil passou a abrir em Publicações (20/ago · 9); esta suíte mede o
   PORTFÓLIO, então ela vai direto para a aba dele. */
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1440,height:1300},deviceScaleFactor:2});
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
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(220);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(180);
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(650);
  await p.evaluate(()=>{abrirPerfil(EU.id);S.ptab='port';drawPtabs()}); await p.waitForTimeout(650);

  /* ============ o trailer do canal ============ */
  t(await p.locator('.reel').count()===1,'o perfil abre com o demoreel em destaque');
  t(await p.locator('.reelpl').count()===1,'com botão de play sobre a capa');
  const ordem=await p.evaluate(()=>{
    const r=document.getElementById('p-reel').getBoundingClientRect();
    const w=document.getElementById('p-works').getBoundingClientRect();
    return r.top<w.top;});
  t(ordem,'e ele vem ANTES dos trabalhos — é o que responde primeiro');
  t(/Sem link ainda/.test(await p.locator('#p-reel').textContent()),
    'sem link, a tela diz que só tem a capa em vez de fingir um player');
  await p.locator('[data-reelplay]').click(); await p.waitForTimeout(400);
  t(/não carrega vídeo de fora/.test(await p.locator('#avisos').textContent()),
    'e clicar no play avisa a verdade: a página não carrega vídeo de fora');

  /* ============ playlists ============ */
  const pls=await p.evaluate(()=>playlists(CREW.find(c=>c.me)).map(x=>x.tipo));
  t(pls.length>1,'o portfólio se divide em playlists por tipo de trabalho: '+pls.join(' · '));
  t(await p.evaluate(()=>{
    const c=CREW.find(x=>x.me);
    const ordemCat=playlists(c).map(x=>TIPOS.indexOf(x.tipo));
    return ordemCat.every((n,i)=>i===0||n>ordemCat[i-1]);}),
    'na ordem do catálogo, para dois perfis com os mesmos tipos não saírem embaralhados');
  t(await p.locator('.plsec').count()===pls.length,'sem filtro, elas ficam EMPILHADAS — nada de rolagem lateral');
  t(await p.locator('[data-plst]').count()===pls.length+1,'com um chip por playlist mais o "Tudo"');
  const chip=await p.locator('[data-plst]').nth(1).getAttribute('data-plst');
  await p.locator('[data-plst="'+chip+'"]').click(); await p.waitForTimeout(350);
  t(await p.locator('.plsec').count()===0,'escolher uma playlist troca as pilhas por só ela');
  t((await p.locator('.wk2').count())>0,'com os trabalhos dela');
  await p.locator('[data-plst=""]').click(); await p.waitForTimeout(300);
  t(await p.locator('.plsec').count()===pls.length,'e "Tudo" devolve as pilhas');

  /* com um tipo só, chip não informa nada */
  const um=await p.evaluate(()=>{
    const guard=TRABALHOS.slice();
    TRABALHOS=TRABALHOS.filter(x=>x.tipo===TRABALHOS[0].tipo);
    drawPortfolio(CREW.find(c=>c.me));
    const n=document.querySelectorAll('[data-plst]').length;
    TRABALHOS=guard; drawPortfolio(CREW.find(c=>c.me));
    return n;});
  t(um===0,'com um tipo só os chips somem — não haveria o que escolher');

  /* ============ o editor ============ */
  await p.evaluate(()=>show("meu")); await p.waitForTimeout(500);
  t(await p.locator('#pf-reell').count()===1,'Meu perfil mostra o estado do reel');
  await p.locator('#pf-reeled').click(); await p.waitForTimeout(600);
  t(await p.locator('#reel-ok').isVisible(),'e leva ao editor, junto do editor de portfólio');
  t(/o vídeo abre fora daqui/i.test(await p.locator('#reel-ok').locator('xpath=..').textContent()),
    'o editor repete que o vídeo abre fora');
  await p.fill('#reel-link','https://vimeo.com/exemplo');
  await p.locator('#reel-ok').click(); await p.waitForTimeout(400);
  t(await p.evaluate(()=>reelDe(EU).link)==='https://vimeo.com/exemplo','guardar salva o link');
  await p.evaluate(()=>{abrirPerfil(EU.id);S.ptab='port';drawPtabs()}); await p.waitForTimeout(450);
  t(/Abre no site onde ele está hospedado/.test(await p.locator('#p-reel').textContent()),
    'e com link a nota muda: agora ele abre fora');
  t(await p.evaluate(()=>REELS.filter(r=>r.dono!==EU.id).length)===0,
    'ninguém real é semeado com demoreel — só o perfil de demonstração tem');

  /* ============ álbum: a mesma peça, outra forma ============ */
  const alb=await p.evaluate(()=>{
    TRABALHOS[1].fotos=[FRAMES.casamento,FRAMES.show,FRAMES.publicidade,FRAMES.corporativo];
    drawPortfolio(CREW.find(c=>c.me));
    return {n:TRABALHOS.length, umObjeto:!window.ALBUNS&&!window.ALBUM};});
  await p.waitForTimeout(350);
  t(alb.umObjeto,'não existe lista paralela de álbuns — é o mesmo TRABALHOS');
  t(await p.locator('.albn').count()===1,'o trabalho com várias fotos ganha o selo de álbum');
  t(/4 fotos/.test(await p.locator('.albn').first().textContent()),'dizendo quantas são');
  await p.locator('.albn').first().locator('xpath=ancestor::button').click(); await p.waitForTimeout(400);
  t(!await p.locator('#lb-nav').isHidden(),'abrir mostra a navegação do álbum');
  t(await p.locator('#lb-cont').textContent()==='1 de 4','com o contador');
  t(await p.locator('.albth').count()===4,'e uma miniatura por foto');
  await p.locator('[data-lbnav="1"]').click(); await p.waitForTimeout(220);
  t(await p.locator('#lb-cont').textContent()==='2 de 4','a seta avança');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(220);
  t(await p.locator('#lb-cont').textContent()==='3 de 4','o teclado também');
  await p.locator('.albth').first().click(); await p.waitForTimeout(220);
  t(await p.locator('#lb-cont').textContent()==='1 de 4','e a miniatura salta direto');
  await p.locator('#lb-x').click(); await p.waitForTimeout(200);
  await p.locator('.wk2').first().click(); await p.waitForTimeout(350);
  t(await p.locator('#lb-nav').isHidden(),'trabalho de uma foto continua sem navegação — nada mudou para quem filma');
  await p.locator('#lb-x').click(); await p.waitForTimeout(200);

  /* o destaque aceita álbum, e o padrão segue a função sem trancar */
  await p.evaluate(()=>show("meu")); await p.waitForTimeout(400);
  await p.locator('#pf-reeled').click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>!fotografa(EU)&&tipoReelEdit()==='video'),
    'quem não é fotógrafo abre no reel de vídeo');
  t(await p.evaluate(()=>{
    const g=EU.principal.slice(); EU.principal=["Fotógrafo"];
    const r=REELS.slice(); REELS.length=0;
    const tp=tipoReelEdit(); EU.principal=g; REELS.push(...r); return tp;})==='album',
    'quem marcou Fotógrafo abre no álbum — o padrão segue a função');
  await p.locator('[data-rtipo="album"]').click(); await p.waitForTimeout(300);
  t(!await p.locator('#reel-album').isHidden()&&await p.locator('#reel-linkw').isHidden(),
    'mas dá para trocar: ninguém é trancado no que a função diz que ele é');
  t(/Álbum em destaque/.test(await p.locator('#reel-lab').textContent()),'o rótulo acompanha');
  t(/abre aqui mesmo/i.test(await p.locator('#reel-nota').textContent()),
    'e a nota muda: foto a plataforma consegue mostrar');
  await p.evaluate(()=>{ reelFotos=[FRAMES.casamento,FRAMES.publicidade,FRAMES.show]; pintarReelEdit(); });
  await p.waitForTimeout(250);
  t(await p.locator('.albfi').count()===3,'as fotos entram no editor');
  await p.fill('#reel-tit','Casamentos 2025');
  await p.locator('#reel-ok').click(); await p.waitForTimeout(400);
  const salvo=await p.evaluate(()=>{const r=reelDe(EU);return {tipo:r.tipo,n:r.fotos.length,capa:r.capa===r.fotos[0]}});
  t(salvo.tipo==='album'&&salvo.n===3,'guardar salva o álbum');
  t(salvo.capa,'e a primeira foto vira a capa');
  await p.evaluate(()=>{abrirPerfil(EU.id);S.ptab='port';drawPtabs()}); await p.waitForTimeout(450);
  t(/Abre aqui mesmo/.test(await p.locator('#p-reel').textContent()),
    'no perfil, o álbum promete abrir dentro — ao contrário do vídeo');
  await p.locator('[data-reelplay]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl2').isVisible()&&await p.locator('#lb-cont').textContent()==='1 de 3',
    'e abre MESMO, sem sair da página');
  await p.locator('#lb-x').click(); await p.waitForTimeout(200);

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{abrirPerfil(EU.id);S.ptab='port';drawPtabs()}); await p.waitForTimeout(450);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

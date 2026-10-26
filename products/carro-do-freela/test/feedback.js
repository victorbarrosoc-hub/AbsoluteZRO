/**
 * SUPORTE FLUTUANTE — o canal dos primeiros testes.
 *
 * O que esta suíte protege:
 *   - o botão existe desde a homepage, sem login — testador reporta de onde estiver;
 *   - fica FIXO no canto de baixo à direita, sem arrastar (decisão do
 *     Victor: botão que muda de lugar não tem lugar);
 *   - o recado NUNCA some: sem chave configurada ele cai na fila local
 *     e a tela diz isso — não finge que enviou;
 *   - o contexto (tela/chapéu/janela) vai junto e é mostrado antes;
 *   - honeypot segura bot;
 *   - no celular o botão não nasce em cima da barra de abas;
 *   - e ABRIR NÃO DÁ ZOOM: o Safari do iOS amplia a página inteira quando
 *     o campo que recebe foco tem fonte menor que 16px, e não desfaz
 *     depois. Vale para TODO campo do aplicativo, não só o do suporte.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  /* com FBK_KEY preenchida o envio TENTA a rede; neste ambiente ela é
     bloqueada e o console acusa o fetch — é o caminho offline funcionando,
     não um defeito. Só o erro do web3forms é esperado; o resto acusa. */
  p.on('console',m=>{ if(m.type()!=='error') return;
    if(/web3forms/.test((m.location()&&m.location().url)||'')) return;
    /* (17/out) a rede passou a deixar o preflight CHEGAR ao web3forms, e
       ele volta barrado por CORS (origem file://). O Chromium atribui esse
       erro à PÁGINA, não ao web3forms — é o mesmo envio bloqueado de
       sempre, com outro endereço no rodapé. Reproduzido idêntico no build
       de 04/out. Continua valendo só para o web3forms: qualquer outro
       erro acusa. */
    if(/api\.web3forms\.com/.test(m.text())) return;
    errs.push(m.text()); });
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});

  /* ============ existe antes do login ============ */
  t(await p.locator('#fbk-btn').isVisible(),'o botão está na homepage, antes de qualquer login');
  t(await p.locator('#fbk-panel').isHidden(),'o painel nasce fechado');

  /* clique abre */
  await p.locator('#fbk-btn').click(); await p.waitForTimeout(200);
  t(await p.locator('#fbk-panel').isVisible(),'clique abre o painel');
  const ctx=await p.locator('#fbk-ctx').textContent();
  t(/home/.test(ctx),'o contexto mostra a tela atual: '+ctx.trim());
  t(/\d+×\d+/.test(ctx),'e o tamanho da janela');
  t(/·\s*v\S/.test(ctx),'e a versão da build — sem ela relato de teste não vira conserto');

  /* vazio bloqueado */
  await p.locator('#fbk-send').click(); await p.waitForTimeout(150);
  t(await p.locator('#fbk-out.fbk-err').isVisible(),'enviar vazio é bloqueado com aviso');
  t(await p.evaluate(()=>JSON.parse(localStorage.getItem('cdf-fbk-fila')||'[]').length)===0,
    'e nada entra na fila');

  /* tipo + mensagem → sem chave, cai na fila local e a tela DIZ */
  await p.locator('[data-fbk-tipo="problema"]').click();
  await p.locator('#fbk-msg').fill('O botão X não respondeu na tela Y');
  await p.locator('#fbk-quem').fill('Testador 01');
  await p.locator('#fbk-send').click();
  /* com FBK_KEY preenchida o envio TENTA a rede primeiro; a queda para a
     fila só acontece depois que o fetch falha. Esperar tempo fixo aqui
     dava falha intermitente quando as suítes rodam em paralelo. */
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('cdf-fbk-fila')||'[]').length>0,
    null,{timeout:15000});
  const fila=await p.evaluate(()=>JSON.parse(localStorage.getItem('cdf-fbk-fila')||'[]'));
  t(fila.length===1,'sem chave configurada o recado entra na fila local');
  t(fila[0]&&fila[0].tipo==='problema','com o tipo escolhido');
  t(fila[0]&&fila[0].tela==='home','e a tela em que foi escrito');
  t(!!(fila[0]&&fila[0].versao),'e a versão da build vai no recado: '+(fila[0]||{}).versao);
  const out=await p.locator('#fbk-out').textContent();
  t(/guardado neste aparelho/i.test(out),'a tela diz que guardou local — não finge que enviou');
  t(!/chegou/i.test(out),'e não diz "chegou"');

  /* honeypot */
  await p.locator('#fbk-msg').fill('spam de bot');
  await p.evaluate(()=>{document.getElementById('fbk-mel').value='http://spam'});
  await p.locator('#fbk-send').click(); await p.waitForTimeout(250);
  t(await p.evaluate(()=>JSON.parse(localStorage.getItem('cdf-fbk-fila')||'[]').length)===1,
    'quem cai no honeypot não grava nada');
  await p.evaluate(()=>{document.getElementById('fbk-mel').value=''});

  /* Esc fecha */
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  t(await p.locator('#fbk-panel').isHidden(),'Esc fecha o painel');

  /* ============ fixo, não arrastável ============ */
  const antes=await p.locator('#fbk-btn').boundingBox();
  const vp=p.viewportSize();
  t(antes.x+antes.width>vp.width-40,'nasce encostado na direita');
  t(antes.y+antes.height>vp.height-60,'e no rodapé — o canto onde todo site põe');

  await p.mouse.move(antes.x+26,antes.y+26);
  await p.mouse.down();
  await p.mouse.move(antes.x-320,antes.y-200,{steps:8});
  await p.mouse.up();
  await p.waitForTimeout(250);
  const depois=await p.locator('#fbk-btn').boundingBox();
  t(Math.abs(depois.x-antes.x)<2&&Math.abs(depois.y-antes.y)<2,'arrastar NÃO move o botão');
  t(!await p.evaluate(()=>localStorage.getItem('cdf-fbk-pos')),'e nada de posição é gravado');

  /* o lugar é o mesmo depois de recarregar */
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
  const dep2=await p.locator('#fbk-btn').boundingBox();
  t(Math.abs(dep2.x-antes.x)<2&&Math.abs(dep2.y-antes.y)<2,'e é o mesmo lugar depois de recarregar');

  /* ============ celular ============ */
  const ctx2=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const m=await ctx2.newPage();
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await m.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await m.goto(URL,{waitUntil:'networkidle'}); await m.waitForTimeout(400);
  await m.locator('.homenav .entrar-cta').click(); await m.waitForTimeout(250);
  await m.locator('[data-login="Google"]').click(); await m.waitForTimeout(600);
  const bb=await m.locator('#fbk-btn').boundingBox();
  const barra=await m.locator('#bottombar').boundingBox();
  t(bb&&barra&&bb.y+bb.height<=barra.y+2,
    'no celular o botão fica ACIMA da barra de abas, não em cima dela');
  t(bb&&bb.x+bb.width>390-40,'e encostado na direita, o mesmo canto do desktop');
  const ov=await m.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal: '+ov);
  await m.locator('#fbk-btn').click(); await m.waitForTimeout(250);
  t(await m.locator('#fbk-panel').isVisible(),'o painel abre no celular');
  /* folha de baixo ENCOSTADA no fim: o vão que sobrava entre o painel e a
     barra de abas era página aparecendo no meio — foi o que o Victor viu.
     Vão entre dois elementos fixos é vão; encostar resolve. */
  const folha=await m.evaluate(()=>{
    const p=document.getElementById('fbk-panel').getBoundingClientRect();
    return {larg:Math.round(p.width), esq:Math.round(p.x),
      ateOFim:Math.round(innerHeight-p.bottom),
      veu:document.getElementById('fbk-velo').classList.contains('on')};
  });
  t(folha.larg===390&&folha.esq===0,'como folha de baixo, na largura inteira da tela');
  t(folha.ateOFim===0,'encostada no fim — sem vão para a página aparecer no meio');
  t(folha.veu,'e com véu atrás, para não sobrar beirada de conteúdo');

  /* 17/out · 6: no celular todo modal virou FOLHA que sobe de baixo, e o
     botão (z-index 96, acima de todo .ovl) caía em cima do texto e dos
     campos dela — visto na foto do saque e do anúncio novo. Com uma
     folha aberta ele sai da frente, e volta quando ela fecha. */
  await m.evaluate(()=>{ document.getElementById('fbk-x').click(); abrirSaque() });
  await m.waitForTimeout(500);
  t(await m.locator('#fbk-btn').evaluate(e=>getComputedStyle(e).opacity==='0'&&getComputedStyle(e).pointerEvents==='none'),
    'com uma folha aberta, o botão de suporte sai da frente dela');
  await m.evaluate(()=>document.querySelectorAll('.ovl:not([hidden])').forEach(o=>o.hidden=true));
  await m.waitForTimeout(100);
  t(await m.locator('#fbk-btn').evaluate(e=>getComputedStyle(e).opacity!=='0'),
    'e volta quando a folha fecha');
  await m.locator('#fbk-btn').click(); await m.waitForTimeout(250);

  /* ============ O ZOOM DO iPHONE ============
     Victor: "quando abre o botão de suporte, tá dando zoom na tela".
     O Safari do iOS amplia a página inteira sempre que o campo que recebe
     o foco tem fonte MENOR que 16px — e não desfaz quando o foco sai.
     O suporte só era o mais visível porque é o único que põe o foco
     sozinho ao abrir; o defeito era de todo campo, porque .fld nasceu com
     13.5px. Este teste varre a FOLHA, não o DOM: campo que mora em modal
     que a suíte não abriu conta igual. */
  t(await m.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('fbk-msg')).fontSize))>=16,
    'o campo do suporte tem 16px no celular — abaixo disso o iOS dá zoom');
  t(await m.evaluate(()=>document.activeElement.id!=='fbk-msg'),
    'e o painel não rouba o teclado ao abrir: quem abre quer ler antes de escrever');
  const pequenos=await m.evaluate(()=>{
    const ruins=[];
    const varrer=rs=>{ for(const r of rs){
      if(r.cssRules&&r.type===4){ varrer(r.cssRules); continue }
      if(!r.selectorText||!r.style) continue;
      const fs=parseFloat(r.style.getPropertyValue('font-size'));
      if(!(fs>0)||fs>=16) continue;
      r.selectorText.split(',').map(x=>x.trim()).forEach(sel=>{
        let campo=false;
        try{ campo=[...document.querySelectorAll(sel)].some(e=>/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) }catch(e){}
        if(!campo&&/(^|[\s>+~])(input|select|textarea)(\[[^\]]*\])?$/i.test(sel)) campo=true;
        if(campo) ruins.push(sel);
      });
    }};
    for(const s of document.styleSheets){ try{ varrer(s.cssRules) }catch(e){} }
    /* a regra do fim da folha é a que conserta — o que importa é o
       COMPUTADO, então confere elemento por elemento o que está na tela */
    const vivos=[];
    document.querySelectorAll('input,select,textarea').forEach(e=>{
      const t=(e.type||'').toLowerCase();
      if(['hidden','checkbox','radio','file','color','range','submit','button','image'].includes(t)) return;
      if(parseFloat(getComputedStyle(e).fontSize)<16) vivos.push(e.id||e.className||e.tagName);
    });
    return {regras:[...new Set(ruins)], vivos};
  });
  t(pequenos.vivos.length===0,
    'e NENHUM campo da tela fica abaixo de 16px no celular'+(pequenos.vivos.length?': '+pequenos.vivos.join(', '):''));
  await ctx2.close();

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

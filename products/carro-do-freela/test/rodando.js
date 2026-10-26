/* RODANDO AGORA — o mural de 24 horas
 *
 * ⚠️ NÃO CONFUNDIR COM "quem está em job": esta faixa é o que a praça
 * está postando do set HOJE, e some sozinho depois de 24h. Quem está
 * escalado num job é outra coisa, e mora no painel do job.
 *
 * Duas regras aqui são de produto, não de implementação:
 *
 *   · O QUE VENCEU SOME SOZINHO. `rdVivo` deriva da hora do post — não há
 *     campo "expirado" que alguém marca, porque campo paralelo
 *     dessincroniza e a faixa passaria a mostrar ontem como se fosse hoje.
 *   · A ORDEM CONGELA QUANDO O VISOR ABRE. `rdGrupos()` ordena por "tem
 *     coisa nova", e assistir MARCA como visto — se a ordem fosse
 *     perguntada de novo a cada virada, a pessoa que você acabou de ver
 *     pularia para trás no meio da sequência.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
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
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);
  await p.evaluate(()=>show('feed')); await p.waitForTimeout(500);

  t(await p.locator('#v-feed .rdcab').count()===1,'o feed abre com a faixa "Rodando agora"');
  t(/some em 24h/.test(await p.locator('#v-feed .rdcab').textContent()),
    'e a cabeça diz o prazo — quem posta precisa saber que aquilo vence');
  const itens=await p.locator('#rd-bar .rdit').count();
  t(itens>0,'com gente na fileira: '+itens);

  /* ============ um item por PESSOA, não por post ============ */
  const grupos=await p.evaluate(()=>{
    const gs=rdGrupos();
    return {gs:gs.length,posts:RODANDO.filter(rdVivo).length,
            maior:Math.max(...gs.map(g=>g.itens.length))};
  });
  t(grupos.maior>1,'alguém tem mais de um post vivo: '+grupos.maior);
  t(grupos.gs<grupos.posts,
    'e a fileira agrupa por pessoa — '+grupos.gs+' pessoas para '+grupos.posts+' posts, não uma bolinha por foto');
  /* ⚠️ A MINHA BOLINHA EXISTE SEMPRE, com o "+", mesmo sem eu ter postado:
     ela é a porta de publicar, e escondê-la deixaria a fileira sem
     entrada. Por isso a conta da tela é grupos + 1 para quem não postou. */
  const temMeu=await p.evaluate(()=>rdGrupos().some(g=>g.eu));
  t(itens===grupos.gs+(temMeu?0:1),
    'o que a tela desenha bate com os grupos, mais a minha bolinha de publicar: '+itens);
  t(/Você/.test(await p.locator('#rd-bar .rdit').first().textContent()),
    'e a primeira da fileira é a minha — a porta de publicar vem antes de assistir');

  /* ============ o que venceu some sozinho ============ */
  const venceu=await p.evaluate(()=>{
    const antes=RODANDO.filter(rdVivo).length;
    RODANDO.push({id:9999,autor:RODANDO[0].autor,tipo:"foto",src:"",
                  q:Date.now()-48*3600000,txt:"de anteontem"});
    const depois=RODANDO.filter(rdVivo).length;
    const temCampo=RODANDO.some(x=>x.expirado!==undefined||x.vivo!==undefined);
    RODANDO=RODANDO.filter(x=>x.id!==9999);
    return {antes,depois,temCampo};
  });
  t(venceu.depois===venceu.antes,'post de 48h atrás não entra na conta — venceu, sumiu');
  t(!venceu.temCampo,
    'e ninguém carrega campo "expirado": o estado deriva da HORA, senão a faixa mostraria ontem como hoje');

  /* ============ assistir marca como visto ============ */
  const primeiro=await p.evaluate(()=>{
    const g=rdGrupos().find(x=>!x.eu);
    return g?{autor:g.autor,ids:g.itens.map(i=>i.id),novo:g.novo}:null;
  });
  t(primeiro&&primeiro.novo,'a fileira começa com material não visto');
  if(primeiro){
    /* ⚠️ `.first()` é a MINHA bolinha, e ela abre o seletor de arquivo, não
       o visor. Quem assiste é a segunda em diante. */
    await p.locator('#rd-bar .rdit').nth(1).click(); await p.waitForTimeout(600);
    t(await p.locator('#ovl-rd').isVisible(),'e o visor abre');
    t(await p.evaluate(()=>rdVistos.size)>0,'abrir o visor marca o que foi visto');
    /* ⚠️ e a ordem NÃO se refaz no meio: quem foi visto agora não pula
       para trás enquanto a sequência corre */
    const ordemAntes=await p.evaluate(()=>rdGrupos().map(g=>g.autor).join('|'));
    await p.waitForTimeout(300);
    const ordemDepois=await p.evaluate(()=>rdGrupos().map(g=>g.autor).join('|'));
    t(ordemAntes===ordemDepois,'e a ordem não muda debaixo do dedo de quem está assistindo');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.evaluate(()=>{const o=document.querySelector('#gwrap'); if(o) o.innerHTML=''});
  }

  /* ============ e ela sabe ficar quieta ============
     ⚠️ Marketplace parado não se explica: a pessoa entende sozinha que
     ninguém postou. Fileira vazia com esqueleto seria fingir movimento. */
  await p.evaluate(()=>{RODANDO.length=0;rdVistos.clear();drawRodando()});
  await p.waitForTimeout(400);
  t(await p.locator('#rd-bar .rdit').count()<=1,
    'sem ninguém postando, a fileira não inventa cartão — no máximo sobra o "seu"');

  /* ============ mobile ============ */
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);
  /* ⚠️ a fileira rola SOZINHA, na horizontal — é ela que passa de largura,
     nunca a página */
  const rola=await p.evaluate(()=>getComputedStyle(document.getElementById('rd-bar')).overflowX);
  t(rola==='auto'||rola==='scroll','e quem rola de lado é a fileira, não a página: overflow-x '+rola);

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();

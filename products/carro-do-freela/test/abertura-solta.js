/* NENHUM ERRO PRENDE A PESSOA NA ABERTURA (18/out · 3).
 *
 * Victor, no Safari do computador: "travado o site" — a logo parada para
 * sempre. Na janela anônima abria. A diferença entre as duas é o estado
 * GUARDADO: com uso salvo, o boot redesenha tudo com o que veio do disco, e
 * a saída da abertura mora no fim do boot. Um erro ali abortava o script e
 * a saída nunca chegava.
 *
 * O que esta suíte jura:
 *   1. estado salvo que quebra o redesenho NÃO prende a abertura: a página
 *      abre na home, e o erro fica anotado e vai junto no suporte;
 *   2. qualquer erro não tratado com o véu de pé solta o véu;
 *   3. num arranque limpo não há erro anotado nenhum.
 *
 * Roda em origem http: o estado salvo mora no localStorage.
 */
const { chromium } = require('playwright');
const {servir,URL}=require('./_servir.js');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const abrir=async(semente)=>{
    const ctx=await b.newContext({viewport:{width:1440,height:900}});
    const p=await ctx.newPage(); await servir(p);
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript(s=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-guia','1');
      if(s) localStorage.setItem('cdf-uso',JSON.stringify({v:1,quando:Date.now(),d:s}));
    }catch(e){} },semente||null);
    await p.goto(URL,{waitUntil:'domcontentloaded'});
    return {ctx,p,errs};
  };

  /* ---------- 1. o estado salvo que quebra o redesenho ---------- */
  {
    /* POSTS virou texto e a última tela foi o Feed: o redesenho do Feed
       quebra (POSTS.filter não existe) — é a forma do que um dado antigo,
       de outra versão, faz na volta */
    const {ctx,p,errs}=await abrir({POSTS:'lixo de outra versão',S:{tab:'feed'}});
    const saiu=await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:12000}).then(()=>true,()=>false);
    t(saiu,'⟶⟶ com o estado salvo quebrando o redesenho, a abertura SAI mesmo assim — a pessoa não fica presa na logo');
    const r=await p.evaluate(()=>({abriu:document.body.classList.contains('abriu'), home:!v('v-home').hidden,
      erros:ERROS_BOOT.slice(), tab:S.tab}));
    t(r.abriu&&r.home,'e a página abre na home ('+r.tab+')');
    t(r.erros.some(e=>/^uso: /.test(e)),'o erro fica anotado: '+JSON.stringify(r.erros));
    t(errs.length===0,'e ele foi tratado — nenhum erro estourou na página ('+errs.join(' | ')+')');
    await p.locator('#fbk-btn').click(); await p.waitForTimeout(250);
    const ctxTxt=await p.locator('#fbk-ctx').textContent();
    t(/erro no arranque: uso: /.test(ctxTxt),'⟶⟶ e o erro vai junto no recado de suporte, à vista no painel: "'+ctxTxt.slice(0,120)+'…"');
    await ctx.close();
  }

  /* ---------- 2. qualquer erro com o véu de pé solta o véu ---------- */
  {
    const {ctx,p}=await abrir();
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:12000});
    /* o véu de verdade já saiu; põe-se um de novo, e um erro não tratado */
    const r=await p.evaluate(async()=>{
      document.body.classList.remove('abriu');
      const d=document.createElement('div'); d.id='splash'; document.body.append(d);
      setTimeout(()=>{ throw new Error('erro de teste no arranque') },0);
      await new Promise(r=>setTimeout(r,700));
      const sai=d.classList.contains('sai'), abriu=document.body.classList.contains('abriu');
      /* ⚠️ 1700 desde 19/out · 4: a saída ficou mais lenta (o íris leva 1s)
         e o véu sai do DOM 1,5s depois dela, não mais 0,95s */
      await new Promise(r=>setTimeout(r,1700));
      return {sai,abriu,foi:!document.getElementById('splash'),erros:ERROS_BOOT.slice()};
    });
    t(r.sai&&r.abriu,'⟶⟶ um erro não tratado com o véu de pé solta o véu');
    t(r.foi,'e o véu sai do DOM depois da transição');
    t(r.erros.some(e=>/erro de teste no arranque/.test(e)),'e o erro fica anotado');
    await ctx.close();
  }

  /* ---------- 3. o controle: arranque limpo ---------- */
  {
    const {ctx,p,errs}=await abrir();
    await p.waitForFunction(()=>!document.getElementById('splash'),null,{timeout:12000});
    const r=await p.evaluate(()=>({erros:ERROS_BOOT.length, home:!v('v-home').hidden}));
    t(r.erros===0&&r.home&&errs.length===0,'num arranque limpo não há erro anotado nenhum, e a home abre');
    await ctx.close();
  }

  console.log('ABERTURA SOLTA');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

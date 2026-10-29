/* A BUSCA DO BRECHÓ E O CARTÃO DO JOB (17/out · 9), da prancha do Victor.
 *
 * Brechó: "Buscar equipamento, marca ou modelo" no catálogo, em todo
 * anúncio ATIVO de uma vez, sem acento e sem caixa, cada palavra contando.
 * O resultado usa o MESMO cartão do brechó — nenhuma foto nova inventada.
 *
 * Agenda: o dia escolhido mostra o job como cartão — cliente, função e o
 * SELO de situação na cabeça —, e o link do cliente continua sendo o
 * .linkc de sempre (é por ele que se abre a produtora). */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);

(async()=>{
  const b=await require('./_navegador.js').abrir();
  for(const [W,H,mob] of [[1440,900,false],[390,844,true]]){
    const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:mob});
    const p=await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await p.addInitScript(()=>{ try{
      localStorage.setItem('cdf-pv','1'); localStorage.setItem('cdf-entrou','1');
      localStorage.setItem('cdf-guia','1'); localStorage.removeItem('cdf-uso');
    }catch(e){} });
    await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
    await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
    await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
    await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);

    /* ============ a busca do brechó ============ */
    await p.evaluate(()=>{ show('brecho'); painelBrecho('comprar') }); await p.waitForTimeout(300);
    t(await p.locator('#b-qtop').isVisible(),W+'px: o catálogo abre com a busca geral à vista');
    const alvo=await p.evaluate(()=>{ const a=ANUNCIOS.find(x=>x.estadoVenda==='disponivel');
      return {id:a.id,t:a.t,pal:a.t.split(/\s+/)[0]} });
    await p.fill('#b-qtop',alvo.pal.toUpperCase()); await p.waitForTimeout(400);
    let m=await p.evaluate(()=>({
      ids:[...document.querySelectorAll('#b-achados [data-a]')].map(x=>+x.dataset.a),
      grid:v('b-catgrid').hidden,
      todosAtivos:[...document.querySelectorAll('#b-achados [data-a]')].every(x=>ANUNCIOS.find(a=>a.id===+x.dataset.a).estadoVenda==='disponivel'),
      mesmoCartao:[...document.querySelectorAll('#b-achados [data-a]')].every(x=>x.classList.contains('an'))
    }));
    t(m.ids.includes(alvo.id),W+'px: ⟶⟶ "'+alvo.pal.toUpperCase()+'" acha "'+alvo.t+'" — sem caixa');
    t(m.grid,'e a grade de categorias sai de cena enquanto há busca');
    t(m.todosAtivos,'só anúncio ativo entra no resultado');
    t(m.mesmoCartao,'com o mesmo cartão do resto do brechó (nada de foto nova)');
    await p.fill('#b-qtop','zzzz nada disso'); await p.waitForTimeout(400);
    t(/Nenhum anúncio/.test(await p.locator('#b-achados').textContent()),'sem resultado, a tela diz e sugere o que tentar');
    await p.locator('#b-qlimpa').click(); await p.waitForTimeout(300);
    t(!await p.evaluate(()=>v('b-catgrid').hidden)&&await p.evaluate(()=>v('b-achados').hidden),
      '"Limpar" devolve as categorias');
    await p.fill('#b-qtop',alvo.pal); await p.waitForTimeout(400);
    await p.locator('#b-achados [data-a="'+alvo.id+'"]').click(); await p.waitForTimeout(400);
    t(await p.evaluate(()=>S.tab==='anuncio'&&anuncioAtual&&anuncioAtual.id)===alvo.id,'e o cartão abre o anúncio de verdade');

    /* ============ o cartão do job ============ */
    await p.evaluate(()=>{ show('agenda');
      const j=JOBS.find(x=>x.cliente)||JOBS[0]; S.selDia=j.data||key(dateAt(0)); drawAgenda() });
    await p.waitForTimeout(400);
    m=await p.evaluate(()=>{ const c=document.querySelector('#ag-detail .jcart');
      return {tem:!!c, cab:!!(c&&c.querySelector('.jc-cab')),
        selo:c&&(c.querySelector('.jc-st')||{}).textContent,
        link:!!(c&&c.querySelector('.jc-cab .linkc')) } });
    t(m.tem&&m.cab,W+'px: ⟶⟶ o job do dia é um cartão com cabeça');
    t(/^(Confirmado|Segurando data)$/.test(m.selo||''),'com o selo da situação: '+m.selo);
    t(m.link,'e o cliente continua sendo o link para a produtora');
    t(errs.length===0,W+'px: zero erro de console/página'+(errs.length?' — '+errs[0]:''));
    await ctx.close();
  }
  console.log('BUSCA E CARTÃO');
  ok.forEach(x=>console.log('  ✓ '+x));
  bad.forEach(x=>console.log('  ✗ '+x));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

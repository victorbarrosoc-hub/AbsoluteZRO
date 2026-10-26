/* ACHAR ALGUÉM — a busca de pessoa, de graça, dos dois lados.
 *
 * Victor (24/ago): "monte seu time só dá acesso a quem eu conheço, mas
 * como eu vou achar a pessoa?" — não achava. A busca era de contratante
 * e trancada na agenda (Volante); o freela não tinha COMO chegar no
 * perfil de um colega que não estivesse no feed dele.
 *
 * A regra dura desta tela é uma FRONTEIRA DE PLANO, e é ela que a suíte
 * jura: achar a PESSOA é grátis; saber QUEM ESTÁ LIVRE em que data é o
 * que o Volante vende. Se um dia esta lista mostrar "livre hoje", o
 * Volante morreu — bastaria buscar nome por nome. */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const PRE=pg=>pg.addInitScript(()=>{ try{
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-entrou','1');
  localStorage.setItem('cdf-guia','1');
  localStorage.removeItem('cdf-uso');
}catch(e){} });

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await PRE(p);
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(220);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(150);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);

  /* ============ a porta existe, e nos DOIS chapéus ============
     Lição do "montar equipe sem porta": conferir a PORTA, não a tela. */
  let m=await p.evaluate(()=>{
    const vis=el=>el&&el.offsetParent!==null;
    abrirGaveta();
    const fre=[...document.querySelectorAll('.gaveta .gitem')].filter(vis)
      .some(e=>/Achar alguém/.test(e.textContent));
    fecharGaveta();
    MODO='contratante'; aplicarModo();
    abrirGaveta();
    const con=[...document.querySelectorAll('.gaveta .gitem')].filter(vis)
      .some(e=>/Achar alguém/.test(e.textContent));
    fecharGaveta();
    MODO='freela'; aplicarModo();
    return {fre,con};
  });
  t(m.fre,'o freela tem a porta na gaveta — era ele que não tinha como achar ninguém');
  t(m.con,'e quem contrata também');

  /* ============ buscar por nome, função e cidade ============ */
  m=await p.evaluate(()=>{
    show('achar');
    const busca=q=>{ v('ach-q').value=q; drawAchar();
      return document.querySelectorAll('[data-achid]').length };
    const primeiro=CREW[0].nome.split(/\s+/)[0];
    return {
      vazio:(v('ach-q').value='',drawAchar(),document.querySelectorAll('[data-achid]').length),
      dica:v('ach-rows').innerText,
      nome:busca(primeiro), acento:busca(primeiro.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g,'')),
      funcao:busca('drone'), cidade:busca('mossor'),
      nada:busca('zzzz'), vazioAvisa:!v('ach-vazio').hidden
    };
  });
  t(m.vazio===0&&/Volante/.test(m.dica),
    'sem busca a tela não lista ninguém — e a dica já diz onde mora o "quem está livre"');
  t(m.nome>0,'acha pelo primeiro nome: '+m.nome+' resultado(s)');
  t(m.acento===m.nome,'⟶⟶ com ou sem acento dá no mesmo — ninguém digita cedilha no celular');
  t(m.funcao>0,'acha por função ("drone"): '+m.funcao);
  t(m.cidade>0,'acha por cidade ("mossor…"): '+m.cidade);
  t(m.nada===0&&m.vazioAvisa,'busca sem resultado avisa em vez de ficar muda');

  /* ============ a fronteira de plano ============ */
  m=await p.evaluate(()=>{
    v('ach-q').value='a'; drawAchar();
    const txt=v('ach-rows').innerText;
    return { linhas:document.querySelectorAll('[data-achid]').length,
      vazouLivre:/livre|na escuta|ocupado/i.test(txt) };
  });
  t(m.linhas>0&&!m.vazouLivre,
    '⟶⟶ a lista NÃO diz quem está livre — senão a busca por nome viraria a Escuta de graça');

  /* ============ abre o perfil ============ */
  await p.evaluate(()=>{ v('ach-q').value=CREW[3].nome.split(/\s+/)[0]; drawAchar() });
  await p.locator('[data-achid]').first().click(); await p.waitForTimeout(500);
  m=await p.evaluate(()=>({tela:S.tab,
    nome:(document.getElementById('p-nome')||{}).textContent||''}));
  t(m.tela==='perfil'&&m.nome.trim().length>0,
    'tocar numa linha abre o perfil-portfólio da pessoa: '+m.nome.trim().split(' ')[0]);

  /* ============ a ponte a partir do Montar equipe ============ */
  m=await p.evaluate(()=>{
    MODO='contratante'; aplicarModo(); show('equipe');
    const bt=document.querySelector('[data-irachar]');
    if(!bt) return {tem:false};
    bt.click();
    return {tem:true, tela:S.tab};
  });
  t(m.tem&&m.tela==='achar',
    'o Montar equipe tem a ponte "procure pelo nome" — era exatamente a pergunta do Victor');

  t(errs.length===0,'zero erro de console/página'+(errs.length?' — '+errs[0]:''));

  console.log('ACHAR');
  ok.forEach(m=>console.log('  ✓ '+m));
  bad.forEach(m=>console.log('  ✗ '+m));
  console.log(ok.length+' ok, '+bad.length+' falhas');
  await b.close();
  process.exit(bad.length?1:0);
})();

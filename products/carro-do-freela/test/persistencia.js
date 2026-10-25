/* O QUE SOBREVIVE AO RECARREGAR, E O QUE É LIMPO DE PROPÓSITO
 *
 * ⚠️ ESTA SUÍTE PRECISA DE ORIGEM http, e a razão custou uma tarde: o
 * Chromium descarta o localStorage de origem `file://` de vez em quando —
 * aqui deu 1 em 14 recarregamentos. O sintoma era esta suíte falhando em
 * lugar diferente a cada rodada, como se alguma função do produto
 * estivesse limpando o depósito sozinha.
 *
 * Como se provou que não era o produto: uma CANÁRIA — uma chave que não
 * está em `USO_APAGAVEIS`, escrita antes do reload. Ela morria junto. O
 * culpado era o ambiente, e nenhuma linha do arquivo estava envolvida.
 * A canária continua aqui embaixo, porque o dia em que ela morrer de novo
 * é o dia em que alguém vai suspeitar do produto outra vez.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const {servir,URL}=require('./_servir.js');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await servir(p);
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.setItem('cdf-guia','1');    /* o guia das portas nao cobre a tela */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(240);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(800);

  t(await p.evaluate(()=>typeof usoGravar==='function'),'existe a gravação de uso');
  t(await p.evaluate(()=>usoLigado===true),'e ela está ligada depois de entrar');

  /* ============ o que a pessoa fez precisa voltar ============ */
  await p.evaluate(()=>{
    EU.nome='Teste da Silva'; EU.cidade='Natal/RN';
    PRECOS.base[EU.func[0]||'Op. de câmera']=1234;
    FAV.add(CREW.find(c=>!c.me).id);
    TRABALHOS.push({id:987654,dono:EU.id,titulo:'Peça de conferência',cliente:'Cliente X',ano:2025});
    localStorage.setItem('cdf-canario','vivo');   /* a canária: NÃO é apagável */
    /* ⚠️ (19/out) "os favoritos voltam" contava QUANTOS — e o primeiro da
       lista já nascia seguido pela semente do feed, então a contagem batia
       mesmo sem FAV estar em DEPOSITOS. Agora segue alguém que a semente NÃO
       segue, e confere essa pessoa pelo id. Junto: o perfil de quem
       contrata, a curtida no feed e as chaves da agenda, que também sumiam. */
    const novo=CREW.filter(c=>!c.me&&!FAV.has(c.id)).slice(-1)[0];
    FAV.add(novo.id); localStorage.setItem('cdf-favnovo',String(novo.id));
    PROD.nome='Produtora da Conferência';
    euCurti.add(POSTS[0].id); localStorage.setItem('cdf-curti',String(POSTS[0].id));
    gcal=true; zap=true;
    usoGravar();
  });
  await p.waitForTimeout(400);
  const antes=await p.evaluate(()=>({
    nome:EU.nome, preco:PRECOS.base[EU.func[0]||'Op. de câmera'],
    favs:[...FAV].length, trab:TRABALHOS.filter(x=>x.id===987654).length
  }));
  t(antes.trab===1,'o trabalho de conferência entrou');

  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(800);

  /* ⚠️ A CANÁRIA PRIMEIRO. Se ela morreu, o ambiente comeu o depósito e
     qualquer falha abaixo é ruído — não defeito do produto. */
  const canario=await p.evaluate(()=>{try{return localStorage.getItem('cdf-canario')}catch(e){return null}});
  t(canario==='vivo',
    'a canária sobreviveu ao recarregar — se ela morrer, o culpado é o navegador, não o produto');

  const dps=await p.evaluate(()=>({
    nome:EU.nome, preco:PRECOS.base[EU.func[0]||'Op. de câmera'],
    favs:[...FAV].length, trab:TRABALHOS.filter(x=>x.id===987654).length
  }));
  t(dps.nome===antes.nome,'o nome volta: '+dps.nome);
  t(dps.preco===antes.preco,'a tabela volta: '+dps.preco);
  t(dps.favs===antes.favs,'os favoritos voltam: '+dps.favs);
  t(dps.trab===1,'e o trabalho publicado volta');
  const decl=await p.evaluate(()=>({
    fav:FAV.has(+localStorage.getItem('cdf-favnovo')), prod:PROD.nome,
    curti:euCurti.has(+localStorage.getItem('cdf-curti'))||euCurti.has(localStorage.getItem('cdf-curti')),
    gcal, zap }));
  t(decl.fav,'⟶⟶ quem a pessoa passou a seguir continua seguido (pelo id, não pela contagem)');
  t(decl.prod==='Produtora da Conferência','⟶⟶ o perfil de quem contrata volta — antes voltava "Produtora Maré" ('+decl.prod+')');
  t(decl.curti,'a curtida no feed volta');
  t(decl.gcal&&decl.zap,'as chaves de Google Agenda e WhatsApp da agenda voltam');

  /* ============ Set e Date sobrevivem à ida e volta ============
     ⚠️ JSON não sabe nenhum dos dois. `usoTroca`/`usoVolta` embrulham na
     saída e desembrulham na entrada — e `usoTroca` NÃO pode ser arrow,
     porque precisa de `this[k]` para ver a Date crua: JSON.stringify chama
     toJSON() antes do replacer, então `v instanceof Date` nunca é verdade.
     Custou um boot inteiro quebrado para aparecer. */
  const tipos=await p.evaluate(()=>({
    fav:FAV instanceof Set,
    mes:S.mesRef instanceof Date,
    mesOk:typeof S.mesRef.getMonth==='function'
  }));
  t(tipos.fav,'FAV volta como Set, não como lista');
  t(tipos.mes&&tipos.mesOk,'e S.mesRef volta como Date de verdade — com getMonth() funcionando');

  /* ============ o que NÃO deve voltar ============ */
  const limpo=await p.evaluate(()=>({
    aviso:!!document.querySelector('#ovl-pv:not([hidden])'),
    chamada:CHAMADA
  }));
  t(!limpo.aviso,'o aviso de primeira visita não volta para quem já leu');

  /* ============ recomeçar do zero apaga TUDO que é do protótipo ============ */
  const apagaveis=await p.evaluate(()=>USO_APAGAVEIS.slice());
  t(apagaveis.length>=5,'a lista do que "recomeçar do zero" apaga tem '+apagaveis.length+' chaves');
  t(apagaveis.includes('cdf-uso'),'inclui o uso');
  t(apagaveis.includes('cdf-visto'),'inclui os explicadores já lidos');
  t(apagaveis.includes('cdf-guia'),'inclui o guia das quatro portas — quem recomeça vê o que quem chega vê');
  /* ⚠️ E NÃO INCLUI O CONTATO. "Recomeçar do zero" limpa o que a pessoa
     fez no protótipo; o contato que ela deixou já saiu do aparelho e não
     volta. Sem isso a lista de convite nasceria com gente repetida. */
  t(!apagaveis.includes('cdf-guardei'),
    'e NÃO inclui o contato deixado para o lançamento — esse já saiu daqui');
  t(!apagaveis.includes('cdf-canario'),'nem qualquer chave de fora da lista');

  await p.evaluate(()=>usoApagar());
  const depois=await p.evaluate(()=>{
    const r={};
    ['cdf-uso','cdf-visto','cdf-pv','cdf-guia','cdf-canario'].forEach(k=>{
      try{ r[k]=localStorage.getItem(k) }catch(e){ r[k]='?' }
    });
    return r;
  });
  t(depois['cdf-uso']===null&&depois['cdf-visto']===null&&depois['cdf-guia']===null,
    'apagar leva as chaves do protótipo');
  t(depois['cdf-canario']==='vivo','e não encosta no que não é dele');

  /* ============ armazenamento bloqueado não pode derrubar a página ============
     ⚠️ Safari em aba privada LANÇA em localStorage.setItem. Se isso subisse,
     a página morreria no boot para quem abre em anônima. */
  const ctx2=await b.newContext({viewport:{width:1280,height:1000}});
  const q=await ctx2.newPage();
  const errs2=[]; q.on('pageerror',e=>errs2.push('ERR: '+e.message));
  await servir(q);
  await q.addInitScript(()=>{
    const erro=()=>{ throw new Error('QuotaExceededError (simulado)') };
    try{ Object.defineProperty(window,'localStorage',{configurable:true,get(){
      return {getItem:erro,setItem:erro,removeItem:erro,clear:erro,key:erro,length:0};
    }}) }catch(e){}
  });
  await q.goto(URL,{waitUntil:'networkidle'}); await q.waitForTimeout(700);
  t(errs2.length===0,'com o armazenamento lançando erro, a página ainda carrega sem quebrar'
    +(errs2.length?': '+errs2[0]:''));
  t(await q.locator('#v-home').isVisible(),'e a home aparece do mesmo jeito');
  await ctx2.close();

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();

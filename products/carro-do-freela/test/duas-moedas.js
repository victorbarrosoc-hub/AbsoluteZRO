/* AS DUAS MOEDAS, LADO A LADO
 *
 * Um testador leu a carteira e saiu com take e pedágio fundidos numa coisa
 * só: *"tem uma moeda própria, acho que é pedágio… não entendi muito bem
 * como funcionaria."* E a tela já explicava as duas, separadamente e
 * corretamente — o take em cima, o pedágio embaixo. O que faltava era
 * dizer que são DUAS e qual é a diferença, antes dos números.
 *
 * O que esta suíte protege:
 *   1. o bloco existe, vem ANTES do saldo, e mostra as duas moedas;
 *   2. cada afirmação dele é uma regra que existe no código — em especial
 *      "paga o que é da casa", que DERIVA de `PED_PAGA` em vez de repetir
 *      uma lista escrita à mão que já tinha ficado desatualizada;
 *   3. explicar uma vez é ajuda, explicar toda vez é mobília: ele recolhe
 *      no carregamento seguinte e o "?" o traz de volta;
 *   4. o aviso do brinde de boas-vindas LEVA até aqui.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
/* ⚠️ ORIGEM HTTP (17/out · 14). A suíte depende do `cdf-visto` sobreviver a
   um segundo carregamento ("na visita seguinte ele já vem recolhido"), e em
   `file://` o Chromium descarta o localStorage de vez em quando: na bateria
   15 o "?" não existia porque o explicador voltou ABERTO, e ela passou 2 de 2
   rodada sozinha. É o flake que já levou `orcamento`, `explicador` e
   `densidade` para o `_servir`. */
const {servir,URL}=require('./_servir.js');
const PRE=p=>p.addInitScript(() => { try {
  localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
  localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
  localStorage.setItem('cdf-guia','1');    /* o guia das portas nao cobre a tela */
  localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
} catch(e) {} });
/* ⚠️ O BRINDE DE BOAS-VINDAS SÓ CHEGA PARA QUEM NUNCA ENTROU, e o preâmbulo
   de sempre põe `cdf-entrou` justamente para NÃO zerar o perfil a cada
   login. Então aquele pedaço precisa de uma página onde a conta é nova. */
const PRE_NOVO=p=>p.addInitScript(() => { try {
  localStorage.setItem('cdf-pv','1');
  localStorage.setItem('cdf-guia','1');
  localStorage.removeItem('cdf-entrou');
  localStorage.removeItem('cdf-uso');
} catch(e) {} });
const entrar=async p=>{
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(230);
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(170);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(760);
};

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const errs=[];

  /* ============ o aviso do brinde leva à explicação ============
     ⚠️ CONTEXTO PRÓPRIO. Na primeira versão esta página dividia o contexto
     com a de baixo — e como ela abre a carteira, marcava o explicador como
     visto no MESMO localStorage. A página seguinte nascia com o bloco já
     recolhido, e a suíte acusava que ele não aparecia. Duas "pessoas" no
     mesmo contexto são a mesma pessoa. */
  {
    const c2=await b.newContext({viewport:{width:1280,height:1100}});
    const q=await c2.newPage();
    await servir(q);
    q.on('pageerror',e=>errs.push('ERR: '+e.message));
    q.on('console',m=>m.type()==='error'&&errs.push(m.text()));
    await PRE_NOVO(q);
    await entrar(q);
    const avz=q.locator('#avisos .avz').filter({hasText:'boas-vindas'});
    const tem=await avz.count()===1;
    t(tem,'quem abre conta recebe o aviso do brinde de pedágio');
    if(tem){
      t(/toque para ver/.test(await avz.textContent()),
        'e o aviso CONVIDA a abrir — antes ele anunciava a moeda e morria em 9 segundos');
      t(await avz.locator('em').count()===1,'com a marca de que dá para tocar');
      await avz.click(); await q.waitForTimeout(700);
      t(await q.evaluate(()=>S.tab)==='brecho' && await q.evaluate(()=>BPANEL)==='vender',
        'e o toque abre a CARTEIRA — não o catálogo do brechó, que é onde ele caía antes');
    }
    await c2.close();
  }

  const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const p=await ctx.newPage();
  await servir(p);
  p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await PRE(p);
  await entrar(p);
  await p.evaluate(()=>{painelBrecho('vender');show('brecho')}); await p.waitForTimeout(500);

  /* ============ o bloco ============ */
  const bloco=p.locator('#ct-duas');
  t(await bloco.isVisible(),'o comparativo das duas moedas aparece na carteira');
  t(await bloco.locator('.m').count()===2,'com duas colunas, uma para cada moeda');
  const antes=await p.evaluate(()=>{
    const d=document.getElementById('ct-duas'), f=document.getElementById('ct-fatos');
    return d.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING?1:0;
  });
  t(antes===1,'e vem ANTES do saldo — quem chega pergunta "por que existe uma moeda" antes de "quanto tenho"');
  const txt=await bloco.textContent();
  t(/take/i.test(txt)&&/pedágio/i.test(txt),'as duas são nomeadas');
  t(/o seu dinheiro/.test(txt)&&/desconto da casa/.test(txt),
    'cada uma com o que ela É, em três palavras');
  t(/nunca uma soma/.test(txt),'e a tela diz por que são duas linhas e nunca um total');

  /* ---- cada afirmação bate com uma regra do código ---- */
  const regras=await p.evaluate(()=>({
    paridade:MOEDA.paridade, paga:PED_PAGA.slice(), lista:listaPedPaga()
  }));
  t(txt.includes(regras.paridade),'a paridade sai de MOEDA.paridade, não de um número digitado: '+regras.paridade);
  t(txt.includes(regras.lista),'e o que o pedágio paga sai de PED_PAGA: "'+regras.lista+'"');
  /* ⚠️ ESTA É A ASSERÇÃO QUE IMPORTA. O texto antigo dizia "plano e taxa"
     cravado, e já mentia por omissão: fundar guilda também sai daqui. */
  t(regras.paga.every(k=>regras.lista.includes(
      ({plano:'plano',taxa:'taxa',guilda:'fundar guilda'})[k]||k)),
    'todo item de PED_PAGA aparece na tela — item novo lá não some daqui: '+regras.paga.join(', '));

  /* ⚠️ a caixa do pedágio só existe quando HÁ pedágio: ela não ocupa
     espaço com um zero. O brinde é dado aqui pela mesma porta da campanha. */
  await p.evaluate(()=>{darPedagio(120,"conferência da suíte",null);drawVendas()});
  await p.waitForTimeout(300);
  const pdgbox=await p.locator('#ct-pedagio').textContent();
  t(pdgbox.includes(regras.lista),'e a caixa do pedágio conta a MESMA lista, das mesmas regras');

  /* ---- o que ela NEGA também é regra ---- */
  t(/não vira dinheiro/.test(txt),'pedágio não vira dinheiro');
  t(/não compra equipamento/.test(txt),
    'nem compra equipamento — ali o dinheiro é de outro usuário, e é o que mantém a submoeda fora da régua do BACEN');
  t(/não dá para comprar nem recarregar/.test(txt),
    'e take não se compra: dinheiro que entra vem sempre amarrado a uma transação');

  /* ============ recolhe no carregamento SEGUINTE ============ */
  t(await p.evaluate(()=>{
    try{ return JSON.parse(localStorage.getItem('cdf-visto')||'[]').includes('duasmoedas') }
    catch(e){ return false }
  }),'abrir a carteira marca o explicador como visto');
  t(await bloco.isVisible(),'mas ele NÃO some no meio do uso — tapete puxado é pior que texto a mais');

  await entrar(p);
  await p.evaluate(()=>{painelBrecho('vender');show('brecho')}); await p.waitForTimeout(500);
  t(!await p.locator('#ct-duas').isVisible(),'na visita seguinte ele já vem recolhido');
  const tog=p.locator('#bp-vender .explitog');
  t(await tog.count()===1,'e sobra o "?" no lugar dele');
  await tog.click(); await p.waitForTimeout(300);
  t(await p.locator('#ct-duas').isVisible(),'que traz o comparativo de volta a qualquer hora');
  await tog.click(); await p.waitForTimeout(300);
  t(!await p.locator('#ct-duas').isVisible(),'e fecha de novo');

  /* ⚠️ o mesmo mecanismo tinha um buraco: os explicadores dos PAINÉIS do
     brechó nunca eram marcados, porque `marcarVisto` só era chamado por
     `show()`, com o nome da tela. Ficavam abertos para sempre. */
  await p.evaluate(()=>painelBrecho('inv')); await p.waitForTimeout(350);
  await p.evaluate(()=>painelBrecho('alugar')); await p.waitForTimeout(350);
  const vistos=await p.evaluate(()=>{
    try{ return JSON.parse(localStorage.getItem('cdf-visto')||'[]') }catch(e){ return [] }});
  t(vistos.includes('inventario')&&vistos.includes('alugar'),
    'e os explicadores dos outros painéis também passaram a ser marcados: '+vistos.join(', '));

  /* ============ mobile ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>painelBrecho('vender')); await p.waitForTimeout(300);
  await p.locator('#bp-vender .explitog').click(); await p.waitForTimeout(350);
  t(await p.locator('#ct-duas').isVisible(),'no celular ele também abre');
  const col=await p.evaluate(()=>getComputedStyle(document.getElementById('ct-duas')).gridTemplateColumns);
  t(col.split(' ').length===2,
    'e continua em DUAS colunas a 390px — empilhar tiraria as moedas do mesmo campo de visão, que é o defeito que ele conserta');
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal: '+ov);

  await ctx.close(); await b.close();
  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  process.exit(bad.length||errs.length?1:0);
})();

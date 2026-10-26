/**
 * PEDÁGIO — a submoeda de brinde.
 *
 * Ideia do Victor: uma moeda que ele possa DAR, que não possa ser sacada e
 * que só sirva para plano e taxa da plataforma — não para equipamento.
 *
 * ⚠️ A REGRA "NÃO SERVE PARA EQUIPAMENTO" NÃO É PREFERÊNCIA DE PRODUTO — é
 * o que mantém a submoeda fora da régua do BACEN. No brechó, no aluguel e
 * no sinal o dinheiro é de OUTRO usuário; um crédito emitido pela
 * plataforma que pagasse aquilo seria a plataforma transferindo valor
 * entre pessoas. Pagando só a receita da PRÓPRIA plataforma, o pedágio
 * nunca vira direito sobre dinheiro: é desconto pré-concedido.
 *
 * O que esta suíte protege:
 *   - pedágio NUNCA aparece no brechó e NUNCA no saque;
 *   - em "fechar escala" ele cobre a TAXA e nem um centavo do sinal, mesmo
 *     com saldo de sobra — é o caso que sustenta a regra inteira;
 *   - ele abate ANTES do take: o que expira sai primeiro, senão o brinde
 *     apodrece na carteira;
 *   - o vencimento é POR LOTE, e o lote que vence antes é gasto antes;
 *   - a carteira mostra DUAS linhas, nunca somadas — total único faria a
 *     pessoa achar que dá para sacar;
 *   - e a tela diz POR QUE não serve para equipamento;
 *   - ele aparece NA ESTRADA, ao lado do próximo posto. Victor, batizando:
 *     "pode ser pedágio, é o que paga pra avançar na estrada" — se é isso
 *     que ele é, é lá que ele tem de estar, não só na carteira.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const n=x=>+String(x).replace(/[^\d]/g,'');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1300},deviceScaleFactor:2});
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
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(600);

  /* ============ nasce vazio, e some quando está vazio ============
     Ninguém começa com brinde. A caixa só existe depois de a plataforma
     conceder — estado vazio de moeda promocional é ruído. */
  t(await p.evaluate(()=>pedagio())===0,'ninguém nasce com pedágio');
  await p.evaluate(()=>show('brecho')); await p.waitForTimeout(300);
  await p.locator('[data-bp="vender"]').click(); await p.waitForTimeout(400);
  t((await p.locator('#ct-pedagio').textContent()).trim()==='',
    'e sem brinde a caixa nem aparece na carteira');

  /* ============ o brinde chega em LOTES ============ */
  for(let i=0;i<3;i++){ await p.locator('#ct-brinde').click(); await p.waitForTimeout(350); }
  const lotes=await p.evaluate(()=>LOTES_PED.map(l=>({v:l.valor,ate:l.ate,mot:l.motivo})));
  t(lotes.length===3,'a plataforma concede em lotes ('+lotes.length+')');
  t(lotes.some(l=>l.ate)&&lotes.some(l=>!l.ate),
    'e o VENCIMENTO É POR LOTE: um com prazo e um sem, na mesma conta');
  t(lotes.every(l=>l.mot),'cada lote diz de onde veio — brinde sem motivo é brinde sem campanha');
  const total=await p.evaluate(()=>pedagio());
  t(total===lotes.reduce((s,l)=>s+l.v,0),'o saldo é a soma dos lotes vivos: '+total);

  /* ============ a carteira mostra DUAS linhas ============ */
  const cx=(await p.locator('#ct-pedagio').textContent()).replace(/\s+/g,' ');
  t(/P\$/.test(cx),'a carteira mostra o pedágio em símbolo próprio, não misturado no take');
  const take=await p.evaluate(()=>saldo());
  t(!(await p.locator('#ct-fatos').textContent()).includes(String(total+take).replace(/\B(?=(\d{3})+(?!\d))/g,'.')),
    'e NUNCA soma os dois num total só — somar faria a pessoa achar que saca o brinde');
  t(/dinheiro é de outro freela/.test(cx),
    'a caixa diz POR QUE não serve para equipamento — é a regra que segura tudo');
  t(/não vira Pix/.test(cx),'e que não vira dinheiro');
  t(/vence em/.test(cx)||/sem prazo/.test(cx),'com o prazo de cada lote à vista');

  /* ============ O SAQUE NÃO ENXERGA PEDÁGIO ============ */
  await p.locator('#ct-sacar').click(); await p.waitForTimeout(450);
  t(n(await p.locator('#sq-valor').inputValue())===take,
    'o saque oferece só o take, nunca o pedágio junto ('+take+')');
  t(!(await p.locator('#sq-ped').isHidden()),'mas AVISA que o pedágio existe e não entra');
  t(/não vira dinheiro/.test(await p.locator('#sq-ped').textContent()),
    'dizendo o motivo, em vez de deixar a pessoa procurar');
  await p.evaluate(()=>document.querySelectorAll('.ovl').forEach(o=>o.hidden=true));

  /* ============ PLANO: cobre tudo, e sai do lote que vence antes ============ */
  await p.evaluate(()=>show('planos')); await p.waitForTimeout(400);
  await p.evaluate(()=>abrirPlanoFreela('estrada')); await p.waitForTimeout(500);
  t(await p.locator('#pfr-pgm [data-m="ped"]').count()===1,'no plano, o pedágio é oferecido');
  const proxAntes=await p.evaluate(()=>{const l=pedProximo(); return l?{id:l.id,resta:l.valor-l.usado}:null});
  await p.locator('#pfr-pgm [data-m="ped"]').click(); await p.waitForTimeout(350);
  const preco=await p.evaluate(()=>PLANOS_FREELA.estrada.preco);
  t(n(await p.locator('#pfr-tot').textContent())===preco,
    'e cobre o plano inteiro — plano é receita da plataforma');
  const takeAntes=await p.evaluate(()=>saldo());
  await p.locator('#pfr-ok').click(); await p.waitForTimeout(700);
  t(await p.evaluate(()=>pedagio())===total-preco,
    'pagou: o saldo de pedágio cai exatamente o preço');
  t(await p.evaluate(()=>saldo())===takeAntes,
    'e o TAKE não é tocado — o pedágio abate antes, senão o brinde apodrece');
  const gasto=await p.evaluate(id=>{const l=LOTES_PED.find(x=>x.id===id); return l?l.usado:0},proxAntes.id);
  t(gasto>0,'e saiu do lote que vence PRIMEIRO, não do eterno');
  t((await p.evaluate(()=>CARTEIRA.mov.filter(m=>m.tipo==='pedagio').map(m=>m.txt))).length===1,
    'o extrato registra que foi pago com pedágio');
  t(await p.evaluate(()=>CARTEIRA.mov.filter(m=>m.tipo==='pedagio').every(m=>m.valor===0)),
    'com valor ZERO em take — pedágio não é movimento de dinheiro na carteira');

  /* ============ BRECHÓ: nunca ============ */
  await p.evaluate(()=>{ show('brecho'); }); await p.waitForTimeout(400);
  const alvo=await p.evaluate(()=>{
    const a=ANUNCIOS.find(x=>x.dono!==EU.id&&!x.estadoVenda); return a?a.id:null; });
  if(alvo){
    await p.evaluate(id=>abrirAnuncio(id),alvo); await p.waitForTimeout(450);
    const bt=await p.locator('#an-comprar, [data-comprar]').first();
    if(await bt.count()){ await bt.click(); await p.waitForTimeout(600); }
  }
  t(await p.locator('#cp-pgm [data-m="ped"]').count()===0,
    'no BRECHÓ o pedágio nem é oferecido — ali o dinheiro é de outro freela');
  await p.evaluate(()=>document.querySelectorAll('.ovl').forEach(o=>o.hidden=true));

  /* ============ FECHAR ESCALA — o caso que sustenta a regra ============
     Com saldo de sobra, o pedágio ainda assim cobre SÓ a taxa. O sinal é o
     cachê de quem vai trabalhar: pagar cachê com brinde da plataforma seria
     a plataforma transferindo valor entre usuários com crédito próprio. */
  await p.evaluate(()=>{ MODO="contratante"; ASSINANTE=true; aplicarModo();
    darPedagio(5000,"teste — mais que o job inteiro",null); show("equipe"); });
  await p.waitForTimeout(500);
  for(let i=0;i<3;i++){ await p.locator('#e-add [data-f]').nth(i).click(); await p.waitForTimeout(200); }
  const sels=await p.locator('#e-vagas [data-sel]').count();
  for(let i=0;i<sels;i++){
    const op=await p.locator('#e-vagas [data-sel]').nth(i).locator('option').nth(1).getAttribute('value');
    if(op) await p.locator('#e-vagas [data-sel]').nth(i).selectOption(op);
    await p.waitForTimeout(150);
  }
  await p.locator('#e-fechar').click(); await p.waitForTimeout(650);
  const sinal=n(await p.locator('#fe-diarias').textContent());
  const taxa =n(await p.locator('#fe-taxa').textContent());
  t(sinal>0&&taxa>0,'a escala fecha com sinal ('+sinal+') e taxa ('+taxa+')');
  t(await p.evaluate(()=>pedagio())>sinal+taxa,'e há pedágio de sobra na conta para cobrir tudo');
  t(await p.locator('#fe-pgm [data-m="ped"]').count()===1,'o pedágio é oferecido');
  t(/vale aqui/.test(await p.locator('#fe-pgm [data-m="ped"]').textContent()),
    'dizendo QUANTO dele vale aqui — em vez de deixar a pessoa descobrir sozinha');
  await p.locator('#fe-pgm [data-m="ped"]').click(); await p.waitForTimeout(400);
  const restou=n(await p.locator('#fe-tot').textContent());
  t((sinal+taxa)-restou===taxa,
    '⟶ ele cobriu a TAXA e nada mais: '+((sinal+taxa)-restou)+' de '+taxa);
  t(restou===sinal,
    '⟶ e o SINAL continua saindo em dinheiro — é cachê de gente, não taxa nossa');

  /* ============ a lista do que ele paga é FECHADA ============ */
  const regra=await p.evaluate(()=>({paga:PED_PAGA,nao:Object.keys(PED_NAO)}));
  t(regra.paga.length===3&&regra.paga.every(x=>["plano","taxa","guilda"].includes(x)),
    'a lista do que o pedágio paga é fechada: '+regra.paga.join(', '));
  t(regra.nao.includes('equip')&&regra.nao.includes('sinal')&&regra.nao.includes('saque'),
    'e cada recusa tem um motivo escrito, para a tela poder explicar');

  /* ============ vencimento tira da conta ============ */
  const antesVenc=await p.evaluate(()=>pedagio());
  await p.evaluate(()=>{ LOTES_PED.push({id:9,valor:70,usado:0,motivo:"lote vencido",
    em:key(diasApos(-40)),ate:key(diasApos(-1))}) });
  t(await p.evaluate(()=>pedagio())===antesVenc,'lote vencido não conta no saldo');
  t(await p.evaluate(()=>pedVencido())===70,'mas a plataforma sabe quanto venceu, para poder dizer');

  /* ============ ELE APARECE NA ESTRADA ============
     A tela de planos desenha a estrada com o carro e os postos. Se o
     pedágio é o que paga para avançar nela, a conta tem de estar ali. */
  await p.evaluate(()=>{ MODO="freela"; PLANO_FREELA="base"; ASSINANTE=false; PREMIUM_PROD=false;
    aplicarModo(); LOTES_PED=[]; darPedagio(10,"teste",null); show('planos'); });
  await p.waitForTimeout(500);
  t(await p.locator('.viapdg').count()===1,'o pedágio aparece na estrada, junto do próximo posto');
  const naVia=(await p.locator('.viapdg').textContent()).replace(/\s+/g,' ');
  const proxPreco=await p.evaluate(()=>VIA_PRECO[nivel()+1]);
  t(/faltam/.test(naVia),'dizendo quanto falta quando não cobre: '+naVia);
  await p.evaluate(v2=>{ darPedagio(v2,"cobre tudo",null); drawPlanos() },proxPreco);
  await p.waitForTimeout(400);
  t(/posto inteiro/.test(await p.locator('.viapdg').textContent()),
    'e que dá para o posto inteiro quando cobre');
  t(await p.evaluate(()=>{ LOTES_PED=[]; drawPlanos(); return !document.querySelector('.viapdg') }),
    'sem pedágio, a linha não existe — não se anuncia saldo zero');

  /* ============ A MOEDA E O CHIP DO TOPO (20/ago · 8) ============
     Victor: "na aba do take fala sobre o pedágio também. E cria a moeda em
     3D do pedágio, assim como tem a do take. Colocar o quanto tem em
     pedágio na aba de cima assim como tem o do take." */
  await p.evaluate(()=>{ LOTES_PED=[]; pintarSaldoTopo() }); await p.waitForTimeout(200);
  t(await p.locator('#pedagio-top').isHidden(),
    '⟶ sem pedágio o chip do topo NEM EXISTE — saldo zero de moeda promocional é cutucão para comprar');
  const topo=await p.evaluate(()=>{
    darPedagio(120,"campanha",30); pintarSaldoTopo();
    return {vis:!document.getElementById('pedagio-top').hidden,
      ped:document.getElementById('pedagio-top-v').textContent,
      take:document.getElementById('saldo-top-v').textContent,
      titulo:document.getElementById('pedagio-top').title};
  });
  t(topo.vis&&/P\$ 120/.test(topo.ped),'com pedágio ele aparece: '+topo.ped);
  t(/T\$/.test(topo.take)&&!/120/.test(topo.take),
    '⟶⟶ E NUNCA SOMADO AO TAKE ('+topo.take+' ao lado de '+topo.ped+'). Total único faria '+
    'a pessoa achar que dá para sacar o brinde — a mesma regra das duas linhas da carteira');
  t(/não vira dinheiro/.test(topo.titulo)&&/vence em/.test(topo.titulo),
    'e o chip diz o que ele é e quando vence, sem precisar abrir a carteira');

  await p.evaluate(()=>abrirAjuda('moeda')); await p.waitForTimeout(900);
  const mo=await p.evaluate(()=>{
    const c1=document.getElementById('cv-moeda'), c2=document.getElementById('cv-pedagio');
    const px=cv=>{const d=cv.getContext('2d').getImageData(cv.width/2,cv.height/2,1,1).data;
      return d[0]+','+d[1]+','+d[2]};
    const txt=document.getElementById('aj-corpo').textContent;
    return {duas:!!c1&&!!c2, cor1:px(c1), cor2:px(c2),
      linhas:[...document.querySelectorAll('.pedcmp tbody tr')].length,
      saque:[...document.querySelectorAll('.pedcmp tbody tr')]
        .find(r=>/Sacar/.test(r.textContent)).children[2].className,
      explica:/submoeda de brinde/.test(txt),
      regra:/nunca vira direito sobre dinheiro|desconto dado antes/.test(txt),
      antes:/pedágio, sempre — e antes do take/i.test(txt)};
  });
  t(mo.duas,'a página da moeda mostra as DUAS moedas em 3D');
  t(mo.cor1!==mo.cor2,
    '⟶ e em metais diferentes ('+mo.cor1+' contra '+mo.cor2+') — duas moedas do mesmo metal '+
    'seriam a mesma moeda com outro número');
  t(mo.linhas===6&&mo.saque==='nao',
    'com a tabela do que cada uma paga, e "sacar por Pix" marcado como NÃO no pedágio');
  t(mo.explica&&mo.regra,'a página explica o que ele é E por que não pode ser sacado');
  t(mo.antes,'e diz que ele sai antes do take — senão o brinde apodrece enquanto o dinheiro sai');

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  await p.evaluate(()=>document.querySelectorAll('.ovl').forEach(o=>o.hidden=true));
  await p.evaluate(()=>{ MODO="freela"; aplicarModo(); show('brecho'); }); await p.waitForTimeout(400);
  await p.locator('[data-bp="vender"]').click(); await p.waitForTimeout(450);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

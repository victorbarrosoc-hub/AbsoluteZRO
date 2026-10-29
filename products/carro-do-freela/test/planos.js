/**
 * PLANOS — a aba onde se compra, dentro do mapa de telas.
 *
 * Pedido do Victor: uma aba de planos para os dois lados, e ela mora
 * dentro do menu.
 *
 * O que esta suíte protege:
 *   - a entrada existe no mapa, nos dois lados;
 *   - os três planos de cada lado, com o atual marcado;
 *   - dá para ver o outro lado sem trocar de conta;
 *   - assinar muda o estado de verdade, e cancelar volta;
 *   - a REGRA DURA continua escrita: nenhum plano compra posição na busca
 *     nem selo — se um dia sumir desta tela, sumiu do produto;
 *   - um acento por tela: "seu plano" é neutro, o ciano é do recomendado;
 *   - Montar equipe, para quem é livre, mostra o COMPARATIVO no centro:
 *     três colunas, diferença linha a linha, e a tabela rola no próprio
 *     trilho no celular — nunca a página.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await require('./_navegador.js').abrir();
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
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
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(500);

  /* ============ o comparativo no centro de Montar equipe ============ */
  await p.evaluate(()=>show('equipe')); await p.waitForTimeout(550);
  const tr=await p.evaluate(()=>{
    const t=document.querySelector('#e-trancado .trancado');
    const r=t.getBoundingClientRect();
    /* ⚠️ desde 04/out o desktop tem BARRA LATERAL: "o centro da página" é o
       centro da área de conteúdo, que começa onde a lateral termina. A
       tolerância continua a mesma; só a régua passou a partir do lugar certo. */
    const lat=document.body.classList.contains('com-lateral')
      ?document.querySelector('.top .tabs').getBoundingClientRect().right:0;
    return {esq:Math.round(r.left-lat),dir:Math.round(innerWidth-r.right),
      colunas:[...document.querySelectorAll('.cmp .ccab b')].map(x=>x.textContent),
      aqui:document.querySelectorAll('.cmp .caqui').length,
      botoes:[...document.querySelectorAll('.cmp [data-virar]')].map(x=>x.dataset.virar).join(','),
      taxa:[...document.querySelectorAll('.cmp .cnum')].map(x=>x.textContent).join('/')};
  });
  t(Math.abs(tr.esq-tr.dir)<8,'para quem é livre, os planos ficam no CENTRO da página ('+tr.esq+'/'+tr.dir+')');
  t(tr.colunas.join(',')==='Carona,Volante,Frota','os três lado a lado: '+tr.colunas.join(' · '));
  t(tr.aqui===1,'o Carona diz "você está aqui" — é onde a pessoa está');
  t(tr.botoes==='volante,frota','e só os pagos têm botão de assinar');
  t(tr.taxa==='6%/6%/4%','a linha da taxa compara os três: '+tr.taxa);
  await p.locator('.cmp [data-virar="volante"]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl10').isVisible(),'assinar pelo comparativo abre a mesma assinatura');
  await p.locator('#as-x').click(); await p.waitForTimeout(300);

  /* ============ o plano do freela TRANCA de verdade ============
     Ele existia como estado e não abria porta nenhuma: cobrava e não
     entregava. Agora a Estrada abre o orçamento e o Premium abre o
     relatório do ano. */
  await p.evaluate(()=>{ MODO="freela"; aplicarModo(); PLANO_FREELA="base"; show("orcar"); });
  await p.waitForTimeout(450);
  t(await p.locator('#oc-trancado .trancado').count()===1,'freela no grátis: orçamento vem trancado');
  t(await p.locator('#oc-corpo').isHidden(),'e o formulário nem aparece');
  t(/não está à venda em plano nenhum/.test(await p.locator('#oc-trancado').textContent()),
    'a vitrine repete o limite: plano não compra posição');
  await p.locator('[data-vestrada]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl27').isVisible()&&/49/.test(await p.locator('#pfr-valor').textContent()),
    'e o botão leva à Estrada, com o preço dela');
  await p.locator('#pfr-ok').click(); await p.waitForTimeout(500);
  /* ANTES de fechar o modal: era aqui que quebrava. O plano era cobrado,
     o estado mudava e a tela atrás continuava trancada — parecia que a
     assinatura não tinha pegado. Quem assina de dentro da tranca precisa
     ver a tranca abrir. */
  t(await p.locator('#oc-corpo').isVisible(),'assinou de dentro da tranca: a tela abre na hora, sem sair dela');
  await p.locator('#pfr-f').click(); await p.waitForTimeout(300);
  await p.evaluate(()=>show("orcar")); await p.waitForTimeout(450);
  t(await p.locator('#oc-corpo').isVisible(),'assinando a Estrada, o orçamento abre');
  await p.evaluate(()=>{ PLANO_FREELA="base"; show("orcar"); }); await p.waitForTimeout(400);
  t(await p.locator('#oc-trancado .trancado').count()===1,'e cancelando ele tranca de novo');

  /* o Premium abre o relatório do ano */
  await p.evaluate(()=>show("meu")); await p.waitForTimeout(450);
  t(/Está no/.test(await p.locator('#pf-rel').textContent()),'no grátis o relatório é vitrine');
  await p.evaluate(()=>{ PLANO_FREELA="premium"; show("meu"); }); await p.waitForTimeout(450);
  t(/Entrou no ano/.test(await p.locator('#pf-rel').textContent()),'no Premium ele existe');
  t(await p.locator('#pf-csv').count()===1,'com CSV para o contador');
  await p.evaluate(()=>{ PLANO_FREELA="base"; MODO="freela"; aplicarModo(); });

  /* ============ e do lado de quem contrata também ============
     A brecha que o Victor achou: se o Carona orçasse, bastava trocar de
     chapéu para furar a Estrada. Orçar é dos planos pagos dos dois lados. */
  await p.evaluate(()=>{ MODO="contratante"; ASSINANTE=false; aplicarModo(); show("orcar"); });
  await p.waitForTimeout(450);
  t(await p.locator('#oc-trancado .trancado').count()===1,'contratante no Carona: orçamento trancado também');
  await p.evaluate(()=>{ ASSINANTE=true; aplicarModo(); drawOrcar(); }); await p.waitForTimeout(400);
  t(await p.locator('#oc-corpo').isVisible(),'e o primeiro plano pago já abre — não precisa da Frota');
  await p.evaluate(()=>{ MODO="freela"; ASSINANTE=false; PLANO_FREELA="base"; aplicarModo(); });

  /* ============ a escada dita na tela ============
     Quem olha o Volante de R$ 89 precisa saber que a Estrada de R$ 49 vem
     dentro. Sem isso a tela mostra dois preços e esconde que um contém o
     outro — e assinar os dois lados vira uma ideia razoável. */
  await p.evaluate(()=>show("planos")); await p.waitForTimeout(450);
  const escada=(await p.locator('#pn-escada').textContent()).replace(/\s+/g,' ');
  t(/escada/.test(escada),'a tela de planos diz que os planos são uma escada');
  t(/Freela · Carona → Premium → Estrada → Volante → Frota/.test(escada),'com os cinco degraus na ordem: '+escada.slice(60,120));
  t(/o degrau de cima já traz o de baixo/.test(escada),'e a regra que fecha a brecha, escrita');
  await p.evaluate(()=>{ pnLado="contratante"; drawPlanos(); }); await p.waitForTimeout(350);
  t(/Tudo da Estrada/.test(await p.locator('#pn-grade').textContent()),
    'e a lista do Volante abre dizendo que traz a Estrada dentro');
  await p.evaluate(()=>{ pnLado=null; drawPlanos(); });

  /* ============ a estrada, com o carro em cima ============
     Victor: "pode até colocar uma forma de gamificação pra subir de nível...
     uma linha de uma estrada e o carro chegando nos pontos (que são os
     planos)... buzina quando chega em cada ponto, e quando chega no final
     um som de conquista". Aqui a escada deixa de ser regra e vira mapa. */
  await p.evaluate(()=>{ PLANO_FREELA="base"; ASSINANTE=false; PREMIUM_PROD=false;
    MODO="freela"; aplicarModo(); show("planos"); }); await p.waitForTimeout(500);
  t(await p.locator('#pn-via .viamarco').count()===5,'a estrada tem os cinco pontos');
  t((await p.locator('#pn-via').textContent()).includes('Frota'),'com os planos como paradas');
  t(await p.locator('#pn-via').getAttribute('aria-hidden')==='true',
    'o desenho é aria-hidden — quem usa leitor de tela ouve a linha escrita, não "círculo círculo"');
  t(await p.locator('#pn-via .viachegada').count()===1,
    'a linha de chegada existe desde o começo — destino que só aparece quando você chega não é destino');
  const ondeEsta=async()=>await p.evaluate(()=>{
    const tr=document.querySelector('.viatrilho').getBoundingClientRect();
    const c=document.querySelector('#via-carro').getBoundingClientRect();
    const f=document.querySelector('#via-feito').getBoundingClientRect();
    return {carro:Math.round(((c.x+c.width/2)-tr.x)/tr.width*100),
            /* com a tela de Planos escondida todo rect é zero e a conta acima
               vira NaN — o style inline é o único que sobrevive */
            alvo:document.getElementById('via-carro').style.left,
            feito:Math.round(f.width/tr.width*100),
            aqui:(document.querySelector('#pn-via .viamarco.aqui')||{dataset:{}}).dataset.vm,
            andando:viaAndando};});
  let onde=await ondeEsta();
  t(onde.carro===0&&onde.aqui==='0','no grátis o carro está no começo da estrada');
  t(/Próximo degrau: Premium/.test(await p.locator('#pn-prox').textContent()),
    'e o cartão convida para o degrau seguinte, não para o mais caro');
  t(/Relatório do ano/.test(await p.locator('#pn-prox').textContent()),
    'dizendo o que ele ABRE de novo — não a lista inteira do plano');

  /* o salto direto: quem compra a Frota de uma vez não teleporta. O carro
     sai do início e passa por cada ponto, que é o pedido do Victor. */
  await p.evaluate(()=>{ ASSINANTE=true; PREMIUM_PROD=true; aplicarModo(); drawPlanos(); });
  await p.waitForTimeout(800);
  onde=await ondeEsta();
  t(onde.andando&&onde.carro>0&&onde.carro<100,'comprando o topo de uma vez, o carro PERCORRE a estrada ('+onde.carro+'%)');
  t(Math.abs(onde.carro-onde.feito)<=2,'e o asfalto pintado anda junto com ele, sem sobrar cinza atrás');
  await p.waitForTimeout(2200);
  onde=await ondeEsta();
  t(!onde.andando&&onde.carro===100&&onde.aqui==='4','e estaciona no fim, na Frota');
  t(await p.locator('#pn-via.chegou').count()===1,'a chegada acende a bandeira quadriculada');
  t(/Fim da estrada/.test(await p.locator('#pn-prox').textContent()),'e o cartão para de vender: não há degrau acima');
  /* "Subir para o Estrada" — nome de plano tem gênero e o botão concorda */
  await p.evaluate(()=>{ ASSINANTE=false; PREMIUM_PROD=false; PLANO_FREELA="premium"; aplicarModo(); drawPlanos(); });
  await p.waitForTimeout(700);
  t(/Subir para a Estrada/.test(await p.locator('#pn-prox').textContent()),'o botão concorda em gênero com o nome do plano');

  /* descer não é conquista */
  await p.evaluate(()=>{ ASSINANTE=false; PREMIUM_PROD=false; PLANO_FREELA="base"; aplicarModo(); drawPlanos(); });
  await p.waitForTimeout(900);
  onde=await ondeEsta();
  /* volta em UM movimento e em silêncio: sem parar em cada ponto e sem
     buzina. Buzinar numa perda seria o produto comemorando o errado. */
  t(!onde.andando&&onde.carro===0,'cancelar traz o carro de volta ao começo, em silêncio e sem parar em cada ponto');
  t(await p.locator('#pn-via.chegou').count()===0,'e a bandeira apaga');
  t(await p.evaluate(()=>typeof SONS.conquista==='function'),'o som de chegada existe no banco de sons');

  /* ============ a viagem espera quem paga ============
     Victor: "quando faz o pagamento do plano, eu não consigo ver a animação
     do carrinho pq aparece uma mensagem na tela e a animação acontece
     enquanto tá a mensagem". O recibo cobre a tela inteira e o carro corria
     atrás dele. Agora a estrada só anda com alguém olhando. */
  await p.evaluate(()=>{ MODO="freela"; PLANO_FREELA="base"; aplicarModo(); show("planos"); });
  await p.waitForTimeout(450);
  await p.locator('#pn-subir').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl27').isVisible(),'assinar pelo cartão do próximo degrau abre o pagamento');
  await p.locator('#pfr-ok').click(); await p.waitForTimeout(1400);
  onde=await ondeEsta();
  t(await p.locator('#pfr-ok2').isVisible(),'e o recibo cobre a tela');
  t(onde.carro===0&&!onde.andando,'o carro NÃO anda por trás do recibo — ninguém veria');
  await p.locator('#pfr-f').click(); await p.waitForTimeout(300);
  onde=await ondeEsta();
  t(onde.andando||onde.carro>0,'"Voltar aos planos" é que dá a partida');
  await p.waitForTimeout(900);
  onde=await ondeEsta();
  t(!onde.andando&&onde.carro===25&&onde.aqui==='1','e o carro para no degrau comprado, com a pessoa olhando');

  /* e se ela assinar de outra tela, a viagem fica guardada até ela chegar
     em Planos — nunca acontece às escondidas */
  await p.evaluate(()=>{ PLANO_FREELA="base"; drawPlanos(); show("meu"); }); await p.waitForTimeout(400);
  await p.evaluate(()=>{ PLANO_FREELA="estrada"; drawPlanos(); }); await p.waitForTimeout(700);
  onde=await ondeEsta();
  t(onde.alvo==='0%','assinando de outra tela, o carro fica parado esperando: '+onde.alvo);
  await p.evaluate(()=>show("planos")); await p.waitForTimeout(1500);
  onde=await ondeEsta();
  t(!onde.andando&&onde.carro===50,'e faz a viagem quando ela abre Planos');
  await p.evaluate(()=>{ PLANO_FREELA="base"; drawPlanos(); }); await p.waitForTimeout(800);

  /* ============ mora dentro do menu ============ */
  await p.locator('#menu-bt').click(); await p.waitForTimeout(420);
  /* desde 17/out · 10 Planos é a linha de cima do menu, com o tipo do plano */
  t(await p.locator('#g-plano[data-ir="planos"]').isVisible(),'Planos está no menu, lá em cima');
  await p.locator('#g-plano').click(); await p.waitForTimeout(550);
  t(await p.evaluate(()=>S.tab)==='planos','e leva para a tela');

  /* ============ os três planos do lado ============ */
  t(await p.locator('#pn-grade .plano').count()===3,'três planos do lado do freela');
  const nomes=await p.locator('#pn-grade h3').allTextContents();
  t(/Freela/.test(nomes[0])&&/Premium/.test(nomes[1])&&/Estrada/.test(nomes[2]),
    'na ordem de preço: '+nomes.map(x=>x.split(' ')[0]).join(' · '));
  t(/Seu plano/.test(nomes[0]),'o atual vem marcado');
  t(await p.locator('#pn-grade .selo-eu').count()===1,'uma marcação de plano atual, só');
  t(await p.locator('#pn-grade .selo-pop').count()===1,'e um recomendado, só');

  /* um acento por tela: "seu plano" não pode ser ciano */
  const neutro=await p.evaluate(()=>{
    const el=document.querySelector('#pn-grade .selo-eu');
    const d=document.createElement('div');
    d.style.color=getComputedStyle(document.documentElement).getPropertyValue('--ciano').trim();
    document.body.appendChild(d); const ciano=getComputedStyle(d).color; d.remove();
    return getComputedStyle(el).color!==ciano;
  });
  t(neutro,'"seu plano" é neutro — o acento fica com o recomendado');

  /* preço não repete a razão */
  const primeiro=await p.locator('#pn-grade .plano').first().textContent();
  t((primeiro.match(/para sempre/g)||[]).length===1,'o plano grátis não repete "para sempre"');

  /* ============ o outro lado, sem trocar de conta ============ */
  await p.locator('[data-pnlado="contratante"]').click(); await p.waitForTimeout(400);
  const nomes2=await p.locator('#pn-grade h3').allTextContents();
  t(/Carona/.test(nomes2[0])&&/Volante/.test(nomes2[1])&&/Frota/.test(nomes2[2]),
    'dá para ver os planos de quem contrata: '+nomes2.map(x=>x.split(' ')[0]).join(' · '));
  t(await p.evaluate(()=>MODO)==='freela','sem trocar a conta só de olhar');
  await p.locator('[data-pnlado="freela"]').click(); await p.waitForTimeout(350);

  /* ============ assinar de verdade ============ */
  await p.locator('[data-pnass="premium"]').click(); await p.waitForTimeout(500);
  t(await p.locator('#ovl27').isVisible(),'assinar abre o pagamento');
  t(/19/.test(await p.locator('#pfr-valor').textContent()),'com o preço do plano');
  t(/não está à venda/.test(await p.locator('#pfr-pq').textContent()),
    'e o modal repete que posição não se compra');
  await p.locator('#pfr-ok').click(); await p.waitForTimeout(600);
  t(await p.evaluate(()=>PLANO_FREELA)==='premium','assinar muda o plano de verdade');
  t(await p.locator('#pfr-ok2').isVisible(),'com a confirmação do que foi cobrado');
  await p.locator('#pfr-f').click(); await p.waitForTimeout(400);
  const nomes3=await p.locator('#pn-grade h3').allTextContents();
  t(/Seu plano/.test(nomes3[1]),'e a tela já mostra o novo plano como seu');

  /* cancelar volta para o grátis, sem apagar nada */
  await p.locator('[data-pncanc]').first().click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>PLANO_FREELA)==='base','cancelar volta para o plano grátis');
  t(await p.evaluate(()=>EU.jobs>0||EU.nome.length>0),'e o perfil continua inteiro');

  /* ============ contratante: usa a assinatura que já existia ============ */
  await p.evaluate(()=>{ MODO="contratante"; aplicarModo(); show("planos"); });
  await p.waitForTimeout(500);
  await p.locator('[data-pnass="volante"]').click(); await p.waitForTimeout(500);
  t(await p.locator('#ovl10').isVisible(),'do lado de quem contrata abre a assinatura que já existia');
  await p.locator('#as-ok').click(); await p.waitForTimeout(700);
  t(await p.evaluate(()=>ASSINANTE)===true,'e assinar liga o Volante');

  /* ============ a regra dura está escrita ============ */
  await p.evaluate(()=>show("planos")); await p.waitForTimeout(400);
  const limite=await p.locator('#v-planos .limite').textContent();
  t(/Posição na busca/.test(limite),'a tela diz que posição na busca não está à venda');
  t(/verificado é conquistado, nunca vendido/.test(limite),'nem o selo de verificado');

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

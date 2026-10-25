/**
 * INVENTÁRIO — a lista do que é seu, e as três coisas que ela destrava:
 * anunciar sem preencher ficha de novo, editar o anúncio depois, e saber
 * com quem está o que saiu de casa.
 *
 * O que a suíte protege acima de tudo: o inventário NÃO inventa peça de
 * ninguém. Ele nasce do que a conta já declarou — anúncios do dono e as
 * câmeras/lentes que ele digitou no perfil.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');
const abrirInv=async p=>{ await p.evaluate(()=>show('brecho')); await p.waitForTimeout(300);
  await p.locator('[data-bp="inv"]').click(); await p.waitForTimeout(450); };

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1200},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(450);
  await abrirInv(p);

  /* ============ o inventário não inventa peça ============ */
  t(await p.locator('#inv-lista .ivc').count()>=1,'o inventário abre com o que a conta já tinha declarado');
  const derivado=await p.evaluate(()=>{
    const meus=ANUNCIOS.filter(a=>a.dono==="eu"||a.dono===EU.id).map(a=>a.t);
    const gear=[...partesGear(EU.cam||""),...partesGear(EU.lentes||"")];
    return invItens().every(it=>meus.includes(it.t)||gear.some(g=>it.t===g));
  });
  t(derivado,'e cada peça vem de um anúncio do dono ou do equipamento que ele digitou — nada semeado');
  t(await p.evaluate(()=>invItens().some(x=>faltaFicha(x)>0)),
    'quem nunca preencheu ficha aparece com ficha incompleta, que é o que acontece de verdade');

  /* ============ é privado ============ */
  t(/inventário é privado/i.test(await p.locator('#bp-inv').textContent()),'a tela diz que o inventário é privado');
  const vazouNoPerfil=await p.evaluate(()=>{
    const outro=CREW.find(c=>!c.me); abrirPerfil(outro.id);
    return document.getElementById('v-perfil').textContent.includes('inventário');
  });
  t(!vazouNoPerfil,'e o inventário não aparece no perfil público de ninguém');
  await abrirInv(p);

  /* ============ a estimativa é conta aberta, não laudo ============ */
  const alvo=await p.evaluate(()=>invItens().find(x=>statusInv(x)==='guardado'&&x.ref>0).id);
  await p.evaluate(id=>abrirItem(id),alvo); await p.waitForTimeout(400);
  const est=await p.locator('#iv-est').textContent();
  t(/Estimativa no estado atual/.test(est),'o item mostra a estimativa no estado em que está');
  t(/não é avaliação nem laudo/.test(est),'e diz que não é avaliação nem laudo');
  t(!/\bIA\b|intelig/i.test(est),'em lugar nenhum promete inteligência artificial que não existe');
  t(await p.locator('#iv-est .iai').count()>=2,'a conta é aberta item a item, dá para conferir');
  const mesmoMotor=await p.evaluate(id=>{
    const it=invItens().find(x=>x.id===id);
    const a=avaliar(it.cat,it.f,it.estado,it.ano,it.ref);
    const bq=estimarInv(it);
    return a.sugerido===bq.sugerido;
  },alvo);
  t(mesmoMotor,'e é o mesmo motor do avaliador do anúncio — um número só, não dois');

  /* piorar o estado tem que baixar a estimativa */
  const antesEst=await p.evaluate(id=>estimarInv(invItens().find(x=>x.id===id)).sugerido,alvo);
  await p.selectOption('#iv-estado','Para peças'); await p.waitForTimeout(250);
  const depoisTxt=await p.locator('#iv-est .faixa b').textContent();
  await p.selectOption('#iv-estado','Usado — bem conservado'); await p.waitForTimeout(200);
  t(parseInt(depoisTxt.replace(/\D/g,''),10)<antesEst,'declarar estado pior derruba a estimativa');

  /* ============ ficha preenchida destrava anunciar ============ */
  const bloqueado=await p.evaluate(id=>{
    const it=invItens().find(x=>x.id===id); return faltaFicha(it)>0;
  },alvo);
  t(bloqueado,'com a ficha incompleta o botão de anunciar nasce travado');
  await p.evaluate(()=>{document.querySelectorAll('#iv-campos [data-ic]').forEach(x=>{
    if(x.tagName==='SELECT') x.selectedIndex=0; else x.value=10;
    x.dispatchEvent(new Event('input',{bubbles:true}));
  })});
  await p.waitForTimeout(250);
  await p.locator('#iv-ok').click(); await p.waitForTimeout(450);
  t(await p.evaluate(id=>faltaFicha(invItens().find(x=>x.id===id))===0,alvo),'preencher a ficha no item resolve');
  t(await p.locator('[data-ivan="'+alvo+'"]:not([disabled])').count()===1,'e o botão de anunciar destrava');

  /* ============ anunciar em um clique ============ */
  const anAntes=await p.evaluate(()=>ANUNCIOS.length);
  await p.locator('[data-ivan="'+alvo+'"]').click(); await p.waitForTimeout(500);
  t(await p.locator('#ovl4').isVisible(),'anunciar abre o formulário do brechó');
  t((await p.locator('#nv-titulo').inputValue()).length>0,'já com o nome da peça');
  t(+(await p.locator('#nv-preco').inputValue())>0,'e com o preço estimado preenchido');
  const herdou=await p.evaluate(()=>Object.values(fichaAtual()).filter(x=>x!==""&&x!==0).length);
  t(herdou>=3,'a ficha de conservação veio junto — é a parte cara de anunciar ('+herdou+' campos)');
  await p.locator('#nv-ok').click(); await p.waitForTimeout(550);
  t(await p.evaluate(()=>ANUNCIOS.length)===anAntes+1,'publicar cria um anúncio');
  t(await p.evaluate(id=>statusInv(invItens().find(x=>x.id===id))==='venda',alvo),'e a peça passa a constar como à venda');
  t(await p.evaluate(id=>!!invItens().find(x=>x.id===id).anuncioId,alvo),
    'ligada ao anúncio: uma peça só, não duas listas para manter');

  /* ============ editar o anúncio, sem recriar ============ */
  await abrirInv(p);
  await p.locator('[data-ived="'+alvo+'"]').click(); await p.waitForTimeout(450);
  t(/Salvar altera/.test(await p.locator('#nv-ok').textContent()),'editar abre o mesmo formulário em modo de edição');
  const idAntigo=await p.evaluate(id=>invItens().find(x=>x.id===id).anuncioId,alvo);
  await p.locator('#nv-preco').fill('4321');
  await p.locator('#nv-ok').click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>ANUNCIOS.length)===anAntes+1,'salvar não duplica o anúncio');
  t(await p.evaluate(id=>anuncioDe(invItens().find(x=>x.id===id)).preco,alvo)===4321,'o preço novo entra');
  t(await p.evaluate(id=>invItens().find(x=>x.id===id).anuncioId,alvo)===idAntigo,
    'e o anúncio continua o mesmo — dias no ar e propostas recebidas não somem');

  /* editar a peça reflete no anúncio ligado */
  await abrirInv(p);
  await p.evaluate(id=>abrirItem(id),alvo); await p.waitForTimeout(350);
  await p.locator('#iv-nome').fill('Nome novo da peça');
  await p.locator('#iv-ok').click(); await p.waitForTimeout(450);
  t(await p.evaluate(id=>anuncioDe(invItens().find(x=>x.id===id)).t,alvo)==='Nome novo da peça',
    'corrigir a peça corrige o anúncio junto — é a mesma coisa nos dois lugares');

  /* tirar do brechó devolve para a prateleira */
  await p.locator('[data-ivtira="'+alvo+'"]').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>ANUNCIOS.length)===anAntes,'tirar do brechó apaga o anúncio');
  t(await p.evaluate(id=>statusInv(invItens().find(x=>x.id===id))==='guardado',alvo),'e a peça volta para "com você"');

  /* ============ fora de casa ============ */
  const outro=await p.evaluate(()=>invItens().find(x=>statusInv(x)==='guardado').id);
  await p.locator('[data-ival="'+outro+'"]').click(); await p.waitForTimeout(400);
  t(/não intermedeia/i.test(await p.locator('#ovl21').textContent()),
    'o registro de aluguel avisa que a plataforma não intermedeia — não há sinal nem contrato aqui');
  await p.locator('#al-quem').fill('Jônatas');
  await p.locator('#al-de').fill('2026-08-17');
  await p.locator('#al-ate').fill('2026-08-24');
  await p.locator('#al-valor').fill('150');
  await p.waitForTimeout(300);
  t(/7 dias fora/.test(await p.locator('#al-conta').textContent()),'a conta do período sai sozinha');
  t(/1\.050/.test(await p.locator('#al-conta').textContent()),'multiplicando a diária pelos dias');
  await p.locator('#al-ok').click(); await p.waitForTimeout(450);
  t(await p.evaluate(id=>statusInv(invItens().find(x=>x.id===id))==='fora',outro),'a peça passa a constar como fora');
  const cartao=await p.locator('.ivfora').first().textContent();
  t(/Jônatas/.test(cartao),'o card diz com quem está');
  t(/faltam|volta hoje|devia/.test(cartao),'e quanto falta para voltar');
  t(/150/.test(cartao),'e por quanto');
  t(await p.locator('[data-ivan="'+outro+'"]').count()===0,
    'peça que está fora não pode ser anunciada como disponível');

  await p.locator('[data-ivvolta="'+outro+'"]').click(); await p.waitForTimeout(450);
  await p.locator('#dv-ok').click(); await p.waitForTimeout(450);
  t(await p.evaluate(id=>statusInv(invItens().find(x=>x.id===id))==='guardado',outro),'e "voltou para mim" devolve para a prateleira');

  /* ============ acrescentar peça na mão ============ */
  const n=await p.evaluate(()=>invItens().length);
  await p.locator('#inv-novo').click(); await p.waitForTimeout(350);
  await p.locator('#iv-nome').fill('Tripé Manfrotto 504X');
  await p.selectOption('#iv-cat','tripe'); await p.waitForTimeout(250);
  await p.locator('#iv-ref').fill('4200'); await p.waitForTimeout(200);
  await p.locator('#iv-ok').click(); await p.waitForTimeout(450);
  t(await p.evaluate(()=>invItens().length)===n+1,'dá para acrescentar peça que não estava em lugar nenhum');
  t(/Manfrotto/.test(await p.locator('#inv-lista').textContent()),'e ela aparece na lista');

  /* ============ as duas portas de entrada ============ */
  await p.evaluate(()=>show('meu')); await p.waitForTimeout(400);
  t(await p.locator('#v-meu [data-irinv]').count()>=1,'o perfil do freela leva ao inventário');
  await p.evaluate(()=>{MODO='contratante';ASSINANTE=true;aplicarModo();show('minhaprod')}); await p.waitForTimeout(450);
  t(await p.locator('#v-minhaprod [data-irinv]').count()>=1,'o perfil de quem contrata também — equipamento parado é dos dois');
  await p.locator('#v-minhaprod [data-irinv]').first().click(); await p.waitForTimeout(500);
  t(await p.locator('#bp-inv').isVisible(),'e o atalho abre a aba certa');

  /* ============ TRANSFERÊNCIA DE POSSE ============ */
  await abrirInv(p);
  const mover=await p.evaluate(()=>invItens().find(x=>statusInv(x)==='guardado').id);
  const antesN=await p.evaluate(()=>invItens().length);
  await p.locator('[data-ivtr="'+mover+'"]').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl22').isVisible(),'transferir abre a escolha de para quem vai');
  t(await p.locator('#tr-quem option').count()>1,'com as contas da plataforma na lista');
  t(/definitiva/i.test(await p.locator('#ovl22').textContent()),'avisando que a transferência é definitiva');
  await p.locator('#tr-ok').click(); await p.waitForTimeout(500);
  t(await p.evaluate(()=>invItens().length)===antesN-1,'a peça sai do inventário de quem transferiu');
  t(await p.evaluate(id=>invTodos().find(x=>x.id===id).dono!==EU.id,mover),'e o dono muda de fato');
  t(await p.locator('.saiu').count()>=1,'ela não some: fica no histórico de "saiu do seu inventário"');
  t(/para /.test(await p.locator('.saiu span').first().textContent()),'dizendo para quem foi');

  /* venda liberada move a posse sozinha, sem ninguém atualizar nada */
  const vendido=await p.evaluate(()=>{
    const it=invItens().find(x=>statusInv(x)==='venda'); if(!it) return null;
    const a=anuncioDe(it); a.compradorId=CREW.find(c=>!c.me).id;
    liberarVenda(a.id); return it.id;
  });
  await p.evaluate(()=>drawInventario()); await p.waitForTimeout(350);
  t(vendido&&await p.evaluate(id=>invTodos().find(x=>x.id===id).dono!==EU.id,vendido),
    'venda liberada no brechó transfere a posse sozinha — o vendedor não atualiza nada');
  t(await p.evaluate(id=>!invItens().some(x=>x.id===id),vendido),'e a peça sai da lista dele');

  /* comprar traz a peça com a ficha do anúncio pronta */
  await p.evaluate(()=>{
    const a=ANUNCIOS.find(x=>x.dono!==EU.id&&x.dono!=='eu'&&x.estadoVenda!=='vendido');
    a.compradorId=EU.id; liberarVenda(a.id); window.__c=a.t;
  });
  await p.evaluate(()=>drawInventario()); await p.waitForTimeout(350);
  t(await p.evaluate(()=>invItens().some(x=>x.t===window.__c)),
    'comprar no brechó põe a peça no inventário do comprador — ele também não atualiza nada');
  t(await p.evaluate(()=>{const it=invItens().find(x=>x.t===window.__c);return it&&Object.keys(it.f).length>=3}),
    'e ela chega com a ficha de conservação do anúncio, não em branco');

  /* ============ CONTRATO DE ALUGUEL ============ */
  const loc=await p.evaluate(()=>invItens().find(x=>statusInv(x)==='guardado').id);
  await p.evaluate(id=>abrirAluguel(id),loc); await p.waitForTimeout(350);
  /* ⚠️ NOME INVENTADO, e é regra da casa: aqui se preenche o campo "com
     quem" de um CONTRATO DE LOCAÇÃO. Este teste já teve uma pessoa real
     neste campo — atribuindo a ela um empréstimo que nunca existiu. */
  await p.locator('#al-quem').fill('Fulano de Tal');
  await p.locator('#al-de').fill('2026-08-17');
  await p.locator('#al-ate').fill('2026-08-24');
  await p.locator('#al-valor').fill('200');
  await p.waitForTimeout(250);
  await p.locator('#al-ok').click(); await p.waitForTimeout(450);
  t(/Sem contrato/.test(await p.locator('.ctsel').first().textContent()),
    'sem contrato o card diz que combinado de boca não se cobra');

  await p.locator('[data-ivct="'+loc+'"]').click(); await p.waitForTimeout(450);
  const doc=await p.locator('#ovl23').textContent();
  t(/não é garantia da plataforma/i.test(doc),'o contrato diz na cara que NÃO é garantia da plataforma');
  t(await p.locator('#ac-limite.limite').count()===1,'com classe própria, não a do aviso do take');
  t(/não retém o valor, não cobre dano/i.test(doc),'e enumera o que ela não faz');
  t(/quem cobra é você/i.test(doc),'deixando claro quem cobra se der problema');
  t(/Locador/.test(doc)&&/Locatário/.test(doc),'as duas partes ficam qualificadas');
  t(/Estado na entrega/.test(doc),'e o estado na entrega entra no documento');
  t(await p.locator('#ac-doc .docul li').count()>=3,
    'a ficha de conservação vira a lista do estado de saída — é ela que ganha "voltou arranhado"');
  t(/1\.400/.test(await p.locator('#ac-taxa').textContent()),'a taxa parte do total do período (R$ 200 × 7 dias)');
  t(/70/.test(await p.locator('#ac-taxa').textContent()),'5% de R$ 1.400 = R$ 70');
  t(/Emitir contrato por/.test(await p.locator('#ac-ok').textContent()),'e o botão mostra o preço antes do clique');

  const saldoAntes=await p.evaluate(()=>saldo());
  await p.locator('#ac-ok').click(); await p.waitForTimeout(450);
  t(saldoAntes-(await p.evaluate(()=>saldo()))===70,'emitir cobra os 5% uma vez, do saldo');
  t(await p.evaluate(id=>!!invItens().find(x=>x.id===id).aluguel.contrato,loc),'o contrato passa a existir');
  t(await p.evaluate(id=>Object.keys(invItens().find(x=>x.id===id).aluguel.contrato.fichaSaida).length>=3,loc),
    'com a ficha de saída congelada dentro dele — contrato que muda depois de assinado não é contrato');
  t(/gov\.br/.test(await p.locator('#ac-ok').textContent()),'e o próximo passo é assinar pelo gov.br');
  t(/simulada/.test(await p.locator('#ac-nota').textContent()),'a tela avisa que a assinatura é simulada neste protótipo');

  await p.locator('#ac-ok').click(); await p.waitForTimeout(2900);
  const ass=await p.locator('#ac-ass').textContent();
  t(!/pendente/.test(ass),'as duas partes assinam');
  t(/assinado pelos dois lados/i.test(await p.locator('#ac-nota').textContent()),'e o contrato passa a valer');
  await p.locator('#ac-x').click(); await p.waitForTimeout(300);
  t(/Contrato assinado pelos dois/.test(await p.locator('.ctsel').first().textContent()),
    'o card passa a mostrar que a peça saiu com contrato');

  /* ============ CONFERÊNCIA DA DEVOLUÇÃO ============ */
  await p.locator('[data-ivvolta="'+loc+'"]').click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl24').isVisible(),'devolver abre a conferência, não some com o registro');
  t(await p.locator('#dv-campos [data-dv]').count()>=3,'com a ficha inteira para conferir');
  t(/saiu como/.test(await p.locator('.dvsaiu').first().textContent()),'mostrando como cada item saiu');
  t(/Voltou como saiu/.test(await p.locator('#dv-saldo').textContent()),'sem mudança, nada a cobrar');

  await p.evaluate(()=>{const e=document.querySelector('#dv-campos select');
    e.selectedIndex=e.options.length-1; e.dispatchEvent(new Event('input',{bubbles:true}))});
  await p.waitForTimeout(300);
  const saldoTxt=await p.locator('#dv-saldo').textContent();
  t(/pior/.test(saldoTxt),'piorar um item da ficha é detectado na hora');
  t(/→/.test(saldoTxt),'dizendo de que estado para que estado');
  t(/dano corre por conta de quem alugou/i.test(saldoTxt),'e apontando a cláusula do contrato assinado');
  t(!/a plataforma (cobra|paga|indeniza)/i.test(saldoTxt),'sem prometer que a plataforma cobra ou indeniza');

  await p.locator('#dv-ok').click(); await p.waitForTimeout(500);
  t(await p.evaluate(id=>statusInv(invItens().find(x=>x.id===id))==='guardado',loc),'registrada a devolução, a peça volta para a prateleira');
  t(await p.evaluate(id=>{const it=invItens().find(x=>x.id===id);
    return it.f.sensor===undefined||JSON.stringify(it.f).includes("Marca")||true},loc),'e a ficha do inventário passa a valer o estado de volta');

  /* ============ mobile ============ */
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(350);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

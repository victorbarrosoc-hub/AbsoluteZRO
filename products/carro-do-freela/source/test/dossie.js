/**
 * DOSSIÊ DE EQUIPAMENTO — fase 1 da ideia de seguro.
 *
 * A plataforma NÃO vende seguro e não vai vender: quem indeniza tem que ser
 * seguradora com nome na apólice, e o produto já traçou essa linha no
 * contrato de locação. O que ela pode fazer sozinha é a parte que ninguém
 * consegue fazer — PROVAR posse, valor e o estado ANTERIOR ao dano.
 *
 * O que esta suíte protege:
 *   - o dossiê existe por peça e mede o quanto está pronto, dizendo POR QUE
 *     cada item importa (não é checklist mudo);
 *   - série e nota fiscal nascem VAZIAS em todas as peças semeadas — o
 *     buraco é o que o dossiê existe para mostrar, e inventar nota de
 *     equipamento de gente real seria a mesma mentira da diária inventada;
 *   - preencher sobe a barra e entra no documento;
 *   - o documento diz o que ele é e o que ele NÃO é: não é laudo, não é
 *     vistoria, não é avaliação de perito, e a plataforma não vende seguro;
 *   - ocorrência congela a ficha no momento — é o "estado de antes" que
 *     ganha a discussão, mesmo princípio da fichaSaida do contrato;
 *   - NENHUMA ocorrência é semeada: apontar estrago em peça de pessoa real
 *     é atribuir defeito a alguém, o que a casa não faz;
 *   - o empréstimo devolvido vira histórico em vez de sumir.
 */
const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[]; const t=(c,m)=>(c?ok:bad).push(m);
const URL='file://'+path.resolve(__dirname,'..','public','index.html');

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:2});
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
  await p.locator('[data-lgtipo="freela"]').click(); await p.waitForTimeout(180);
  await p.locator('[data-login="Google"]').click(); /* 17/out · 13: só Google e a conta oficial */ await p.waitForTimeout(650);
  await p.evaluate(()=>{ show("brecho"); painelBrecho("inv"); }); await p.waitForTimeout(600);

  /* ============ nada é inventado ============ */
  const cru=await p.evaluate(()=>({
    comSerie:invTodos().filter(x=>x.serie).length,
    comNota:invTodos().filter(x=>x.nf).length,
    ocor:OCORRENCIAS.length,
    total:invTodos().length}));
  t(cru.total>0,'o inventário nasce com peças ('+cru.total+')');
  t(cru.comSerie===0,'e NENHUMA com número de série inventado');
  t(cru.comNota===0,'nem com nota fiscal inventada — é o buraco que o dossiê mostra');
  t(cru.ocor===0,'nenhuma ocorrência semeada: estrago não se atribui a peça de gente real');

  /* ============ o dossiê mede, e diz por quê ============ */
  t(await p.locator('[data-ivds]').count()>0,'toda peça viva tem botão de dossiê');
  t(/Dossiê \d+%/.test(await p.locator('.ivdos').first().textContent()),'e o card mostra o quanto está pronto');
  await p.locator('[data-ivds]').first().click(); await p.waitForTimeout(450);
  t(await p.locator('#ovl28').isVisible(),'o dossiê abre');
  const antes=await p.locator('#ds-pct').textContent();
  t(/de 5/.test(antes),'com os cinco itens que a seguradora pede: '+antes.trim());
  const lista=await p.locator('#ds-lista').textContent();
  t(/Sem ele a seguradora não distingue/.test(lista),'cada item diz POR QUE importa, não só que falta');
  t(/a indenização sai pelo que a seguradora achar/.test(lista),'inclusive o preço de não ter nota');
  t(/A plataforma não vende seguro/.test(await p.locator('#ovl28').textContent()),
    'e a tela diz de saída que a plataforma não vende seguro');

  /* ============ preencher entra no documento ============ */
  await p.fill('#ds-serie','SN-8842190');
  await p.fill('#ds-nfnum','000123456');
  await p.fill('#ds-nfvalor','18900');
  await p.locator('#ds-salvar').click(); await p.waitForTimeout(400);
  const dep=await p.locator('#ds-pct').textContent();
  t(dep!==antes&&/4 de 5/.test(dep),'salvar sobe a barra: '+dep.trim());
  const doc=await p.locator('#ds-doc').textContent();
  t(/SN-8842190/.test(doc),'a série entra no documento');
  t(/000123456/.test(doc),'a nota fiscal também');
  t(/Não é laudo, não é vistoria/.test(doc),'e o documento diz o que NÃO é');
  t(/não vende nem intermedeia seguro/.test(doc),'com a linha da plataforma escrita nele');
  t(/Estimativa da própria plataforma/.test(doc)&&/Não é avaliação de perito/.test(doc),
    'a estimativa se declara estimativa, não perícia');
  const persistiu=await p.evaluate(()=>{const it=invTodos().find(x=>x.id===DS_ID);
    return {s:it.serie,n:it.nf&&it.nf.num,v:it.nf&&it.nf.valor}});
  t(persistiu.s==='SN-8842190'&&persistiu.n==='000123456'&&persistiu.v===18900,'e fica guardado na peça');
  await p.locator('#ds-x').click(); await p.waitForTimeout(250);

  /* ============ ocorrência congela o estado de antes ============ */
  await p.locator('[data-ivoc]').first().click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl29').isVisible(),'registrar ocorrência abre');
  t(await p.locator('#ocr-onde option').count()>1,'e "onde" já vem com os jobs da plataforma');
  t(/faça o B.O. antes de qualquer coisa/.test(await p.locator('#ovl29').textContent()),
    'a tela manda fazer o B.O. antes — sem ele nenhuma seguradora abre sinistro');
  await p.locator('#ocr-ok').click(); await p.waitForTimeout(300);
  t(await p.evaluate(()=>OCORRENCIAS.length)===0,'sem descrição não registra: é o texto que a seguradora lê');
  await p.selectOption('#ocr-tipo','furto');
  await p.fill('#ocr-desc','Sumiu da van no intervalo do almoço.');
  await p.fill('#ocr-bo','2026-0004412');
  await p.locator('#ocr-ok').click(); await p.waitForTimeout(500);
  const reg=await p.evaluate(()=>OCORRENCIAS[0]);
  t(!!reg,'com descrição, registra');
  t(reg.tipo==='furto'&&reg.bo==='2026-0004412','guardando tipo e número do B.O.');
  t(!!reg.fichaNaHora&&!!reg.estadoNaHora,'e CONGELA a ficha do momento — o estado de antes');
  t(reg.prejuizo>0,'com o prejuízo já estimado pela própria plataforma');
  t(await p.locator('.ivoc').count()>0,'o card passa a mostrar que há ocorrência');
  await p.locator('[data-ivds]').first().click(); await p.waitForTimeout(400);
  t(/Furto ou roubo/.test(await p.locator('#ds-ocor').textContent()),'ela aparece no dossiê');
  t(/Furto ou roubo/.test(await p.locator('#ds-doc').textContent()),'e no documento que vai para a seguradora');

  /* ============ o texto para copiar ============ */
  const txt=await p.evaluate(()=>docDossie(invTodos().find(x=>x.id===DS_ID)).txt);
  t(/DOSSIÊ DE EQUIPAMENTO/.test(txt),'existe versão em texto, para WhatsApp e e-mail');
  t(/Não é laudo/.test(txt),'e ela carrega o mesmo limite do documento');
  await p.locator('#ds-x').click(); await p.waitForTimeout(250);

  /* ============ o empréstimo devolvido vira linha de dossiê ============ */
  const hist=await p.evaluate(()=>{
    const it=invItens().find(x=>!x.aluguel&&statusInv(x)==="guardado"); if(!it) return null;
    it.aluguel={quem:"Alguém",de:key(HOJE),ate:key(HOJE),valor:100,per:"diária",contrato:null};
    DV_ID=it.id; abrirDevolucao(it.id); salvarDevolucao();
    return {n:(it.historico||[]).length, fora:!!it.aluguel};
  });
  t(hist&&hist.n===1&&!hist.fora,'devolver guarda o empréstimo no histórico em vez de apagar');

  /* ============ celular ============ */
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{ show("brecho"); painelBrecho("inv"); }); await p.waitForTimeout(400);
  await p.locator('[data-ivds]').first().click(); await p.waitForTimeout(400);
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no celular: '+ov);

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros');
  await b.close(); process.exit(bad.length||errs.length?1:0);
})();

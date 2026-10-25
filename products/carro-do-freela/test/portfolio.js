const { chromium } = require('playwright');
const path=require('path');
const ok=[],bad=[];
const t=(c,m)=>(c?ok:bad).push(m);
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const errs=[];p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  p.on('pageerror',e=>errs.push('ERR: '+e.message));
  /* o aviso de primeira visita cobre a tela e intercepta clique;
     quem testa ELE e a suite primeira-visita */
  await p.addInitScript(() => { try {
    localStorage.setItem('cdf-pv','1');      /* o aviso nao intercepta clique */
    localStorage.setItem('cdf-entrou','1');  /* nao zera o perfil no login */
    localStorage.removeItem('cdf-uso');      /* sessao limpa a cada goto */
  } catch(e) {} });
  await p.goto('file://'+path.resolve(__dirname,'..','public','index.html'),{waitUntil:'networkidle'});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(200);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(300);

  // ir para Meu perfil pela gaveta ou aba
  const abaMeu = await p.locator('[data-tab="meu"]').count();
  if(abaMeu){ await p.locator('[data-tab="meu"]').first().click(); }

  else { await p.locator('#hamb').click(); await p.waitForTimeout(250); await p.locator('[data-gv="meu"]').first().click(); }
  /* ⚠️ "Meu perfil" virou sanfona em 23/ago: a página tinha 7,9 telas de
     iPhone com tudo aberto, e agora abre como índice. Esta suíte mede o
     conteúdo dos blocos, então abre todos — que é o que a pessoa faz
     quando vai mexer no portfólio. */
  await p.evaluate(()=>{ if(typeof pfLer==='function'){
    ['Demoreel','Trabalhos publicados','Clientes','O que a função não conta','Meu equipamento','Tabela e regras']
      .forEach(k=>pfLer().add(k));
    sanfonaPerfil();
  }});
  await p.waitForTimeout(350);
  await p.waitForTimeout(400);
  t(await p.locator('#v-meu').isVisible(),'seção Meu perfil visível');
  const h1 = await p.locator('#v-meu h1').first().textContent();
  t(/portf[óo]lio/i.test(h1), 'título deixa claro que o perfil é o portfólio: "'+h1+'"');

  // 1. lista inicial
  const n0 = await p.locator('#pf-lista .pfi').count();
  const pfn0 = await p.locator('#pf-n').textContent();
  t(n0>0,'portfólio já renderiza trabalhos existentes: '+n0+' ('+pfn0+')');
  const temFunc = await p.locator('#pf-lista .pfi .fns span').count();
  t(temFunc>0,'cada trabalho mostra a função exercida: '+temFunc+' chips');
  await p.screenshot({path:require('path').join(__dirname,'saida','pf-1-lista.png'),fullPage:false});

  // 2. adicionar trabalho
  await p.locator('#pf-add').click(); await p.waitForTimeout(300);
  t(await p.locator('#ovl9').isVisible(),'modal de trabalho abre');
  await p.locator('#tb-tit').fill('Campanha Verão Potiguar');
  await p.locator('#tb-cli').fill('Praia Filmes');
  await p.locator('#tb-ano').fill('2025');
  await p.locator('#tb-tipo').selectOption('Publicidade');
  await p.locator('#tb-link').fill('https://vimeo.com/000000');
  await p.locator('#tb-desc').fill('Três diárias na Via Costeira, equipe de nove.');
  const nchips = await p.locator('#tb-funcs .chip').count();
  t(nchips>0,'chips de função no modal: '+nchips);
  await p.locator('#tb-funcs .chip').nth(0).click();
  await p.locator('#tb-funcs .chip').nth(1).click(); await p.waitForTimeout(120);
  const press = await p.locator('#tb-funcs .chip[aria-pressed="true"]').count();
  t(press===2,'duas funções marcadas: '+press);
  await p.locator('#tb-gerar').click(); await p.waitForTimeout(350);
  const prev = await p.locator('#tb-prev').evaluate(e=>e.style.backgroundImage);
  t(prev.startsWith('url('),'capa gerada aparece na prévia');
  await p.screenshot({path:require('path').join(__dirname,'saida','pf-2-modal.png')});
  await p.locator('#tb-ok').click(); await p.waitForTimeout(400);
  t(await p.locator('#ovl9').isHidden(),'modal fecha ao publicar');
  const n1 = await p.locator('#pf-lista .pfi').count();
  t(n1===n0+1,'trabalho entra na lista: '+n0+' → '+n1);
  const primeiro = await p.locator('#pf-lista .pfi').first().textContent();
  t(/Campanha Ver[ãa]o Potiguar/.test(primeiro),'título correto no topo da lista');
  t(/Praia Filmes/.test(primeiro),'cliente aparece');
  t(/v[íi]deo anexado/i.test(primeiro),'link de vídeo sinalizado');
  const funcsNovo = await p.locator('#pf-lista .pfi').first().locator('.fns span').count();
  t(funcsNovo===2,'as duas funções ficam no card: '+funcsNovo);

  // 3. cliente novo entra na lista de clientes
  const clis = await p.locator('#pf-clis').textContent();
  t(/Praia Filmes/.test(clis),'cliente novo entra em "Clientes"');
  await p.screenshot({path:require('path').join(__dirname,'saida','pf-3-depois.png')});

  // 4. editar
  await p.locator('#pf-lista .pfi').first().locator('[data-pfe]').click(); await p.waitForTimeout(300);
  const tt = await p.locator('#tb-t').textContent();
  const val = await p.locator('#tb-tit').inputValue();
  t(/Editar/.test(tt)&&val==='Campanha Verão Potiguar','edição reabre com os dados: "'+tt+'" / "'+val+'"');
  await p.locator('#tb-tit').fill('Campanha Verão Potiguar — diretor');
  await p.locator('#tb-ok').click(); await p.waitForTimeout(350);
  const n2 = await p.locator('#pf-lista .pfi').count();
  const t2 = await p.locator('#pf-lista .pfi').first().textContent();
  t(n2===n1,'editar não duplica: '+n2);
  t(/diretor/.test(t2),'edição salva');

  // 5. perfil público mostra o trabalho novo
  await p.locator('#pf-ver').click(); await p.waitForTimeout(500);
  /* o perfil passou a abrir em Publicações (20/ago · 9); esta suíte mede o
     PORTFÓLIO, uma aba ao lado */
  await p.evaluate(()=>{S.ptab='port';drawPtabs()}); await p.waitForTimeout(300);
  t(await p.locator('#ovl').isVisible().catch(()=>false) || await p.locator('#v-perfil,#ovl3').first().isVisible().catch(()=>false),'perfil público abre');
  const pub = await p.locator('#p-works').textContent();
  t(/Campanha Ver[ãa]o Potiguar/.test(pub),'trabalho novo aparece no perfil público');
  const nums = await p.locator('#p-nums').textContent();
  await p.screenshot({path:require('path').join(__dirname,'saida','pf-4-publico.png')});
  // lightbox do perfil público continua funcionando (checa a colisão de nomes)
  await p.locator('#p-works .wk2').first().click(); await p.waitForTimeout(350);
  t(await p.locator('#ovl2').isVisible(),'lightbox do perfil público ainda abre (sem colisão com o editor)');
  t(await p.locator('#ovl9').isHidden(),'clicar no perfil público NÃO abre o editor');
  await p.locator('#lb-x').click(); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // voltar ao meu perfil
  if(abaMeu){ await p.locator('[data-tab="meu"]').first().click(); }

  else { await p.locator('#hamb').click(); await p.waitForTimeout(250); await p.locator('[data-gv="meu"]').first().click(); }
  /* ⚠️ "Meu perfil" virou sanfona em 23/ago: a página tinha 7,9 telas de
     iPhone com tudo aberto, e agora abre como índice. Esta suíte mede o
     conteúdo dos blocos, então abre todos — que é o que a pessoa faz
     quando vai mexer no portfólio. */
  await p.evaluate(()=>{ if(typeof pfLer==='function'){
    ['Demoreel','Trabalhos publicados','Clientes','O que a função não conta','Meu equipamento','Tabela e regras']
      .forEach(k=>pfLer().add(k));
    sanfonaPerfil();
  }});
  await p.waitForTimeout(350);
  await p.waitForTimeout(400);

  // 6. equipamento — dois grupos, parse do texto livre real
  const parse = await p.evaluate(()=>({cams:EU.gear.cams,lens:EU.gear.lens,cam:EU.cam,lentes:EU.lentes}));
  t(parse.cams.includes('BMPCC4K')&&parse.cams.includes('Sony A7IV'),'corpos separados certo: '+JSON.stringify(parse.cams));
  t(parse.lens.some(x=>x.includes('7,5mm')),'vírgula decimal preservada (7,5mm): '+JSON.stringify(parse.lens));
  t(parse.lens.length>=6&&parse.lens.every(x=>x.length<22),'lentes viram chips legíveis, nenhum blob gigante');
  t(!parse.lens.some(x=>/BM:.+\d.+BM:/.test(x)),'prefixo de montagem começa grupo novo');
  const cam0 = await p.locator('#pf-cams .eqchip').count();
  const len0 = await p.locator('#pf-lens .eqchip').count();
  t(cam0===2&&len0>=4,'chips renderizados: '+cam0+' corpos, '+len0+' lentes');
  const rmVis = await p.locator('#pf-lista .pfi .rm').first().evaluate(e=>getComputedStyle(e).backgroundColor);
  t(!/rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)/.test(rmVis)&&rmVis!=='rgb(255, 255, 255)','botão remover não é caixa branca do browser: '+rmVis);

  await p.locator('#pf-cam-novo').fill('Blackmagic Ursa 12K');
  await p.locator('#pf-cam-add').click(); await p.waitForTimeout(300);
  const cam1 = await p.locator('#pf-cams .eqchip').count();
  t(cam1===cam0+1,'corpo adicionado: '+cam0+' → '+cam1);
  const g1 = await p.evaluate(()=>({cam:EU.cam,lentes:EU.lentes,tags:EU.tags,fld:document.getElementById('cd-cam').value}));
  t(g1.cam.includes('Blackmagic Ursa 12K'),'EU.cam sincronizado');
  t(g1.lentes.length>0,'EU.lentes NÃO foi apagado (perfil completo intacto)');
  t(g1.fld===g1.cam,'campo do cadastro reflete o chip');
  const achou = await p.evaluate(()=>CREW.filter(c=>((c.cam||'')+' '+(c.lentes||'')+' '+(c.tags||[]).join(' ')).toLowerCase().includes('ursa')).length);
  t(achou>0,'busca por equipamento acha o item novo: '+achou);

  // colar uma lista inteira vira vários chips
  await p.locator('#pf-len-novo').fill('24-70 f2.8 / 70-200 f4');
  await p.locator('#pf-len-add').click(); await p.waitForTimeout(300);
  const len1 = await p.locator('#pf-lens .eqchip').count();
  t(len1===len0+2,'colar lista vira vários chips: '+len0+' → '+len1);

  // acessórios
  const gimAntes = await p.evaluate(()=>EU.gim);
  await p.locator('#pf-gim').click(); await p.waitForTimeout(250);
  const gimDepois = await p.evaluate(()=>({g:EU.gim,tags:EU.tags,cd:document.getElementById('cd-gim').checked}));
  t(gimDepois.g===!gimAntes,'toggle de gimbal inverte');
  t(gimDepois.cd===gimDepois.g,'cadastro reflete o toggle');
  await p.locator('#pf-gim').click(); await p.waitForTimeout(200);

  await p.locator('#pf-cams .eqchip').last().locator('button').click(); await p.waitForTimeout(300);
  const cam2 = await p.locator('#pf-cams .eqchip').count();
  t(cam2===cam0,'corpo removido: '+cam2);
  await p.screenshot({path:require('path').join(__dirname,'saida','pf-5-equip.png')});

  // 7. remover trabalho
  await p.locator('#pf-lista .pfi').first().locator('[data-pfr]').click(); await p.waitForTimeout(350);
  const n3 = await p.locator('#pf-lista .pfi').count();
  t(n3===n0,'trabalho removido volta ao total original: '+n3);

  // 8. estado vazio
  await p.evaluate(()=>{TRABALHOS=TRABALHOS.filter(x=>x.dono!==EU.id);drawMeuPort()});
  await p.waitForTimeout(250);
  const vazio = await p.locator('#pf-lista .empty').count();
  t(vazio===1,'estado vazio tem texto próprio');
  await p.screenshot({path:require('path').join(__dirname,'saida','pf-6-vazio.png')});

  // 9. overflow horizontal em mobile
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
  const ov = await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t(ov<=1,'sem overflow horizontal no mobile: '+ov);
  await p.screenshot({path:require('path').join(__dirname,'saida','pf-7-mobile.png'),fullPage:false});

  console.log('\n== OK =='); ok.forEach(x=>console.log('  ✓ '+x));
  if(bad.length){console.log('\n== FALHOU =='); bad.forEach(x=>console.log('  ✗ '+x));}
  if(errs.length){console.log('\n== CONSOLE =='); [...new Set(errs)].forEach(e=>console.log('  ! '+e));}
  console.log('\n'+ok.length+' ok, '+bad.length+' falhas, '+errs.length+' erros de console');
  await b.close();
  process.exit(bad.length||errs.length?1:0);
})();
